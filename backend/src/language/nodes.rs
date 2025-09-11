use crate::language::eval::{EvalError, EvaluateIt};

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
  outputs: Vec<uuid::Uuid>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Complex {
  inputs: Vec<DataType>,
  outputs: Vec<DataType>,
  start_node: uuid::Uuid,
  defaults: std::collections::HashMap<String, DataValue>,
  pub instances: std::collections::HashMap<uuid::Uuid, Instance>,
}

impl EvaluateIt for NodeType {
  fn evaluate(&self, inputs: Vec<DataValue>) -> Result<DataValue, EvalError> {
    match self {
      NodeType::Atomic(x) => Self::eval_atomic(x.clone(), inputs),
      NodeType::Complex(x) => todo!(),
    }
  }
}

impl NodeType {
  fn eval_atomic(atomic_type: AtomicType, inputs: Vec<DataValue>) -> Result<DataValue, EvalError> {
    match atomic_type {
      AtomicType::Print => {
        inputs.iter().for_each(|x| println!("{}", x));
        Ok(DataValue::None)
      }
      AtomicType::BinOp(atomic_bin_op) => Self::eval_bin_op(atomic_bin_op, inputs),
      AtomicType::Value(data_value) => Ok(data_value),
    }
  }

  fn eval_bin_op(
    atomic_bin_op: AtomicBinOp,
    inputs: Vec<DataValue>,
  ) -> Result<DataValue, EvalError> {
    assert!(inputs.len() == 2);
    match atomic_bin_op {
      AtomicBinOp::Add => Ok((inputs[0].clone() + inputs[1].clone())?),
      AtomicBinOp::Sub => Ok((inputs[0].clone() - inputs[1].clone())?),
      AtomicBinOp::Mul => Ok((inputs[0].clone() * inputs[1].clone())?),
      AtomicBinOp::Div => Ok((inputs[0].clone() / inputs[1].clone())?),
      AtomicBinOp::Mod => Ok((inputs[0].clone() % inputs[1].clone())?),
      AtomicBinOp::Pow => todo!(),
    }
  }
}

impl Instance {}
