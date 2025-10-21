use crate::language::{
  eval::{NodeInputs, NodeOutput, NodeState},
  typing::{ArithmaticError, DataType, DataValue},
};
use std::string::FromUtf8Error;
use tokio::sync::broadcast::error::{RecvError, SendError};
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
  ChannelSendSingleErr(SendError<(NodeState, DataValue)>),
  ChannelSendVecErr(SendError<NodeOutput>),
  ChannelSendInputs(SendError<NodeInputs>),
  IoNotFound(Uuid),
  IncorrectTyping
  {
    got: Vec<DataType>,
    expected: Vec<DataType>,
  },
  IncorrectInputCount,
  RegexError(regex::Error),
  PatternNotFound(Uuid, Vec<u8>),
  InvalidUtf8(FromUtf8Error),
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
impl From<SendError<(NodeState, DataValue)>> for EvalError
{
  fn from(value: SendError<(NodeState, DataValue)>) -> Self
  {
    Self::ChannelSendSingleErr(value)
  }
}
impl From<SendError<NodeOutput>> for EvalError
{
  fn from(value: SendError<NodeOutput>) -> Self
  {
    Self::ChannelSendVecErr(value)
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

impl From<SendError<NodeInputs>> for EvalError
{
  fn from(value: SendError<NodeInputs>) -> Self
  {
    Self::ChannelSendInputs(value)
  }
}
