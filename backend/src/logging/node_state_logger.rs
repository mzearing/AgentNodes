use crate::eval::NodeState;
use crate::language::nodes::NodeType;
use crate::logging::Logger;
use futures::{Sink, SinkExt};
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;
use tokio_websockets::{Message, WebSocketStream};
use uuid::Uuid;

#[derive(Serialize)]
struct SendInfo
{
  node_type: String,
  node_id: Uuid,
  state: String,
}

pub struct NodeStateLogger
{
  sender: UnboundedSender<String>,
  handle: Option<JoinHandle<()>>,
  shutdown_requested: Arc<AtomicBool>,
}

unsafe impl Sync for NodeStateLogger {}

impl NodeStateLogger
{
  async fn runner_task<
    T: tokio::io::AsyncWrite + tokio::io::AsyncWriteExt + Send + Unpin + 'static,
  >(
    mut stream: WebSocketStream<T>,
    mut reciever: UnboundedReceiver<String>,
    shutdown_requested: Arc<AtomicBool>,
  ) where
    WebSocketStream<T>: futures::Sink<Message>,
  {
    let mut messages = vec![];
    while !shutdown_requested.load(std::sync::atomic::Ordering::Acquire)
    {
      messages.clear();
      reciever.recv_many(&mut messages, 4096).await;
      for x in &messages
      {
        let _ = stream.send(Message::text(x.clone())).await;
      }
    }
    let _ = stream.close().await;
    println!("Closing down runner");
  }

  pub fn new<T: tokio::io::AsyncWrite + tokio::io::AsyncWriteExt + Send + Unpin + 'static>(
    stream: WebSocketStream<T>,
  ) -> Self
  where
    WebSocketStream<T>: Sink<Message>,
  {
    let (sender, reciever) = unbounded_channel();
    let shutdown_requested = Arc::new(AtomicBool::new(false));
    let handle = Some(tokio::task::spawn(Self::runner_task(
      stream,
      reciever,
      shutdown_requested.clone(),
    )));
    Self {
      sender,
      handle,
      shutdown_requested,
    }
  }

  pub fn node_string(node_id: Uuid, state: NodeState, node_type: NodeType) -> String
  {
    serde_json::to_string::<SendInfo>(&SendInfo {
      node_id,
      state: format!("{:?}", state),
      node_type: format!("{:?}", node_type),
    })
    .unwrap()
  }

  pub async fn write_node_state(&self, node_id: Uuid, state: NodeState, node_type: NodeType)
  {
    self
      .log(&Self::node_string(node_id, state, node_type))
      .await;
  }
  pub async fn shutdown(&mut self)
  {
    self
      .shutdown_requested
      .store(true, std::sync::atomic::Ordering::Release);
    self.handle.take().unwrap().await.unwrap();
  }
}

#[async_trait::async_trait]
impl Logger for NodeStateLogger
{
  async fn log(&self, message: &str)
  {
    self.sender.send(message.to_string()).unwrap();
  }
}
