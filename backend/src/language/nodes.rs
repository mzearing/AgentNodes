use crate::language::eval::{EvalError, EvaluateIt, Evaluator};

use super::typing::{DataType, DataValue};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum AtomicType {
  Print,
  BinOp(AtomicBinOp),
  Value(DataValue),
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum AtomicBinOp {
  Add,
  Sub,
  Mul,
  Div,
  Pow,
  Mod,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum NodeType {
  Atomic(AtomicType),
  Complex(String),
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Instance {
  pub node_type: NodeType,
  default_overrides: std::collections::HashMap<String, DataValue>,
  pub outputs: Vec<Vec<uuid::Uuid>>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Complex {
  pub inputs: Vec<DataType>,
  pub outputs: Vec<DataType>,
  pub start_node: uuid::Uuid,
  defaults: std::collections::HashMap<String, DataValue>,
  pub instances: std::collections::HashMap<uuid::Uuid, Instance>,
}

impl Complex {
  pub fn get_child(&self, id: &uuid::Uuid) -> Option<&Instance> {
    self.instances.get(id)
  }
}

impl EvaluateIt for NodeType {
  fn evaluate(
    &self,
    eval: &Evaluator,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError> {
    match self {
      NodeType::Atomic(x) => Self::eval_atomic(x.clone(), inputs),
      NodeType::Complex(x) => eval
        .get_complex(&x)
        .map(|x| x.instances[&x.start_node].node_type.evaluate(eval, inputs))
        .ok_or(EvalError::ComplexNotFound(x.clone()))?,
    }
  }
}

impl NodeType {
  fn eval_atomic(
    atomic_type: AtomicType,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError> {
    match atomic_type {
      AtomicType::Print => {
        inputs.iter().for_each(|x| println!("{}", x));
        Ok(vec![])
      }
      AtomicType::BinOp(atomic_bin_op) => Self::eval_bin_op(atomic_bin_op, inputs),
      AtomicType::Value(data_value) => Ok(vec![data_value]),
    }
  }

  fn eval_bin_op(
    atomic_bin_op: AtomicBinOp,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError> {
    assert!(inputs.len() == 2);
    match atomic_bin_op {
      AtomicBinOp::Add => Ok(vec![(inputs[0].clone() + inputs[1].clone())?]),
      AtomicBinOp::Sub => Ok(vec![(inputs[0].clone() - inputs[1].clone())?]),
      AtomicBinOp::Mul => Ok(vec![(inputs[0].clone() * inputs[1].clone())?]),
      AtomicBinOp::Div => Ok(vec![(inputs[0].clone() / inputs[1].clone())?]),
      AtomicBinOp::Mod => Ok(vec![(inputs[0].clone() % inputs[1].clone())?]),
      AtomicBinOp::Pow => todo!(),
    }
  }
}

impl Instance {}
