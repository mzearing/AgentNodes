use std::{
  collections::{HashMap, VecDeque},
  fs::File,
  sync::Arc,
};
use tokio::sync::broadcast::{
  channel,
  error::{RecvError, SendError},
  Receiver, Sender,
};

use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use uuid::Uuid;

use super::nodes::Complex;
use crate::language::{
  nodes::Instance,
  typing::{ArithmaticError, DataType, DataValue},
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
  IncorrectTyping
  {
    got: Vec<DataType>,
    expected: Vec<DataType>,
  },
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
    Ok(())
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
}

impl Evaluator
{
  pub fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError>
  {
    let file = File::open(&path).map_err(EvalError::from)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|_| EvalError::InvalidComplexNode(path))?;

    let mut queue = VecDeque::new();
    let mut processed = HashMap::new();
    let mut keys = me.instances.keys().cloned().collect::<Vec<Uuid>>();
    keys.sort_by(|a, b| {
      me.instances[a]
        .inputs
        .len()
        .cmp(&me.instances[b].inputs.len())
    });

    queue.append(&mut keys.into());

    while !queue.is_empty()
    {
      let current = queue.pop_front().unwrap();
      let node = &me.instances[&current];
      let possible_sockets: Vec<(&DataType, Option<&ExecutionNode>, &usize)> = node
        .inputs
        .iter()
        .map(|(dtype, id, socket)| (dtype, processed.get(id), socket))
        .collect();
      if !possible_sockets.iter().all(|(_, x, _)| x.is_some())
      {
        queue.push_back(current);
        continue;
      }

      let sockets: Vec<(&DataType, &ExecutionNode, &usize)> = possible_sockets
        .into_iter()
        .map(|(dtype, node, index)| (dtype, node.unwrap(), index))
        .collect();

      let type_pairs: Vec<(DataType, DataType)> = sockets
        .iter()
        .map(|(e, node, index)| (node.instance.outputs[**index].clone(), (*e).clone()))
        .collect();

      if !type_pairs.iter().all(|(g, e)| g == e)
      {
        let (got, expected) = type_pairs.into_iter().unzip();
        return Err(EvalError::IncorrectTyping { got, expected });
      }

      let inputs: Vec<Sender<DataValue>> = sockets
        .iter()
        .map(|(_, node, index)| node.outputs[**index].clone())
        .collect();

      processed.insert(current, ExecutionNode::new(node.clone(), &inputs));
    }

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
