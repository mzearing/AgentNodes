use super::{EvalError, EvaluateIt, Evaluator};
use crate::language::nodes::Instance;
use crate::language::typing::{DataType, DataValue};
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

pub type NodeConnection = (DataType, Uuid, usize); //(id, port)

// IMPORTANT, USE Uuid v5 SO ITS SCOPED
pub struct ExecutionNode
{
  pub(super) id: Uuid,
  instance: Instance,
  inputs: Vec<NodeConnection>,
  pub(super) outputs: Vec<RwLock<Vec<Sender<Option<DataValue>>>>>,
  pub(super) state: RwLock<NodeState>,
  trigger: Notify,
  stored_value: RwLock<Option<DataValue>>,
}

impl Clone for ExecutionNode
{
  fn clone(&self) -> Self
  {
    let mut outputs = Vec::new();
    outputs.resize_with(self.outputs.len(), || RwLock::new(Vec::new()));
    Self {
      id: self.id.clone(),
      instance: self.instance.clone(),
      inputs: self.inputs.clone(),
      outputs: outputs,
      state: RwLock::new(NodeState::Waiting),
      trigger: Notify::new(),
      stored_value: RwLock::new(None),
    }
  }
}

impl ExecutionNode
{
  async fn run(self: Arc<Self>, eval: Arc<Evaluator>) -> (Uuid, Result<Vec<DataValue>, EvalError>)
  {
    // println!("{}:{:?}", self.id, *self.state.read().await);
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

    while *(self.state.read().await) != NodeState::Closed
    {
      // let id = tokio::task::try_id().unwrap();
      // println!("{:?}", self.state.read().await);
      // println!("{} waiting for notif", tokio::task::try_id().unwrap());

      //1
      // println!("{id} step 1");
      self.trigger.notified().await;
      // println!("{} notified", tokio::task::try_id().unwrap());

      //2
      // println!("{id} step 2");
      let mut inputs = Vec::with_capacity(self.inputs.len());
      for (_, id, port) in &self.inputs
      {
        if let Some(node) = eval.nodes.get(&id)
        {
          // 2a_1, check state
          if *node.state.read().await == NodeState::Closed
          {
            self.broadcast_closed().await;
            // println!("2a_1");
            return Ok(vec![]);
          }
          // println!("{id} step 2b notify");
          let i = node.listen(port.clone()).await?.await?;

          // 2a_2, check if we got None, also signifying a close
          if i.is_none()
          {
            self.broadcast_closed().await;
            // println!("2a_2");
            return Ok(vec![]);
          }

          inputs.push(i.unwrap());
        }
      }

      // 3
      // println!("{id} step 3");
      let res = self
        .instance
        .node_type
        .evaluate(eval.clone(), self, inputs)
        .await;
      if let Ok(outputs) = res
      {
        // 4
        // println!("{id} step 4");
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
      // println!("{id} step 5");
      *self.state.write().await = NodeState::Waiting;
    }
    Ok(vec![])
  }

  pub async fn trigger_processing(&self)
  {
    // println!("{} triggered", self.id);
    if *self.state.read().await == NodeState::Waiting
    {
      // println!("{} notifying", self.id);
      self.trigger.notify_one();
      *self.state.write().await = NodeState::Processing;
    }
    // else
    // {
    //   println!("State: {:?}", self.state.read().await)
    // }
  }

  // triggers AND adds a listener, must do both simultaneously in hopes of not fucking up the order
  pub async fn listen(&self, port: usize) -> Result<Receiver<Option<DataValue>>, EvalError>
  {
    // println!("listen");
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
      stored_value: RwLock::new(None),
    }
  }

  pub async fn close(&self)
  {
    self.broadcast_closed().await;
  }

  pub async fn get_stored(&self) -> Option<DataValue>
  {
    self.stored_value.read().await.clone()
  }

  pub async fn set_stored(&self, val: DataValue) -> Option<DataValue>
  {
    let mut guard = self.stored_value.write().await;
    let ret = guard.clone();
    *guard = Some(val);
    ret
  }
}
