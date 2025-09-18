use std::{collections, fs::File, process::Output};
use tokio::sync::broadcast::{
  channel,
  error::{RecvError, SendError},
  Receiver, Sender,
};

use super::nodes::Complex;
use crate::language::{
  nodes::{Instance, NodeType},
  typing::{ArithmaticError, DataValue},
};

const CHANNEL_CAPACITY: usize = 16;

#[derive(Debug)]
pub enum EvalError {
  MathError(ArithmaticError),
  InvalidComplexNode(String),
  IoError(std::io::Error),
  ComplexNotFound(String),
  ChannelRecvErr(RecvError),
  ChannelSendErr(SendError<DataValue>),
}
impl From<ArithmaticError> for EvalError {
  fn from(value: ArithmaticError) -> Self {
    EvalError::MathError(value)
  }
}
impl From<std::io::Error> for EvalError {
  fn from(value: std::io::Error) -> Self {
    EvalError::IoError(value)
  }
}
impl From<RecvError> for EvalError {
  fn from(value: RecvError) -> Self {
    Self::ChannelRecvErr(value)
  }
}
impl From<SendError<DataValue>> for EvalError {
  fn from(value: SendError<DataValue>) -> Self {
    Self::ChannelSendErr(value)
  }
}

pub trait EvaluateIt {
  async fn evaluate(&self, inputs: Vec<DataValue>) -> Result<Vec<DataValue>, EvalError>;
}

pub struct Evaluator {
  complex_registry: std::collections::HashMap<String, Complex>,
  nodes: std::collections::HashMap<uuid::Uuid, ExecutionNode>,
}

struct ExecutionNode {
  pub id: uuid::Uuid,
  pub instance: Instance,
  pub inputs: Vec<Receiver<DataValue>>,
  pub outputs: Vec<Sender<DataValue>>,
}

impl ExecutionNode {
  pub async fn run(&mut self) -> Result<(), EvalError> {
    loop {
      let mut input_vec = Vec::new();
      for x in &mut self.inputs {
        input_vec.push(x.recv().await.map_err(|x| EvalError::from(x))?);
      }
      self
        .outputs
        .iter_mut()
        .zip(self.instance.node_type.evaluate(input_vec).await?.iter())
        .map(|(o, x)| o.send(x.clone()).map_err(EvalError::from)?);
    }
  }
  pub fn new(instance: Instance, inputs: &Vec<Sender<DataValue>>) -> Self {
    let mut outputs = Vec::new();
    for _ in &instance.outputs {
      let (x, _) = channel(CHANNEL_CAPACITY);
      outputs.push(x)
    }

    Self {
      id: uuid::Uuid::new_v4(),
      instance,
      inputs: inputs.iter().map(|x| x.subscribe()).collect(),
      outputs,
    }
  }
}

impl Evaluator {
  pub fn new(path: String) -> Result<Self, EvalError> {
    let mut complex_nodes = std::collections::HashMap::<String, Complex>::new();
    let mut path_vec = Vec::new();
    path_vec.push(path.clone());
    while !path_vec.is_empty() {
      let path = path_vec.pop().unwrap();
      let file = File::open(path.clone()).map_err(|x| EvalError::from(x))?;
      let complex = serde_json::from_reader::<File, Complex>(file)
        .map_err(|_| EvalError::InvalidComplexNode(path.to_owned()))?;
      for (_, x) in &complex.instances {
        if let NodeType::Complex(p) = &x.node_type {
          if !complex_nodes.contains_key(p) {
            path_vec.push(p.clone());
          }
        }
      }
      complex_nodes.insert(path.clone(), complex);
    }
    let top_node = &mut complex_nodes[&path];
  }

  pub fn spawn(&mut self, node: ExecutionNode) {
    let id = node.id.clone();
    self.nodes.insert(id.clone(), node);
    tokio::spawn(self.nodes[&id].run());
  }

  pub fn parse_complex(&mut self, path: String, inputs: &Vec<Sender<DataValue>>) {
    let complex = self.complex_registry[&path].clone();
    for (_, instance) in complex.instances {
      self.spawn(ExecutionNode::new(instance, inputs));
    }
  }
}
