use super::nodes::Instance;
use super::typing::{DataType, DataValue};
use crate::language::nodes::Complex;
use crate::EvalError;
use std::collections::{HashMap, VecDeque};
use std::fs::File;
use std::pin::Pin;
use std::sync::Arc;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::oneshot::{channel, Receiver, Sender};
use tokio::sync::{Notify, RwLock};
use tokio::task::JoinHandle;
use uuid::Uuid;

pub trait Asyncio: AsyncRead + AsyncWrite + Send + Sync {}
impl<T> Asyncio for T where T: AsyncRead + AsyncWrite + Send + Sync {}
pub type IoObject = Pin<Box<dyn Asyncio>>;

pub trait AsyncClone
{
  async fn clone(&self) -> Self;
}

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
    let tid = current.id();
    if current.is_finished()
    {
      let ret = current.await;
      match ret
      {
        Ok((id, x)) =>
        {
          match x
          {
            Ok(v) => println!("Node {id} finished successfully with value(s) {:?}", v),
            Err(e) => println!("Node {id} failed with error {e:?}"),
          }
        }
        Err(e) => println!("Task TID{} join error {:?}", tid, e),
      }
    }
    else
    {
      tokio::task::yield_now().await;
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
  pub(self) nodes: HashMap<Uuid, Arc<ExecutionNode>>,
  complex_cache: RwLock<HashMap<String, Arc<Self>>>,
  parent: Option<Arc<Self>>,
  end_node: Option<Uuid>,
  inputs: RwLock<Vec<DataValue>>,
  pub(crate) my_path: String,
}

impl AsyncClone for Evaluator
{
  async fn clone(&self) -> Self
  {
    Self {
      scope_id: self.scope_id.clone(),
      nodes: self.nodes.clone(),
      complex_cache: RwLock::new(self.complex_cache.read().await.clone()),
      parent: self.parent.clone(),
      end_node: self.end_node.clone(),
      inputs: RwLock::new(Vec::new()),
      my_path: self.my_path.clone(),
    }
  }
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

impl Clone for ExecutionNode
{
  fn clone(&self) -> Self
  {
    Self {
      id: self.id.clone(),
      instance: self.instance.clone(),
      inputs: self.inputs.clone(),
      outputs: Vec::new(),
      state: RwLock::new(NodeState::Waiting),
      trigger: Notify::new(),
    }
  }
}

impl ExecutionNode
{
  async fn run(self: Arc<Self>, eval: Arc<Evaluator>) -> (Uuid, Result<Vec<DataValue>, EvalError>)
  {
    (self.id.clone(), self.process(eval).await)
  }

  pub fn spawn(
    self: Arc<Self>,
    eval: Arc<Evaluator>,
  ) -> JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>
  {
    tokio::spawn(self.run(eval))
  }

  async fn broadcast_closed(&self)
  {
    for x in &self.outputs
    {
      let mut guard = x.write().await;
      guard.drain(..).for_each(|s| {
        let _ = s.send(None);
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
      // println!("{} waiting for notif", tokio::task::try_id().unwrap());
      //1
      self.trigger.notified().await;
      // println!("{} notified", tokio::task::try_id().unwrap());

      //2
      let mut inputs = Vec::with_capacity(self.inputs.len());
      for (_, id, port) in &self.inputs
      {
        if let Some(node) = eval.nodes.get(&id)
        {
          // 2a_1, check state
          if *node.state.read().await == NodeState::Closed
          {
            self.broadcast_closed().await;
            return Ok(vec![]);
          }

          let i = node.listen(port.clone()).await?.await?;

          // 2a_2, check if we got None, also signifying a close
          if i.is_none()
          {
            self.broadcast_closed().await;
            return Ok(vec![]);
          }

          inputs.push(i.unwrap());
        }
      }

      // 3
      let res = self
        .instance
        .node_type
        .evaluate(eval.clone(), self, inputs)
        .await;
      if let Ok(outputs) = res
      {
        // 4
        for (socket, out) in self.outputs.iter().zip(outputs.iter())
        {
          socket.write().await.drain(..).for_each(|x| {
            let _ = x.send(Some(out.clone()));
          });
        }
      }
      else
      {
        self.broadcast_closed().await;
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
      // println!("notifying");
      self.trigger.notify_one();
      *self.state.write().await = NodeState::Processing;
    }
    // else
    // {
    //   println!("Already Processing")
    // }
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
    let mut outputs = Vec::with_capacity(instance.outputs.len());
    outputs.resize_with(instance.outputs.len(), || RwLock::new(Vec::new()));
    Self {
      id,
      instance,
      inputs,
      outputs,
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
  pub fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError>
  {
    let parent_id = parent.as_ref().map(|x| x.scope_id).unwrap_or(Uuid::nil());
    let scope_id = Uuid::new_v5(&parent_id, Uuid::new_v4().as_bytes());
    let file = File::open(&path)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|x| EvalError::InvalidComplexNode(path.clone(), x))?;

    //wow iterators are insane
    let nodes: HashMap<Uuid, Arc<ExecutionNode>> = me
      .instances
      .into_iter()
      .map(|(unscoped, instance)| {
        let scoped = Self::convert_id(&scope_id, unscoped);
        let inputs = instance
          .inputs
          .iter()
          .map(|(t, id, socket)| (t.clone(), Self::convert_id(&scope_id, id.clone()), *socket))
          .collect();

        let ex = Arc::new(ExecutionNode::new(scoped, instance, inputs));
        (scoped, ex)
      })
      .collect();

    Ok(Arc::new(Self {
      scope_id: scope_id.clone(),
      nodes,
      complex_cache: RwLock::new(HashMap::new()),
      parent,
      end_node: Some(Self::convert_id(&scope_id, me.end_node)),
      inputs: RwLock::new(Vec::new()),
      my_path: std::path::Path::new(&path)
        .parent()
        .map(|x| x.to_str().unwrap().to_string())
        .unwrap_or_default(),
    }))
  }

  fn convert_id(scope: &Uuid, unscoped: Uuid) -> Uuid
  {
    Uuid::new_v5(scope, unscoped.as_bytes())
  }

  async fn set_inputs(&self, inputs: Vec<DataValue>)
  {
    *self.inputs.write().await = inputs
  }

  pub async fn get_inputs(&self) -> Vec<DataValue>
  {
    self.inputs.read().await.clone()
  }

  pub async fn get_outputs(&self) -> Result<Vec<DataValue>, EvalError>
  {
    if let Some(end) = self.end_node.as_ref()
    {
      let node = self.nodes.get(end).ok_or(EvalError::NoEndNode)?;
      let mut out = Vec::with_capacity(node.outputs.len());
      for i in 0..node.outputs.len()
      {
        out.push(
          node
            .clone()
            .listen(i)
            .await?
            .await?
            .ok_or(EvalError::Closed)?,
        );
      }
      Ok(out)
    }
    else
    {
      Err(EvalError::NoEndNode)
    }
  }

  pub async fn shutdown(&self)
  {
    for node in self.nodes.values()
    {
      node.close().await;
    }
  }

  pub async fn instantiate(self: Arc<Self>, inputs: Vec<DataValue>) -> Arc<Self>
  {
    let instance = Arc::new((*self).clone().await);
    instance.set_inputs(inputs).await;
    let tasks = self
      .nodes
      .values()
      .map(|x| x.clone().spawn(instance.clone()))
      .collect();
    tokio::task::spawn(task_listen(instance.clone(), tasks));
    instance
  }

  pub async fn get_evaluator(&self, path: &str) -> Option<Arc<Self>>
  {
    if let Some(e) = self.complex_cache.read().await.get(path)
    {
      Some(e.clone())
    }
    else if let Some(p) = self.parent.as_ref()
    {
      let got = Box::pin(p.clone().get_evaluator(path)).await;
      if let Some(e) = &got
      {
        self
          .complex_cache
          .write()
          .await
          .insert(path.to_string(), e.clone());
      }
      got
    }
    else
    {
      None
    }
  }

  pub async fn add_evaluator(self: Arc<Self>, path: &str, eval: Arc<Self>)
  {
    self
      .complex_cache
      .write()
      .await
      .insert(path.to_string(), eval.clone());
    if let Some(p) = self.parent.as_ref()
    {
      Box::pin(p.clone().add_evaluator(path, eval)).await;
    }
  }
}
