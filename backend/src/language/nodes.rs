use super::typing::{DataType, DataValue};
use crate::ai::{AgentArgs, AgentType};
use crate::eval::{EvalError, NodeConnection};
use crate::eval::{EvaluateIt, Evaluator, ExecutionNode};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::ops::{BitAnd, BitOr, BitXor, Mul};
use std::sync::Arc;
use std::vec;
use tokio::io::{AsyncBufReadExt, BufReader};
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
  Variable(Variable, String),
  Io(AtomicIo),
  Cast(DataType),
  IsNone,
  LogicalOp(AtomicLogic),
  AgentOp(AgentOperation),
}
#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]

pub enum Variable
{
  Set,
  Get,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum AgentOperation
{
  Create(AgentType),
  Send,
  Recieve,
}

#[derive(Deserialize, Serialize, Debug, Clone, JsonSchema)]
pub enum ControlFlow
{
  Start,
  End,
  WaitForInit(NodeConnection),
  While(NodeConnection),
  If(NodeConnection),
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
  ConsoleInput,
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
  pub inputs: Vec<NodeConnection>,
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
    inputs: Vec<Option<DataValue>>,
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
        let unwrapped_inputs = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::ComplexWeakInput)?;
        if let Some(runner) = eval.get_complex_runner(&node.id).await
        {
          runner.send_inputs(unwrapped_inputs).await;
          runner.get_outputs().await
        }
        else
        {
          // println!("In complex eval");
          let rel = format!("{}{}{}", eval.my_path, std::path::MAIN_SEPARATOR, path);

          let opt_e = eval.get_evaluator(&rel).await;
          if let Some(e) = opt_e
          {
            let i = e.instantiate(unwrapped_inputs).await;
            eval.add_complex_runner(i.clone(), &node.id).await;
            i.get_outputs().await
          }
          else
          {
            let e = Evaluator::new(rel.clone(), Some(eval.clone()))?;
            eval.clone().add_evaluator(&rel, e.clone()).await;
            let i = e.instantiate(unwrapped_inputs).await;
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
    inputs: Vec<Option<DataValue>>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match atomic_type
    {
      AtomicType::Print =>
      {
        inputs.into_iter().for_each(|x| println!("{}", x.unwrap()));
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
        let unwrapped_inputs: Vec<DataValue> = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::IncorrectInputCount)?;
        if let (DataValue::String(pattern), DataValue::String(replace), DataValue::String(input)) = (
          &unwrapped_inputs[0],
          &unwrapped_inputs[1],
          &unwrapped_inputs[2],
        )
        {
          let regex = regex::Regex::new(&pattern).map_err(EvalError::from)?;
          let ret = regex.replace(input, replace).to_string();
          Ok(vec![DataValue::String(ret)])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: unwrapped_inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::String, DataType::String],
          })
        }
      }
      AtomicType::Io(io) => Self::eval_io(io, node, eval, inputs).await,
      AtomicType::Variable(action, name) => Self::eval_variable(eval, inputs, &name, action).await,
      AtomicType::Cast(to_type) =>
      {
        inputs
          .get(0)
          .ok_or(EvalError::IncorrectInputCount)?
          .clone()
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
      AtomicType::AgentOp(op) => Self::eval_agent(op, inputs, node, eval).await,
    }
  }

  fn eval_bin_op(
    atomic_bin_op: AtomicBinOp,
    inputs: Vec<Option<DataValue>>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    assert!(inputs.len() == 2);
    let unwrapped_inputs = inputs
      .into_iter()
      .collect::<Option<Vec<DataValue>>>()
      .ok_or(EvalError::IncorrectInputCount)?;
    match atomic_bin_op
    {
      AtomicBinOp::Add =>
      {
        Ok(vec![
          (unwrapped_inputs[0].clone() + unwrapped_inputs[1].clone())?,
        ])
      }
      AtomicBinOp::Sub =>
      {
        Ok(vec![
          (unwrapped_inputs[0].clone() - unwrapped_inputs[1].clone())?,
        ])
      }
      AtomicBinOp::Mul =>
      {
        Ok(vec![
          (unwrapped_inputs[0].clone() * unwrapped_inputs[1].clone())?,
        ])
      }
      AtomicBinOp::Div =>
      {
        Ok(vec![
          (unwrapped_inputs[0].clone() / unwrapped_inputs[1].clone())?,
        ])
      }
      AtomicBinOp::Mod =>
      {
        Ok(vec![
          (unwrapped_inputs[0].clone() % unwrapped_inputs[1].clone())?,
        ])
      }
      AtomicBinOp::Pow => Ok(vec![unwrapped_inputs[0].pow(&unwrapped_inputs[1])?]),
    }
  }

  async fn eval_control(
    control_flow: ControlFlow,
    eval: Arc<Evaluator>,
    node: &ExecutionNode,
    inputs: Vec<Option<DataValue>>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    match control_flow
    {
      ControlFlow::Start => Ok(eval.get_inputs().await),
      ControlFlow::End =>
      {
        let unwrapped_inputs = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::ComplexWeakInput)?;
        tokio::task::yield_now().await;
        Ok(unwrapped_inputs)
      }
      ControlFlow::While(end_node) =>
      {
        let unwrapped_inputs = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::IncorrectInputCount)?;
        if let DataValue::Boolean(cond) = unwrapped_inputs[0]
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
            got: unwrapped_inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Boolean],
          })
        }
      }
      ControlFlow::WaitForInit(initializer) =>
      {
        let unwrapped_inputs = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::IncorrectInputCount)?;
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
        if unwrapped_inputs[0] == DataValue::None
        {
          Ok(vec![])
        }
        else
        {
          Ok(unwrapped_inputs)
        }
      }
      ControlFlow::If(connection) =>
      {
        let unwrapped_inputs = inputs
          .into_iter()
          .collect::<Option<Vec<DataValue>>>()
          .ok_or(EvalError::IncorrectInputCount)?;
        if Some(DataValue::Boolean(true)) == unwrapped_inputs.get(0).cloned()
        {
          let end = eval.find_node(&connection.1)?;
          let _outputs: Vec<DataValue> = end
            .listen_all()
            .await
            .join_all()
            .await
            .into_iter()
            .map(|x| x.unwrap_or(DataValue::None))
            .collect();
        }
        Ok(vec![DataValue::None])
      }
    }
  }

  async fn eval_variable(
    eval: Arc<Evaluator>,
    inputs: Vec<Option<DataValue>>,
    name: &str,
    action: Variable,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    println!("{:?}: {}", action, name);
    match action
    {
      Variable::Set =>
      {
        if let Some(val) = inputs[0].clone()
        {
          eval.set_variable(name.to_string(), val).await;
        }
        Ok(vec![])
      }
      Variable::Get => Ok(vec![eval.get_variable(name).await]),
    }
  }
  async fn eval_io(
    io: AtomicIo,
    node: &ExecutionNode,
    eval: Arc<Evaluator>,
    inputs: Vec<Option<DataValue>>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    let unwrapped_inputs = inputs
      .into_iter()
      .collect::<Option<Vec<DataValue>>>()
      .ok_or(EvalError::IncorrectInputCount)?;
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
                let path = format!("{}", unwrapped_inputs[0]);
                eval
                  .register_io(Box::pin(tokio::fs::File::open(path).await?))
                  .await
              }
              IoType::TcpSocket =>
              {
                eval
                  .register_io(Box::pin(
                    tokio::net::TcpStream::connect(format!(
                      "{}:{}",
                      unwrapped_inputs[0], unwrapped_inputs[1]
                    ))
                    .await?,
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
        if let DataValue::Handle(handle) = unwrapped_inputs[0]
        {
          let bytes = eval.read_until(&handle, b"\n").await?;
          let s = String::from_utf8(bytes)?.trim_end_matches('\r').to_string();
          Ok(vec![DataValue::String(s)])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: vec![unwrapped_inputs[0].get_type()],
            expected: vec![DataType::Handle],
          })
        }
      }
      AtomicIo::Read =>
      {
        if let (DataValue::Handle(h), DataValue::Integer(size)) =
          (&unwrapped_inputs[0], &unwrapped_inputs[1])
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
            got: unwrapped_inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Handle, DataType::Integer],
          })
        }
      }
      AtomicIo::Write =>
      {
        if let (DataValue::String(s), DataValue::Handle(h)) =
          (&unwrapped_inputs[1], &unwrapped_inputs[0])
        {
          let mut bytes = s.bytes().collect();
          eval.write_bytes(h, &mut bytes).await?;
          Ok(vec![DataValue::None])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: unwrapped_inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Handle, DataType::String],
          })
        }
      }
      AtomicIo::ConsoleInput =>
      {
        let mut buf = String::new();
        BufReader::new(tokio::io::stdin())
          .read_line(&mut buf)
          .await
          .map_err(|x| EvalError::IoError(x))?;
        Ok(vec![DataValue::String(buf)])
      }
    }
  }

  async fn eval_unary(
    atomic_unary_op: AtomicUnaryOp,
    inputs: Vec<Option<DataValue>>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    let unwrapped_inputs = inputs
      .into_iter()
      .collect::<Option<Vec<DataValue>>>()
      .ok_or(EvalError::IncorrectInputCount)?;
    match atomic_unary_op
    {
      AtomicUnaryOp::Neg =>
      {
        let mut outputs = Vec::with_capacity(unwrapped_inputs.len());
        for x in unwrapped_inputs
          .into_iter()
          .map(|x| x.mul(DataValue::Integer(-1)))
        {
          outputs.push(x?);
        }
        Ok(outputs)
      }
    }
  }

  async fn eval_agent(
    agent_op: AgentOperation,
    inputs: Vec<Option<DataValue>>,
    node: &ExecutionNode,
    eval: Arc<Evaluator>,
  ) -> Result<Vec<DataValue>, EvalError>
  {
    let unwrapped_inputs = inputs
      .into_iter()
      .collect::<Option<Vec<DataValue>>>()
      .ok_or(EvalError::IncorrectInputCount)?;
    match agent_op
    {
      AgentOperation::Create(agent_type) =>
      {
        if let Some(agent) = node.get_stored().await
        {
          return Ok(vec![agent]);
        }

        if let Some(args) = AgentArgs::from_values(&unwrapped_inputs)
        {
          let ret = DataValue::Agent(
            agent_type.clone(),
            eval.register_agent(agent_type, args).await,
          );
          node.set_stored(ret.clone()).await;
          Ok(vec![ret])
        }
        else
        {
          todo!()
        }
      }
      AgentOperation::Send =>
      {
        let args = (
          unwrapped_inputs.get(0).cloned(),
          unwrapped_inputs.get(1).cloned(),
        );
        if let (Some(DataValue::Agent(_, id)), Some(DataValue::String(message))) = args
        {
          eval.agent_send_message(&id, message).await?;
          Ok(vec![DataValue::None])
        }
        else
        {
          Err(EvalError::IncorrectTyping {
            got: unwrapped_inputs.into_iter().map(|x| x.get_type()).collect(),
            expected: vec![DataType::Agent(AgentType::OpenAi), DataType::String],
          })
        }
      }
      AgentOperation::Recieve =>
      {
        if let Some(DataValue::Agent(_, id)) = unwrapped_inputs.get(0)
        {
          Ok(vec![eval
            .agent_get_last_message(id)
            .await?
            .and_then(|x| x.get_content())
            .map(|x| DataValue::String(x))
            .unwrap_or(DataValue::None)])
        }
        else
        {
          todo!()
        }
      }
    }
  }

  fn eval_logic(
    logical_op: AtomicLogic,
    inputs: Vec<Option<DataValue>>,
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

    let unwrapped_inputs = inputs
      .into_iter()
      .collect::<Option<Vec<DataValue>>>()
      .ok_or(EvalError::IncorrectInputCount)?;
    let mut bools = Vec::with_capacity(unwrapped_inputs.len());
    for res_bool in unwrapped_inputs.iter().cloned().map(|x| {
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
