use super::nodes::Instance;
use super::typing::{DataType, DataValue};
use crate::EvalError;
use std::cell::RefCell;
use std::collections::HashMap;
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
  pub nodes: HashMap<Uuid, ExecutionNode>,
}

pub type NodeConnection = (Uuid, usize); //(id, port)

pub struct ExecutionNode
{
  id: Uuid,
  instance: Instance,
  inputs: Vec<NodeConnection>,
  outputs: Vec<RwLock<Vec<Sender<Option<DataValue>>>>>,
  state: RefCell<NodeState>,
  handle: JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>,
  trigger: Notify,
}

impl ExecutionNode
{
  pub async fn run(&self, eval: Arc<Evaluator>) -> (Uuid, Result<Vec<DataValue>, EvalError>)
  {
    (self.id.clone(), self.process(eval).await)
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
    *self.state.borrow_mut() = NodeState::Closed;
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
    loop
    {
      //1
      self.trigger.notified().await;

      //2
      let mut inputs = Vec::with_capacity(self.inputs.len());
      for (id, port) in self.inputs
      {
        if let Some(node) = eval.nodes.get(&id)
        {
          // 2a_1, check state
          if *node.state.borrow() == NodeState::Closed
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
      *self.state.borrow_mut() = NodeState::Waiting;
    }
  }

  pub fn trigger_processing(&self)
  {
    if *self.state.borrow() == NodeState::Waiting
    {
      self.trigger.notify_waiters();
      *self.state.borrow_mut() = NodeState::Processing;
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
    self.trigger_processing();
    Ok(recv)
  }
}
