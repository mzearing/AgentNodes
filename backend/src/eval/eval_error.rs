use crate::{
  ai::AgentErr,
  language::typing::{ArithmaticError, DataType},
};
use std::string::FromUtf8Error;
use tokio::sync::oneshot::error::RecvError;
use uuid::Uuid;

#[allow(unused)]
#[derive(Debug)]
pub enum EvalError
{
  MathError(ArithmaticError),
  InvalidComplexNode(String, serde_json::Error),
  IoError(std::io::Error),
  ComplexNotFound(String),
  ChannelRecvErr(RecvError),
  IoNotFound(Uuid),
  AgentNotFound(Uuid),
  IncorrectTyping
  {
    got: Vec<DataType>,
    expected: Vec<DataType>,
  },
  IncorrectInputCount,
  RegexError(regex::Error),
  PatternNotFound(Uuid, Vec<u8>),
  InvalidUtf8(FromUtf8Error),
  PortOutOfBounds(usize),
  NodeNotFound(Uuid),
  CastError((DataType, DataType)),
  AgentErr(AgentErr),
  NoListeningNode,
  NoEndNode,
  Closed,
  ComplexWeakInput,
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

impl From<regex::Error> for EvalError
{
  fn from(value: regex::Error) -> Self
  {
    Self::RegexError(value)
  }
}
impl From<FromUtf8Error> for EvalError
{
  fn from(value: FromUtf8Error) -> Self
  {
    Self::InvalidUtf8(value)
  }
}

impl From<AgentErr> for EvalError
{
  fn from(value: AgentErr) -> Self
  {
    Self::AgentErr(value)
  }
}
