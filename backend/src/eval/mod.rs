mod eval_error;
mod evaluator;
mod execution_node;
mod waiters;
use crate::{language::typing::DataValue, logging::Logger};
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
  async fn evaluate<Tl, Nl>(
    &self,
    eval: Arc<Evaluator<Tl, Nl>>,
    node: &ExecutionNode,
    inputs: Vec<DataValue>,
  ) -> Result<Vec<DataValue>, EvalError>
  where
    Tl: Logger + Send + Sync + 'static,
    Nl: Logger + Send + Sync + 'static;
}
