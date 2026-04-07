use super::{EvalError, EvaluateIt, Evaluator, Logger};
use crate::language::nodes::{AtomicType, ControlFlow, Instance, NodeType};
use crate::language::typing::{DataType, DataValue};
use crate::logging::node_state_logger::NodeStateLogger;
use serde::Serialize;
use std::ops::DerefMut;
use std::sync::Arc;
use tokio::sync::{Notify, RwLock};
use tokio::task::JoinHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub enum NodeState
{
  Processing,
  Waiting,
  Outputting,
  Closed,
}

pub type DataInputConnection = (DataType, Uuid, usize); //(type, id, port)
pub type OutputConnection = Uuid;

pub type ControlInputConnection = (Uuid, usize);
pub type ControlPort = Vec<(Uuid, usize)>;

// IMPORTANT, USE Uuid v5 SO ITS SCOPED
pub struct ExecutionNode
{
  pub(crate) id: Uuid,
  pub static_id: Uuid,
  pub(crate) instance: Instance,
  inputs: Vec<DataInputConnection>,
  pub(super) outputs: Vec<Uuid>,
  pub(super) state: RwLock<NodeState>,
  trigger: NotifyCounter<usize>,
  stored_value: RwLock<Option<DataValue>>,
  output_notify: NotifyCounter<usize>,
  current_values: RwLock<Vec<DataValue>>,
  custom_control: bool,
}

struct NotifyCounter<T>
{
  notif: Notify,
  counter: RwLock<T>,
  start_value: T,
  end_value: T,
  comp_pred: Box<dyn Fn(&T, &T) -> bool>,
  increment_pred: Box<dyn Fn(&mut T)>,
}

unsafe impl<T> Sync for NotifyCounter<T> {}
unsafe impl<T> Send for NotifyCounter<T> {}

impl<T> NotifyCounter<T>
where
  T: Clone,
{
  pub fn new<C, I>(start_value: T, end_value: T, increment_pred: I, comp_pred: C) -> Self
  where
    C: 'static + Fn(&T, &T) -> bool,
    I: 'static + Fn(&mut T),
  {
    Self {
      notif: Notify::const_new(),
      start_value: start_value.clone(),
      counter: RwLock::const_new(start_value),
      end_value,
      comp_pred: Box::new(comp_pred),
      increment_pred: Box::new(increment_pred),
    }
  }

  pub async fn increment(&self) -> bool
  {
    let mut guard = self.counter.write().await;
    self.increment_pred.call((guard.deref_mut(),));
    if self.comp_pred.call((&*guard, &self.end_value))
    {
      self.notif.notify_one();
      true
    }
    else
    {
      false
    }
  }

  pub async fn reset(&self)
  {
    *self.counter.write().await = self.start_value.clone();
  }
  pub async fn wait(&self)
  {
    if self.comp_pred.call((&self.start_value, &self.end_value))
    {
      return;
    }
    self.notif.notified().await
  }
}

fn get_counter(node_type: &NodeType, _control_flow: &Vec<ControlPort>) -> NotifyCounter<usize>
{
  match node_type
  {
    NodeType::Atomic(AtomicType::Control(ControlFlow::Start)) =>
    {
      NotifyCounter::new(0, 0, |x| *x += 1, PartialEq::eq)
    }
    _ => NotifyCounter::new(0, 1, |x| *x += 1, PartialEq::eq),
  }
}

impl Clone for ExecutionNode
{
  fn clone(&self) -> Self
  {
    Self {
      id: self.id.clone(),
      static_id: self.static_id.clone(),
      instance: self.instance.clone(),
      inputs: self.inputs.clone(),
      outputs: self.outputs.clone(),
      state: RwLock::new(NodeState::Waiting),
      trigger: get_counter(&self.instance.node_type, &self.instance.control_flow_in),
      stored_value: RwLock::new(None),
      output_notify: NotifyCounter::new(0, self.outputs.len(), |x| *x += 1, |a, b| a == b),
      current_values: RwLock::new(vec![]),
      custom_control: self.custom_control.clone(),
    }
  }
}

impl ExecutionNode
{
  async fn change_state<Tl, Nl>(&self, state: NodeState, eval: Arc<Evaluator<Tl, Nl>>)
  where
    Tl: Logger,
    Nl: Logger,
  {
    *self.state.write().await = state.clone();
    if let Some(logger) = &eval.node_logger
    {
      logger
        .log(&NodeStateLogger::node_string(
          self.static_id,
          state,
          self.instance.node_type.clone(),
        ))
        .await;
    }
  }

  async fn run<'a, Tl, Nl>(
    self: Arc<Self>,
    eval: Arc<Evaluator<Tl, Nl>>,
  ) -> (Uuid, Result<Vec<DataValue>, EvalError>)
  where
    Tl: Logger,
    Nl: Logger,
  {
    (self.id.clone(), self.process(eval).await)
  }

  pub fn spawn<'a, Tl, Nl>(
    self: Arc<Self>,
    eval: Arc<Evaluator<Tl, Nl>>,
  ) -> JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>
  where
    Tl: Logger,
    Nl: Logger,
  {
    tokio::spawn(self.run(eval))
  }

  async fn broadcast_closed(&self)
  {
    // for x in &self.outputs
    // {

    //   let mut guard = x.write().await;
    //   guard.drain(..).for_each(|s| {
    //     let _ = s.send(None);
    //   });
    // }
    // *self.state.write().await = NodeState::Closed;
  }

  async fn process<'a, Tl, Nl>(
    &self,
    eval: Arc<Evaluator<Tl, Nl>>,
  ) -> Result<Vec<DataValue>, EvalError>
  where
    Tl: Logger,
    Nl: Logger,
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

    /*
     * 1. Wait for all control_flow inputs
     * 2. Request data from upstream
     * 3. Process Data (node eval)
     *   a. node eval controls which control flow out gets triggered
     * 4. wait for all data to be retrieved
     */
    while *(self.state.read().await) != NodeState::Closed
    {
      // let id = tokio::task::try_id().unwrap();
      // println!("{:?}", self.state.read().await);
      // println!("{} waiting for notif", tokio::task::try_id().unwrap());

      //1
      // println!("{id} step 1");

      // println!(
      //   "Starting process for {} {:?}",
      //   self.static_id, self.instance.node_type
      // );
      self.trigger.wait().await;
      self.trigger.reset().await;
      // println!(
      //   "Finish trigger wait for {} {:?}",
      //   self.static_id, self.instance.node_type
      // );

      // println!("{} notified", tokio::task::try_id().unwrap());

      //2
      // println!("{id} step 2");
      let mut inputs = Vec::with_capacity(self.inputs.len());
      for (t, id, port) in &self.inputs
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
          inputs.push(node.get_output(*port).await);
        }
        else
        {
          self.broadcast_closed().await;
          return Ok(vec![]);
        }
      }

      // 5, outputs already drained, set back to waiting
      let res = self
        .instance
        .node_type
        .evaluate(eval.clone(), self, inputs)
        .await;
      if let Ok(outputs) = res
      {
        let mut guard = self.current_values.write().await;
        *guard = outputs;
      }
      else
      {
        self.broadcast_closed().await;
        return res;
      }

      if !self.custom_control
      {
        for i in 0..self.instance.control_flow_out.len()
        {
          self.trigger_connected(eval.clone(), i).await?;
        }
      }
      self.change_state(NodeState::Outputting, eval.clone()).await;
      self.output_notify.wait().await;
      self.output_notify.reset().await;
      self.change_state(NodeState::Waiting, eval.clone()).await;
    }
    Ok(vec![])
  }

  pub async fn trigger_processing<'a, Tl, Nl>(&self, eval: Arc<Evaluator<Tl, Nl>>)
  where
    Tl: Logger,
    Nl: Logger,
  {
    // println!("{} triggered", self.id);
    if *self.state.read().await == NodeState::Waiting
    {
      // println!("{} notifying", self.id);
      if self.trigger.increment().await
      {
        self.change_state(NodeState::Processing, eval.clone()).await;
      }
    }
  }

  pub fn new(
    static_id: Uuid,
    scoped_id: Uuid,
    instance: Instance,
    inputs: Vec<DataInputConnection>,
  ) -> Self
  {
    let outsize = instance.outputs.len();
    let outputs = instance.outputs.clone();
    Self {
      id: scoped_id,
      static_id,
      trigger: get_counter(&instance.node_type, &instance.control_flow_in),
      custom_control: match &instance.node_type
      {
        NodeType::Atomic(AtomicType::Control(ControlFlow::If)) => true,
        _ => false,
      },
      instance,
      inputs,
      outputs,
      state: RwLock::new(NodeState::Waiting),
      stored_value: RwLock::new(None),
      output_notify: NotifyCounter::new(0, outsize, |x| *x += 1, |a, b| a == b),
      current_values: RwLock::new(vec![]),
    }
  }

  pub async fn close(&self)
  {
    self.broadcast_closed().await;
  }

  pub async fn get_output(&self, port: usize) -> DataValue
  {
    let guard = self.current_values.read().await;
    let output = guard[port].clone();

    self.output_notify.increment().await;
    output
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

  pub async fn trigger_connected<'a, Tl, Nl>(
    &self,
    eval: Arc<Evaluator<Tl, Nl>>,
    port: usize,
  ) -> Result<(), EvalError>
  where
    Tl: Logger,
    Nl: Logger,
  {
    for (id, _) in &self.instance.control_flow_out[port]
    {
      let node = eval.find_node(id)?;
      node.trigger_processing(eval.clone()).await;
    }
    Ok(())
  }
}
