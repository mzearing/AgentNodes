use std::sync::Arc;

use crate::language::eval::{EvalError, EvaluateIt, Evaluator};

use super::typing::{DataType, DataValue};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum ControlFlow
{
  Start,
  End,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum AtomicType
{
  Print,
  Replace,
  BinOp(AtomicBinOp),
  Value(DataValue),
  Control(ControlFlow),
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
  pub outputs: Vec<DataType>,
  pub inputs: Vec<(DataType, uuid::Uuid, usize)>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct Complex
{
  pub inputs: Vec<DataType>,
  pub outputs: Vec<DataType>,
  defaults: std::collections::HashMap<String, DataValue>,
  pub instances: std::collections::HashMap<uuid::Uuid, Instance>,
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
      NodeType::Atomic(atomic_type) =>
      {
        Self::eval_atomic(atomic_type.clone(), eval.clone(), inputs).await
      }
      NodeType::Complex(path) =>
      {
        let rel = format!("{}{}{}", eval.my_path, std::path::MAIN_SEPARATOR, path);

        let opt_e = eval.get_evaluator(rel.clone()).await;
        if let Some(e) = opt_e
        {
          e.send_inputs(inputs)?;
          e.get_outputs().await
        }
        else
        {
          let e = Evaluator::new(rel.clone(), Some(eval.clone()))?;
          eval.add_evaluator(rel, e.clone()).await;
          e.send_inputs(inputs)?;
          e.get_outputs().await
        }
      }
    }
  }
}

impl NodeType
{
  async fn eval_atomic(
    atomic_type: AtomicType,
    eval: Arc<Evaluator>,
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
      AtomicType::Control(control_flow) => Self::eval_control(control_flow, eval, inputs).await,
      AtomicType::Replace =>
      {
        if inputs.len() != 3
        {
          return Err(EvalError::IncorrectInputCount);
        }

        if let (DataValue::String(pattern), DataValue::String(replace), DataValue::String(input)) =
          (&inputs[0], &inputs[1], &inputs[2])
        {
          let regex = regex::Regex::new(&pattern).map_err(EvalError::from)?;
          let ret = regex.replace(input, replace).to_string();
          Ok(vec![DataValue::String(ret)])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::String, DataType::String],
          })
        }
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
      AtomicBinOp::Pow => Ok(vec![inputs[0].pow(&inputs[1])?]),
    }
  }

  async fn eval_control(
    control_flow: ControlFlow,
    eval: Arc<Evaluator>,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match control_flow
    {
      ControlFlow::Start => eval.get_inputs().await,
      ControlFlow::End =>
      {
        eval.send_outputs(inputs).await?;
        Ok(vec![])
      }
    }
  }
}

impl Instance {}
