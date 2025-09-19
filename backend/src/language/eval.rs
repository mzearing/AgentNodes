use std::{collections::HashMap, fs::File, sync::Arc};
use tokio::{
  sync::broadcast::{
    channel,
    error::{RecvError, SendError},
    Receiver, Sender,
  },
  task::{JoinHandle, JoinSet},
};

use tokio::sync::RwLock;

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
  ChannelSendSingleErr(SendError<DataValue>),
  ChannelSendVecErr(SendError<Vec<DataValue>>),
  IncorrectInputCount,
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
    Self::ChannelSendSingleErr(value)
  }
}
impl From<SendError<Vec<DataValue>>> for EvalError {
  fn from(value: SendError<Vec<DataValue>>) -> Self {
    Self::ChannelSendVecErr(value)
  }
}

pub trait EvaluateIt {
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>;
}

pub struct Evaluator {
  complex_registry: HashMap<String, Arc<Evaluator>>,
  parent: Option<Arc<Evaluator>>,
  nodes: RwLock<HashMap<uuid::Uuid, JoinHandle<Result<(), EvalError>>>>,
  outputs: RwLock<Sender<Vec<DataValue>>>,
  inputs: (Sender<Vec<DataValue>>, RwLock<Receiver<Vec<DataValue>>>),
  start_node: uuid::Uuid,
}

pub struct ExecutionNode {
  pub id: uuid::Uuid,
  pub instance: Instance,
  pub inputs: Vec<Receiver<DataValue>>,
  pub outputs: Vec<Sender<DataValue>>,
}

impl ExecutionNode {
  pub async fn run(mut self, eval: Arc<Evaluator>) -> Result<(), EvalError> {
    loop {
      let mut input_vec = Vec::new();
      for x in &mut self.inputs {
        input_vec.push(x.recv().await.map_err(|x| EvalError::from(x))?);
      }
      for (o, x) in self.outputs.iter_mut().zip(
        self
          .instance
          .node_type
          .evaluate(eval.clone(), input_vec)
          .await?
          .iter(),
      ) {
        o.send(x.clone()).map_err(EvalError::from)?;
      }
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

  pub fn new_incomplete(instance: Instance) -> Self {
    let mut outputs = Vec::new();
    for _ in &instance.outputs {
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

impl Evaluator {
  pub async fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError> {
    let mut complex_nodes = std::collections::HashMap::<String, Arc<Self>>::new();

    let file = File::open(path).map_err(EvalError::from)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|_| EvalError::InvalidComplexNode(path))?;
    let (s, r) = channel(CHANNEL_CAPACITY);

    let mut nstack = Vec::new();
    let mut exec_nodes = HashMap::new();

    for (id, instance) in me.instances {
      let inputs = Vec::new();
      inputs.resize_with(instance.inputs.len(), || None);
      exec_nodes.insert(id, (ExecutionNode::new_incomplete(instance), inputs));
    }

    for (id, instance) in me.instances {
      for i in 0..instance.outputs.len() {
        for j in 0..instance.outputs[i].len() {
          let conn_id = instance.outputs[i][j];
          let (current, _) = &exec_nodes[&conn_id];
          let (other, inputs) = &mut exec_nodes[&conn_id];
          inputs[j] = Some(current.outputs[j].subscribe());
        }
      }
    }

    for (_, (node, inputs)) in &mut exec_nodes {
      let mut actual_inputs = Vec::new();
      for i in inputs {
        actual_inputs.push(i.ok_or_else(|| EvalError::IncorrectInputCount)?);
      }
      node.inputs = actual_inputs;
    }

    let ret = Arc::new(Self {
      complex_registry: complex_nodes,
      nodes: RwLock::new(HashMap::new()),
      parent,
      outputs: RwLock::new(channel(CHANNEL_CAPACITY).0),
      inputs: (s, RwLock::new(r)),
    });

    ret.clone().parse_complex(path, &Vec::new()).await?;
    Ok(ret)
  }

  pub async fn spawn(self: Arc<Self>, node: ExecutionNode) {
    let id = node.id.clone();
    let mut guard = self.nodes.write().await;

    guard.insert(id.clone(), tokio::spawn(node.run(self.clone())));
  }

  pub async fn send_outputs(&self, outputs: Vec<DataValue>) -> Result<(), EvalError> {
    self
      .outputs
      .read()
      .await
      .send(outputs)
      .map_err(EvalError::from)?;
    Ok(())
  }
  pub async fn get_outputs(&self) -> Result<Vec<DataValue>, EvalError> {
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
