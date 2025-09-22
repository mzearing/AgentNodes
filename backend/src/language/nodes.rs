use std::sync::Arc;

use crate::language::eval::{EvalError, EvaluateIt, Evaluator};

use super::typing::{DataType, DataValue};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum AtomicType
{
  Print,
  BinOp(AtomicBinOp),
  Value(DataValue),
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy)]
pub enum AtomicBinOp
{
  Add,
  Sub,
  Mul,
  Div,
  Pow,
  Mod,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum NodeType
{
  Atomic(AtomicType),
  Complex(String),
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Instance
{
  pub node_type: NodeType,
  default_overrides: std::collections::HashMap<String, DataValue>,
  pub outputs: Vec<Vec<uuid::Uuid>>,
  pub inputs: Vec<(DataType, uuid::Uuid)>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Complex
{
  pub inputs: Vec<DataType>,
  pub outputs: Vec<DataType>,
  pub start_node: uuid::Uuid,
  defaults: std::collections::HashMap<String, DataValue>,
  pub instances: std::collections::HashMap<uuid::Uuid, Instance>,
}

impl Complex
{
  pub fn get_child(&self, id: &uuid::Uuid) -> Option<&Instance>
  {
    self.instances.get(id)
  }
}

impl EvaluateIt for NodeType
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match self
    {
      NodeType::Atomic(atomic_type) => Self::eval_atomic(atomic_type.clone(), inputs).await,
      NodeType::Complex(path) =>
      {
        Evaluator::new(path.clone(), Some(eval.clone()))?
          .get_outputs()
          .await
      }
    }
  }
}

impl NodeType
{
  async fn eval_atomic(
    atomic_type: AtomicType,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match atomic_type
    {
      AtomicType::Print =>
      {
        inputs.iter().for_each(|x| println!("{}", x));
        tokio::task::yield_now().await;
        Ok(vec![])
      }
      AtomicType::BinOp(atomic_bin_op) =>
      {
        tokio::task::yield_now().await;
        Self::eval_bin_op(atomic_bin_op, inputs)
      }
      AtomicType::Value(data_value) =>
      {
        tokio::task::yield_now().await;
        Ok(vec![data_value])
      }
    }
  }

  fn eval_bin_op(
    atomic_bin_op: AtomicBinOp,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    assert!(inputs.len() == 2);
    match atomic_bin_op
    {
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
