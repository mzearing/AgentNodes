mod eval_error;
mod evaluator;
mod execution_node;
use crate::language::typing::DataValue;
pub use eval_error::*;
pub use evaluator::*;
pub use execution_node::*;
use std::{pin::Pin, sync::Arc};
use tokio::io::{AsyncRead, AsyncWrite};

pub trait Asyncio: AsyncRead + AsyncWrite + Send + Sync {}
impl<T> Asyncio for T where T: AsyncRead + AsyncWrite + Send + Sync {}
pub type IoObject = Pin<Box<dyn Asyncio>>;

pub trait AsyncClone
{
  async fn clone(&self) -> Self;
}

pub trait EvaluateIt
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>;
}
