use crate::eval::NodeState;
use crate::language::nodes::NodeType;
use crate::logging::Logger;
use futures::{Sink, SinkExt};
use serde::Serialize;
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_util::sync::CancellationToken;
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
  my_cancel: CancellationToken,
  finished: CancellationToken,
}

unsafe impl Sync for NodeStateLogger {}

impl NodeStateLogger
{
  async fn runner_loop<
    T: tokio::io::AsyncWrite + tokio::io::AsyncWriteExt + Send + Unpin + 'static,
  >(
    stream: &mut WebSocketStream<T>,
    reciever: &mut UnboundedReceiver<String>,
  ) where
    WebSocketStream<T>: futures::Sink<Message>,
  {
    let mut messages = vec![];
    loop
    {
      messages.clear();
      reciever.recv_many(&mut messages, 4096).await;
      for x in &messages
      {
        let _ = stream.send(Message::text(x.clone())).await;
      }
    }
  }
  async fn runner_task<
    T: tokio::io::AsyncWrite + tokio::io::AsyncWriteExt + Send + Unpin + 'static,
  >(
    mut stream: WebSocketStream<T>,
    mut reciever: UnboundedReceiver<String>,
    canceled: CancellationToken,
    finished: CancellationToken,
  ) where
    WebSocketStream<T>: futures::Sink<Message>,
  {
    tokio::select! {
      _ = canceled.cancelled() => {
        println!("Closing down runner");
        reciever.close();
        while let Some(msg) = reciever.recv().await
        {
          let _ = stream.send(Message::text(msg)).await;
        }
        let _ = stream.close().await;
        finished.cancel();
      },
      _ = Self::runner_loop(&mut stream, &mut reciever) => {finished.cancel();}
    };
  }

  pub fn new<T: tokio::io::AsyncWrite + tokio::io::AsyncWriteExt + Send + Unpin + 'static>(
    stream: WebSocketStream<T>,
  ) -> Self
  where
    WebSocketStream<T>: Sink<Message>,
  {
    let (sender, reciever) = unbounded_channel();
    let canceled = CancellationToken::new();
    let finished = CancellationToken::new();
    tokio::task::spawn(Self::runner_task(
      stream,
      reciever,
      canceled.clone(),
      finished.clone(),
    ));
    Self {
      sender,
      my_cancel: canceled,
      finished,
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

  pub async fn shutdown(&self)
  {
    self.my_cancel.cancel();
    self.finished.cancelled().await;
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
