use super::nodes::Instance;
use super::typing::{DataType, DataValue};
use crate::language::nodes::Complex;
use crate::EvalError;
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::oneshot::{channel, Receiver, Sender};
use tokio::sync::{Notify, RwLock};
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum NodeState
{
  Processing,
  Waiting,
  Closed,
}

async fn task_listen(
  eval: Arc<Evaluator>,
  tasks: Vec<JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>>,
) -> ()
{
  let mut tdeq = VecDeque::from(tasks);
  while !tdeq.is_empty()
  {
    let current = tdeq.pop_front().unwrap();
    if current.is_finished()
    {
      let tid = current.id();
      let ret = current.await;
      match ret
      {
        Ok((id, x)) =>
        {
          match x
          {
            Ok(v) => println!("Node {id} finished successfully with value(s) {:?}", v),
            Err(e) => todo!("Node {id} failed with error {e:?}"),
          }
        }
        Err(e) => println!("Task TID{} join error {:?}", tid, e),
      }
    }
    else
    {
      tdeq.push_back(current);
    }
  }
  println!("Evaluator with scope {} finished", eval.scope_id);
}

pub trait EvaluateIt
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>;
}

pub struct Evaluator
{
  pub scope_id: Uuid,
  pub(self) nodes: HashMap<Uuid, ExecutionNode>,
  complex_cache: HashMap<String, Arc<Self>>,
  parent: Option<Arc<Self>>,
  inputs: Vec<NodeConnection>,
  end_node: Option<Uuid>,
}

pub type NodeConnection = (DataType, Uuid, usize); //(id, port)

// IMPORTANT, USE Uuid v5 SO ITS SCOPED
pub struct ExecutionNode
{
  id: Uuid,
  instance: Instance,
  inputs: Vec<NodeConnection>,
  outputs: Vec<RwLock<Vec<Sender<Option<DataValue>>>>>,
  state: RwLock<NodeState>,
  trigger: Notify,
}

impl ExecutionNode
{
  async fn run(&self, eval: Arc<Evaluator>) -> (Uuid, Result<Vec<DataValue>, EvalError>)
  {
    (self.id.clone(), self.process(eval).await)
  }

  pub fn start(&self, eval: Arc<Evaluator>)
    -> JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>
  {
    tokio::spawn(self.run(eval))
  }

  async fn broadcast_closed(&self)
  {
    for x in &self.outputs
    {
      let mut guard = x.write().await;
      guard.drain(..).for_each(|s| {
        s.send(None);
      });
    }
    *self.state.write().await = NodeState::Closed;
  }

  async fn process(&self, eval: Arc<Evaluator>) -> Result<Vec<DataValue>, EvalError>
  {
    /*
     * Process:
     *  1. Wait for someone to ask for data so we arent just spinning
     *  2. Notify & send Listen request to all inputs
     *    2a. if any of them are closed, close down and send closed message to all listeners
     *  3. Run instance with gathered inputs
     *  4. Loop through all outputs and send to listeners
     *  5. clear the trigger and the listeners
     */
    while *self.state.read().await != NodeState::Closed
    {
      //1
      self.trigger.notified().await;

      //2
      let mut inputs = Vec::with_capacity(self.inputs.len());
      for (_, id, port) in self.inputs
      {
        if let Some(node) = eval.nodes.get(&id)
        {
          // 2a_1, check state
          if *node.state.read().await == NodeState::Closed
          {
            self.broadcast_closed();
            return Ok(vec![]);
          }

          let i = node.listen(port).await?.await?;

          // 2a_2, check if we got None, also signifying a close
          if i.is_none()
          {
            self.broadcast_closed();
            return Ok(vec![]);
          }

          inputs.push(i.unwrap());
        }
      }

      // 3
      let res = self.instance.node_type.evaluate(eval, self, inputs).await;
      if let Ok(outputs) = res
      {
        // 4
        for (socket, out) in self.outputs.iter().zip(outputs.iter())
        {
          socket.write().await.drain(..).for_each(|x| x.send(out));
        }
      }
      else
      {
        self.broadcast_closed();
        return res;
      }

      // 5, outputs already drained, set back to waiting
      *self.state.write().await = NodeState::Waiting;
    }
    Ok(vec![])
  }

  pub async fn trigger_processing(&self)
  {
    if *self.state.read().await == NodeState::Waiting
    {
      self.trigger.notify_waiters();
      *self.state.write().await = NodeState::Processing;
    }
  }

  // triggers AND adds a listener, must do both simultaneously in hopes of not fucking up the order
  pub async fn listen(&self, port: usize) -> Result<Receiver<Option<DataValue>>, EvalError>
  {
    if port >= self.outputs.len()
    {
      return Err(EvalError::PortOutOfBounds(port));
    }

    let (send, recv) = channel();
    self.outputs[port].write().await.push(send);
    self.trigger_processing().await;
    Ok(recv)
  }

  pub fn new(id: Uuid, instance: Instance, inputs: Vec<NodeConnection>) -> Self
  {
    Self {
      id,
      instance,
      inputs,
      outputs: Vec::new(),
      state: RwLock::new(NodeState::Waiting),
      trigger: Notify::new(),
    }
  }

  pub async fn close(&self)
  {
    self.broadcast_closed().await;
  }
}

impl Evaluator
{
  pub fn new(
    path: String,
    parent: Option<Arc<Self>>,
    inputs: Vec<NodeConnection>,
  ) -> Result<Arc<Self>, EvalError>
  {
    let parent_id = parent.as_ref().map(|x| x.scope_id).unwrap_or(Uuid::nil());
    let scope_id = Uuid::new_v5(&parent_id, Uuid::new_v4().as_bytes());
    let file = File::open(&path)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|x| EvalError::InvalidComplexNode(path.clone(), x))?;

    //wow iterators are insane
    let nodes: HashMap<Uuid, ExecutionNode> = me
      .instances
      .into_iter()
      .map(|(unscoped, instance)| {
        let scoped = Self::convert_id(&scope_id, unscoped);
        let inputs = instance
          .inputs
          .iter()
          .map(|(t, id, socket)| (t.clone(), Self::convert_id(&scope_id, id.clone()), *socket))
          .collect();
        let ex = ExecutionNode::new(scoped, instance, inputs);
        (scoped, ex)
      })
      .collect();

    let ret = Arc::new(Self {
      scope_id,
      nodes,
      complex_cache: HashMap::new(),
      parent,
      inputs,
      end_node: None,
    });
    let tasks = ret.nodes.values().map(|x| x.start(ret.clone())).collect();
    tokio::task::spawn(task_listen(ret.clone(), tasks));
    Ok(ret)
  }

  fn convert_id(scope: &Uuid, unscoped: Uuid) -> Uuid
  {
    Uuid::new_v5(scope, unscoped.as_bytes())
  }

  pub async fn shutdown(&self)
  {
    for node in self.nodes.values()
    {
      node.close().await;
    }
  }
}
