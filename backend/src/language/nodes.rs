use super::typing::{DataType, DataValue};
use crate::eval::EvalError;
use crate::eval::{EvaluateIt, Evaluator, ExecutionNode};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

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
  Variable(DataType),
  Io(AtomicIo),
}
#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum AtomicIo
{
  Open(IoType),
  Read,
  Write,
  GetLine,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub enum IoType
{
  File,
  TcpSocket,
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
  pub end_node: Uuid,
  defaults: std::collections::HashMap<String, DataValue>,
  pub instances: std::collections::HashMap<uuid::Uuid, Instance>,
}

impl EvaluateIt for NodeType
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match self
    {
      NodeType::Atomic(atomic_type) =>
      {
        Self::eval_atomic(atomic_type.clone(), eval.clone(), node, inputs).await
      }
      NodeType::Complex(path) =>
      {
        // println!("In complex eval");
        let rel = format!("{}{}{}", eval.my_path, std::path::MAIN_SEPARATOR, path);

        let opt_e = eval.get_evaluator(&rel).await;
        if let Some(e) = opt_e
        {
          let i = e.instantiate(inputs).await;
          let out = i.get_outputs().await;
          i.shutdown().await;
          // println!("Finished complex eval");
          out
        }
        else
        {
          let e = Evaluator::new(rel.clone(), Some(eval.clone()))?;
          eval.add_evaluator(&rel, e.clone()).await;
          let i = e.instantiate(inputs).await;
          let out = i.get_outputs().await;
          i.shutdown().await;
          // println!("Finished complex eval");
          out
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
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match atomic_type
    {
      AtomicType::Print =>
      {
        inputs.iter().for_each(|x| println!("{}", x));
        tokio::task::yield_now().await;
        Ok(vec![DataValue::None])
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
      AtomicType::Control(control_flow) =>
      {
        Self::eval_control(control_flow, eval, node, inputs).await
      }
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
      AtomicType::Io(io) => Self::eval_io(io, node, eval, inputs).await,
      AtomicType::Variable(_t) => Ok(vec![Self::eval_variable(node, inputs).await?]),
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
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match control_flow
    {
      ControlFlow::Start =>
      {
        todo!();
        // let inputs = eval.get_inputs().await?;
        // node.inputs_state = if inputs.iter().any(|x| x.0 == NodeState::Finished)
        // {
        //   NodeState::Finished
        // }
        // else
        // {
        //   NodeState::MoreData
        // };

        // Ok((node.inputs_state, inputs.into_iter().map(|x| x.1).collect()))
      }
      ControlFlow::End =>
      {
        tokio::task::yield_now().await;
        Ok(inputs)
      }
    }
  }

  async fn eval_variable(
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<DataValue, EvalError>
  {
    todo!();
    // if inputs.len() != 0
    // {
    //   let mut guard = node.stored_val.write().await;
    //   if inputs.len() == 1
    //   {
    //     (*guard) = Some(inputs[0].clone());
    //   }
    //   else
    //   {
    //     (*guard) = Some(DataValue::Array(inputs));
    //   }
    // }

    // match node.stored_val.read().await.as_ref()
    // {
    //   Some(x) => Ok(x.clone()),
    //   None => Ok(DataValue::None),
    // }
  }
  async fn eval_io(
    io: AtomicIo,
    node: &ExecutionNode,
    eval: Arc<Evaluator>,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match io
    {
      AtomicIo::Open(io_type) =>
      {
        let val = node.get_stored().await;
        match val
        {
          Some(x) => Ok(vec![x]),
          None =>
          {
            let handle = match io_type
            {
              IoType::File =>
              {
                let path = format!("{}", inputs[0]);
                eval
                  .register_io(Box::pin(tokio::fs::File::open(path).await?))
                  .await
              }
              IoType::TcpSocket =>
              {
                eval
                  .register_io(Box::pin(
                    tokio::net::TcpStream::connect(format!("{}:{}", inputs[0], inputs[1])).await?,
                  ))
                  .await
              }
            };
            node.set_stored(DataValue::Handle(handle.clone())).await;
            Ok(vec![DataValue::Handle(handle)])
          }
        }
      }
      AtomicIo::GetLine =>
      {
        if let DataValue::Handle(handle) = inputs[0]
        {
          let bytes = eval.read_until(&handle, b"\n").await?;
          let s = String::from_utf8(bytes)?.trim_end_matches('\r').to_string();
          Ok(vec![DataValue::String(s)])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: vec![inputs[0].get_type()],
            expected: vec![DataType::Handle],
          })
        }
      }
      AtomicIo::Read =>
      {
        if let (DataValue::Handle(h), DataValue::Integer(size)) = (&inputs[0], &inputs[1])
        {
          let mut buf = Vec::new();
          buf.resize(*size as usize, 0);
          let count = eval.read_bytes(h, &mut buf).await?;
          buf.resize(count, 0);
          Ok(vec![DataValue::Array(
            buf.into_iter().map(|x| DataValue::Byte(x)).collect(),
          )])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Handle, DataType::Integer],
          })
        }
      }
      AtomicIo::Write =>
      {
        if let (DataValue::String(s), DataValue::Handle(h)) = (&inputs[1], &inputs[0])
        {
          let mut bytes = s.bytes().collect();
          eval.write_bytes(h, &mut bytes).await?;
          Ok(vec![DataValue::None])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Handle, DataType::String],
          })
        }
      }
    }
  }
}

impl Instance {}
