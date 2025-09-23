use std::{collections::HashMap, fs::File, sync::Arc};
use tokio::sync::broadcast::{
  channel,
  error::{RecvError, SendError},
  Receiver, Sender,
};

use tokio::sync::RwLock;
use tokio::task::JoinHandle;

use super::nodes::Complex;
use crate::language::{
  nodes::Instance,
  typing::{ArithmaticError, DataValue},
};

const CHANNEL_CAPACITY: usize = 16;

#[derive(Debug)]
pub enum EvalError
{
  MathError(ArithmaticError),
  InvalidComplexNode(String),
  IoError(std::io::Error),
  ComplexNotFound(String),
  ChannelRecvErr(RecvError),
  ChannelSendSingleErr(SendError<DataValue>),
  ChannelSendVecErr(SendError<Vec<DataValue>>),
  IncorrectInputCount,
}
impl From<ArithmaticError> for EvalError
{
  fn from(value: ArithmaticError) -> Self
  {
    EvalError::MathError(value)
  }
}
impl From<std::io::Error> for EvalError
{
  fn from(value: std::io::Error) -> Self
  {
    EvalError::IoError(value)
  }
}
impl From<RecvError> for EvalError
{
  fn from(value: RecvError) -> Self
  {
    Self::ChannelRecvErr(value)
  }
}
impl From<SendError<DataValue>> for EvalError
{
  fn from(value: SendError<DataValue>) -> Self
  {
    Self::ChannelSendSingleErr(value)
  }
}
impl From<SendError<Vec<DataValue>>> for EvalError
{
  fn from(value: SendError<Vec<DataValue>>) -> Self
  {
    Self::ChannelSendVecErr(value)
  }
}

pub trait EvaluateIt
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>;
}

pub struct Evaluator
{
  complex_registry: HashMap<String, Arc<Evaluator>>,
  parent: Option<Arc<Evaluator>>,
  outputs: RwLock<Sender<Vec<DataValue>>>,
  inputs: (Sender<Vec<DataValue>>, RwLock<Receiver<Vec<DataValue>>>),
}

pub async fn log_task(mut tasks: Vec<JoinHandle<Result<(), EvalError>>>)
{
  while !tasks.is_empty()
  {
    let current = tasks.pop().unwrap();
    let id = current.id();
    if current.is_finished()
    {
      let ret = current.await;
      match ret
      {
        Ok(Err(e)) => println!("Task {id} finished with EvalError {:?}", e),
        Ok(_) => println!("Task {id} finished successfully"),
        Err(e) => println!("Task {id} join error {:?}", e),
      }
    }
    else
    {
      tasks.push(current);
      tokio::task::yield_now().await;
    }
  }
}

pub struct ExecutionNode
{
  pub id: uuid::Uuid,
  pub instance: Instance,
  pub inputs: Vec<Receiver<DataValue>>,
  pub outputs: Vec<Sender<DataValue>>,
}

impl ExecutionNode
{
  pub async fn run(mut self, eval: Arc<Evaluator>) -> Result<(), EvalError>
  {
    loop
    {
      let mut input_vec = Vec::new();
      for x in &mut self.inputs
      {
        let mut r = x.recv().await;
        while let Err(RecvError::Lagged(_)) = r
        {
          r = x.recv().await;
        }
        input_vec.push(r.map_err(|x| EvalError::from(x))?);
      }
      for (o, x) in self.outputs.iter_mut().zip(
        self
          .instance
          .node_type
          .evaluate(eval.clone(), input_vec)
          .await?
          .iter(),
      )
      {
        o.send(x.clone()).map_err(EvalError::from)?;
      }
    }
  }
  pub fn new(instance: Instance, inputs: &Vec<Sender<DataValue>>) -> Self
  {
    let mut outputs = Vec::new();
    outputs.resize_with(instance.outputs.len(), || channel(CHANNEL_CAPACITY).0);

    Self {
      id: uuid::Uuid::new_v4(),
      instance,
      inputs: inputs.iter().map(|x| x.subscribe()).collect(),
      outputs,
    }
  }

  pub fn new_incomplete(instance: Instance) -> Self
  {
    let mut outputs = Vec::new();
    for _ in &instance.outputs
    {
      let (x, _) = channel(CHANNEL_CAPACITY);
      outputs.push(x)
    }
    Self {
      id: uuid::Uuid::new_v4(),
      instance,
      inputs: Vec::new(),
      outputs,
    }
  }
}

impl Evaluator
{
  pub fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError>
  {
    let file = File::open(&path).map_err(EvalError::from)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|_| EvalError::InvalidComplexNode(path))?;

    let mut nstack = Vec::new();
    let mut processed = HashMap::new();
    nstack.append(
      &mut me.instances[&me.start_node]
        .outputs
        .iter()
        .flatten()
        .collect::<Vec<&uuid::Uuid>>(),
    );
    processed.insert(
      me.start_node,
      ExecutionNode::new(me.instances[&me.start_node].clone(), &Vec::new()),
    );

    while !nstack.is_empty()
    {
      let current = nstack.pop().unwrap();
      let node = &me.instances[current];
      let mut inputs = Vec::new();
      inputs.resize_with(node.inputs.len(), || None);
      let mut cont = false;

      for (i, (_, input)) in node.inputs.iter().enumerate()
      {
        if let Some(x) = processed.get(input)
        {
          inputs[i] = Some(x.outputs[i].clone());
        }
        else
        {
          nstack.push(current);
          cont = true;
          break;
        }
      }

      if cont
      {
        continue;
      }

      processed.insert(
        *current,
        ExecutionNode::new(
          node.clone(),
          &inputs.iter().map(|x| x.clone().unwrap()).collect(),
        ),
      );
      nstack.append(&mut node.outputs.iter().flatten().collect::<Vec<&uuid::Uuid>>());
    }

    // todo!();
    let (s, r) = channel(CHANNEL_CAPACITY);
    let ret = Arc::new(Self {
      complex_registry: HashMap::new(),
      parent,
      outputs: RwLock::new(channel(CHANNEL_CAPACITY).0),
      inputs: (s, RwLock::new(r)),
    });

    let mut tasks = Vec::new();

    for (_, x) in processed.into_iter()
    {
      tasks.push(tokio::spawn(x.run(ret.clone())));
    }

    tokio::spawn(log_task(tasks));

    Ok(ret)
  }

  pub async fn send_outputs(&self, outputs: Vec<DataValue>) -> Result<(), EvalError>
  {
    self
      .outputs
      .read()
      .await
      .send(outputs)
      .map_err(EvalError::from)?;
    Ok(())
  }
  pub async fn get_outputs(&self) -> Result<Vec<DataValue>, EvalError>
  {
    self
      .outputs
      .read()
      .await
      .subscribe()
      .recv()
      .await
      .map_err(EvalError::from)
  }
}
