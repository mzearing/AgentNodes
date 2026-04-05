use crate::language::nodes::NodeType;
use futures::{stream::FuturesUnordered, StreamExt};
use tokio::sync::Notify;

#[async_trait::async_trait]
pub trait Waiter
{
  async fn wait(&self, triggers: &Vec<Notify>);
}

pub struct AllWaiter;

#[async_trait::async_trait]
impl Waiter for AllWaiter
{
  async fn wait(&self, triggers: &Vec<Notify>)
  {
    for x in triggers
    {
      x.notified().await
    }
  }
}

pub struct OneWaiter;

#[async_trait::async_trait]
impl Waiter for OneWaiter
{
  async fn wait(&self, triggers: &Vec<Notify>)
  {
    let mut unordered: FuturesUnordered<_> = triggers.iter().map(|x| x.notified()).collect();
    unordered.next().await;
  }
}

pub fn get_waiter(node_type: &NodeType) -> Box<dyn Waiter>
{
  match node_type
  {
    _ => Box::new(OneWaiter),
  }
}
