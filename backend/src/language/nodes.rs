use super::typing::{DataType, DataValue};
use crate::eval::{AsyncClone, EvalError, NodeConnection};
use crate::eval::{EvaluateIt, Evaluator, ExecutionNode};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::ops::{BitAnd, BitOr, BitXor, Mul};
use std::sync::Arc;
use std::vec;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum AtomicType
{
  Print,
  Replace,
  BinOp(AtomicBinOp),
  UnaryOp(AtomicUnaryOp),
  Value(DataValue),
  Control(ControlFlow),
  Variable(NodeConnection),
  Io(AtomicIo),
  Cast(DataType),
  IsNone,
  LogicalOp(AtomicLogic),
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum ControlFlow
{
  Start,
  End,
  WaitForInit(NodeConnection),
  While(NodeConnection),
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, JsonSchema)]
pub enum AtomicLogic
{
  And,
  Or,
  Xor,
  Not,
  Eq,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum AtomicIo
{
  Open(IoType),
  Read,
  Write,
  GetLine,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum IoType
{
  File,
  TcpSocket,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, JsonSchema)]
pub enum AtomicBinOp
{
  Add,
  Sub,
  Mul,
  Div,
  Pow,
  Mod,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum AtomicUnaryOp
{
  Neg,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum NodeType
{
  Atomic(AtomicType),
  Complex(String),
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub struct Instance
{
  pub node_type: NodeType,
  default_overrides: std::collections::HashMap<String, DataValue>,
  pub outputs: Vec<DataType>,
  pub inputs: Vec<(DataType, uuid::Uuid, usize)>,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
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
        if let Some(runner) = eval.get_complex_runner(&node.id).await
        {
          runner.send_inputs(inputs).await;
          runner.get_outputs().await
        }
        else
        {
          // println!("In complex eval");
          let rel = format!("{}{}{}", eval.my_path, std::path::MAIN_SEPARATOR, path);

          let opt_e = eval.get_evaluator(&rel).await;
          if let Some(e) = opt_e
          {
            let i = e.instantiate(inputs).await;
            eval.add_complex_runner(i.clone(), &node.id).await;
            i.get_outputs().await
          }
          else
          {
            let e = Evaluator::new(rel.clone(), Some(eval.clone()))?;
            eval.clone().add_evaluator(&rel, e.clone()).await;
            let i = e.instantiate(inputs).await;
            eval.add_complex_runner(i.clone(), &node.id).await;
            i.get_outputs().await
          }
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
      AtomicType::Variable(connection) =>
      {
        Ok(vec![Self::eval_variable(node, eval, connection).await?])
      }
      AtomicType::Cast(to_type) =>
      {
        inputs
          .get(0)
          .ok_or(EvalError::IncorrectInputCount)?
          .try_cast(to_type)
          .map(|x| vec![x])
          .map_err(|t| EvalError::CastError(t))
      }
      AtomicType::UnaryOp(unop) =>
      {
        tokio::task::yield_now().await;
        Self::eval_unary(unop, inputs).await
      }
      AtomicType::LogicalOp(logic_op) =>
      {
        tokio::task::yield_now().await;
        Self::eval_logic(logic_op, inputs)
      }
      AtomicType::IsNone =>
      {
        if inputs.len() != 1
        {
          return Err(EvalError::IncorrectInputCount);
        }
        tokio::task::yield_now().await;
        Ok(vec![DataValue::Boolean(inputs[0].is_none())])
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
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match control_flow
    {
      ControlFlow::Start => Ok(eval.get_inputs().await),
      ControlFlow::End =>
      {
        tokio::task::yield_now().await;
        Ok(inputs)
      }
      ControlFlow::While(end_node) =>
      {
        if let DataValue::Boolean(cond) = inputs[0]
        {
          if cond
          {
            let end = eval.find_node(&end_node.1)?;
            let _outputs: Vec<DataValue> = end
              .listen_all()
              .await
              .join_all()
              .await
              .into_iter()
              .map(|x| x.unwrap_or(DataValue::None))
              .collect();
            // dbg!(_outputs);
            node.trigger_processing().await;
            Ok(vec![])
          }
          else
          {
            Ok(vec![DataValue::None])
          }
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Boolean],
          })
        }
      }
      ControlFlow::WaitForInit(initializer) =>
      {
        if node.get_stored().await.is_none()
        {
          let v = eval
            .find_node(&initializer.1)?
            .listen_all()
            .await
            .join_all()
            .await;
          node.set_stored(DataValue::Boolean(true)).await;
          return Ok(
            v.into_iter()
              .map(|x| x.unwrap_or(DataValue::None))
              .collect(),
          );
        }
        if inputs[0] == DataValue::None
        {
          Ok(vec![])
        }
        else
        {
          Ok(inputs)
        }
      }
    }
  }

  async fn eval_variable(
    node: &ExecutionNode,
    eval: Arc<Evaluator>,
    connection: NodeConnection,
  ) -> Result<DataValue, EvalError>
  {
    if !node.channel_exists().await
    {
      let conn_node = eval.find_node(&connection.1)?;
      node
        .channel_set(conn_node.weak_listen(connection.2).await?)
        .await;
    }

    if node.channel_data_ready().await
    {
      if let Some(x) = node.channel_read_data().await?
      {
        node.set_stored(x).await;
      }
      node
        .channel_set(
          eval
            .find_node(&connection.1)?
            .weak_listen(connection.2)
            .await?,
        )
        .await;
    }
    if let Some(v) = node.get_stored().await
    {
      // if let DataValue::String(s) = &v
      // {
      //   println!("{:?}", s);
      // }
      Ok(v)
    }
    else
    {
      Ok(DataValue::None)
    }
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

  async fn eval_unary(
    atomic_unary_op: AtomicUnaryOp,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match atomic_unary_op
    {
      AtomicUnaryOp::Neg =>
      {
        let mut outputs = Vec::with_capacity(inputs.len());
        for x in inputs.into_iter().map(|x| x.mul(DataValue::Integer(-1)))
        {
          outputs.push(x?);
        }
        Ok(outputs)
      }
    }
  }

  fn eval_logic(
    logical_op: AtomicLogic,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    if logical_op == AtomicLogic::Eq
    {
      if inputs.len() != 2
      {
        return Err(EvalError::IncorrectInputCount);
      }
      else
      {
        return Ok(vec![DataValue::Boolean(inputs[0] == inputs[1])]);
      }
    }

    let mut bools = Vec::with_capacity(inputs.len());
    for res_bool in inputs.iter().cloned().map(|x| {
      x.try_cast(DataType::Boolean)
        .map_err(|e| EvalError::CastError(e))
    })
    {
      if let DataValue::Boolean(b) = res_bool?
      {
        bools.push(b);
      }
      else
      {
        panic!("This should never happen!! (eval_logic)")
      }
    }

    match logical_op
    {
      AtomicLogic::And =>
      {
        Ok(vec![DataValue::Boolean(
          bools
            .into_iter()
            .reduce(|acc, next| acc.bitand(next))
            .unwrap(),
        )])
      }
      AtomicLogic::Or =>
      {
        Ok(vec![DataValue::Boolean(
          bools
            .into_iter()
            .reduce(|acc, next| acc.bitor(next))
            .unwrap(),
        )])
      }
      AtomicLogic::Xor =>
      {
        Ok(vec![DataValue::Boolean(
          bools
            .into_iter()
            .reduce(|acc, next| acc.bitxor(next))
            .unwrap(),
        )])
      }
      AtomicLogic::Not => Ok(bools.into_iter().map(|x| DataValue::Boolean(!x)).collect()),
      AtomicLogic::Eq =>
      {
        todo!()
      }
    }
  }
}

impl Instance {}
