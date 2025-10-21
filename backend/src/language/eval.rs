use super::nodes::Complex;
use crate::language::{
  nodes::Instance,
  typing::{DataType, DataValue},
};
use crate::EvalError;
use std::{
  collections::{HashMap, VecDeque},
  fs::File,
  pin::Pin,
  sync::{atomic::AtomicBool, Arc},
};
use tokio::{
  io::BufReader,
  sync::broadcast::{channel, error::RecvError, Receiver, Sender},
};
use tokio::{
  io::{AsyncBufReadExt, AsyncWrite},
  task::JoinHandle,
};
use tokio::{
  io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
  sync::{Mutex, RwLock},
};
use uuid::Uuid;

const CHANNEL_CAPACITY: usize = 16;

// pub enum IoObject
// {
//   TcpSocket(TcpStream),
//   File(AsyncFile),
// }

pub trait Asyncio: AsyncRead + AsyncWrite + Send + Sync {}
impl<T> Asyncio for T where T: AsyncRead + AsyncWrite + Send + Sync {}
pub type IoObject = Pin<Box<dyn Asyncio>>;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum NodeState
{
  MoreData,
  Finished,
}

pub type NodeOutput = (NodeState, Vec<DataValue>);
pub type NodeInputs = Vec<(NodeState, DataValue)>;

pub trait EvaluateIt
{
  async fn evaluate(
    &self,
    eval: Arc<Evaluator>,
    node: &mut ExecutionNode,
    inputs: NodeInputs,
  ) -> Result<NodeOutput, EvalError>;
}

pub struct Evaluator
{
  complex_registry: RwLock<HashMap<String, Arc<Evaluator>>>,
  parent: Option<Arc<Evaluator>>,
  outputs: RwLock<Sender<NodeOutput>>,
  inputs: (Sender<NodeInputs>, RwLock<Receiver<NodeInputs>>),
  io_registry: Arc<Mutex<HashMap<uuid::Uuid, IoObject>>>,
  finished: Arc<AtomicBool>,
  log_task: Mutex<Option<JoinHandle<()>>>,
  pub my_path: String,
}

pub async fn log_task(
  mut tasks: Vec<JoinHandle<Result<Uuid, EvalError>>>,
  finished: Arc<AtomicBool>,
)
{
  while !tasks.is_empty()
  {
    let current = tasks.pop().unwrap();
    let tid = current.id();
    if current.is_finished()
    {
      let ret = current.await;
      match ret
      {
        Ok(Err(e)) => println!("Task {tid} finished with EvalError {:?}", e),
        Ok(Ok(id)) => println!("Task {tid}:{id} finished successfully"),
        Err(e) => println!("Task {tid} join error {:?}", e),
      }
    }
    else
    {
      tasks.push(current);
      tokio::task::yield_now().await;
    }

    if finished.load(std::sync::atomic::Ordering::Relaxed)
    {
      for t in tasks
      {
        t.abort();
      }
      break;
    }
  }
}

pub struct ExecutionNode
{
  pub id: uuid::Uuid,
  pub instance: Instance,
  pub inputs: Vec<Receiver<(NodeState, DataValue)>>,
  pub outputs: Vec<Sender<(NodeState, DataValue)>>,
  pub inputs_state: NodeState,
  pub stored_val: RwLock<Option<DataValue>>,
}

impl ExecutionNode
{
  pub async fn run(mut self, eval: Arc<Evaluator>) -> Result<Uuid, EvalError>
  {
    // If all the subscribers are closed, then we should close up anyways
    let mut closed = false;
    while self.inputs_state == NodeState::MoreData && !closed
    {
      let mut input_vec = Vec::new();

      for x in &mut self.inputs
      {
        let mut r = x.recv().await;
        while let Err(RecvError::Lagged(_)) = r
        {
          r = x.recv().await;
        }
        input_vec.push(r.map_err(|x| EvalError::from(x))?);
      }

      self.inputs_state = if input_vec.iter().any(|x| x.0 == NodeState::Finished)
      {
        NodeState::Finished
      }
      else
      {
        NodeState::MoreData
      };

      let res = self
        .instance
        .node_type
        .clone()
        .evaluate(eval.clone(), &mut self, input_vec)
        .await?;
      for (o, x) in self.outputs.iter().zip(res.1.iter())
      {
        if o.receiver_count() == 0
        {
          closed = true;
          continue;
        }

        let state = if !closed { res.0 } else { NodeState::Finished };

        o.send((state, x.clone())).map_err(EvalError::from)?;
      }
    }

    Ok(self.id.clone())
  }
  pub fn new(instance: Instance, inputs: &Vec<Sender<(NodeState, DataValue)>>) -> Self
  {
    let mut outputs = Vec::new();
    outputs.resize_with(instance.outputs.len(), || channel(CHANNEL_CAPACITY).0);

    Self {
      id: uuid::Uuid::new_v4(),
      instance,
      inputs: inputs.iter().map(|x| x.subscribe()).collect(),
      outputs,
      inputs_state: NodeState::MoreData,
      stored_val: RwLock::new(None),
    }
  }
}

async fn read_until_generic<R: AsyncRead + Unpin>(
  reader: &mut R,
  pattern: &[u8],
) -> Result<Vec<u8>, EvalError>
{
  let mut buffer = Vec::new();
  let mut window = VecDeque::with_capacity(pattern.len() + 1);

  loop
  {
    let mut byte = [0; 1];
    let count = reader.read(&mut byte).await?;
    if count == 0
    {
      break;
    }

    buffer.push(byte[0]);
    window.push_back(byte[0]);

    if window.len() > pattern.len()
    {
      window.pop_front();
    }

    if window.len() == pattern.len() && window.make_contiguous() == pattern
    {
      break;
    }
  }
  Ok(buffer)
}

impl Evaluator
{
  pub fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError>
  {
    let file = File::open(&path).map_err(EvalError::from)?;
    let me = serde_json::from_reader::<File, Complex>(file)
      .map_err(|x| EvalError::InvalidComplexNode(path.clone(), x))?;

    let mut queue = VecDeque::new();
    let mut processed = HashMap::new();
    let mut keys = me.instances.keys().cloned().collect::<Vec<Uuid>>();
    keys.sort_by(|a, b| {
      me.instances[a]
        .inputs
        .len()
        .cmp(&me.instances[b].inputs.len())
    });

    queue.append(&mut keys.into());

    while !queue.is_empty()
    {
      let current = queue.pop_front().unwrap();
      let node = &me.instances[&current];
      let possible_sockets: Vec<(&DataType, Option<&ExecutionNode>, &usize)> = node
        .inputs
        .iter()
        .map(|(dtype, id, socket)| (dtype, processed.get(id), socket))
        .collect();
      if !possible_sockets.iter().all(|(_, x, _)| x.is_some())
      {
        queue.push_back(current);
        continue;
      }

      let sockets: Vec<(&DataType, &ExecutionNode, &usize)> = possible_sockets
        .into_iter()
        .map(|(dtype, node, index)| (dtype, node.unwrap(), index))
        .collect();

      let type_pairs: Vec<(DataType, DataType)> = sockets
        .iter()
        .map(|(e, node, index)| (node.instance.outputs[**index].clone(), (*e).clone()))
        .collect();

      if !type_pairs.iter().all(|(g, e)| g == e)
      {
        let (got, expected) = type_pairs.into_iter().unzip();
        return Err(EvalError::IncorrectTyping { got, expected });
      }

      let inputs: Vec<Sender<(NodeState, DataValue)>> = sockets
        .iter()
        .map(|(_, node, index)| node.outputs[**index].clone())
        .collect();

      processed.insert(current, ExecutionNode::new(node.clone(), &inputs));
    }
    let io_registry = parent
      .clone()
      .map_or(Arc::new(Mutex::new(HashMap::new())), |x| {
        x.io_registry.clone()
      });
    let (s, r) = channel(CHANNEL_CAPACITY);
    let ret = Arc::new(Self {
      complex_registry: RwLock::new(HashMap::new()),
      parent,
      outputs: RwLock::new(channel(CHANNEL_CAPACITY).0),
      inputs: (s, RwLock::new(r)),
      my_path: std::path::Path::new(&path)
        .parent()
        .map(|x| x.to_str().unwrap().to_string())
        .unwrap_or_default(),
      finished: Arc::new(AtomicBool::new(false)),
      log_task: Mutex::const_new(None),
      io_registry,
    });

    let mut tasks = Vec::new();

    for (_, x) in processed.into_iter()
    {
      tasks.push(tokio::spawn(x.run(ret.clone())));
    }

    let c = ret.clone();
    tokio::task::spawn_blocking(move || {
      *c.log_task.blocking_lock() = Some(tokio::spawn(log_task(tasks, c.finished.clone())));
    });

    Ok(ret)
  }

  pub async fn send_outputs(&self, outputs: NodeOutput) -> Result<(), EvalError>
  {
    self
      .outputs
      .read()
      .await
      .send(outputs)
      .map_err(EvalError::from)?;
    Ok(())
  }
  pub async fn get_outputs(&self) -> Result<NodeOutput, EvalError>
  {
    self
      .outputs
      .read()
      .await
      .subscribe()
      .recv()
      .await
      .map_err(EvalError::from)
  }

  pub fn send_inputs(&self, inputs: NodeInputs) -> Result<(), EvalError>
  {
    self.inputs.0.send(inputs).map_err(EvalError::from)?;
    Ok(())
  }
  pub async fn get_inputs(&self) -> Result<NodeInputs, EvalError>
  {
    let mut guard = self.inputs.1.write().await;
    let mut ret = guard.recv().await;
    while let Err(RecvError::Lagged(_)) = ret
    {
      ret = guard.recv().await;
    }
    ret.map_err(EvalError::from)
  }
  pub async fn add_evaluator(&self, path: String, eval: Arc<Evaluator>)
  {
    let relative_path = format!("{}{}{}", eval.my_path, std::path::MAIN_SEPARATOR, path);
    self
      .complex_registry
      .write()
      .await
      .insert(relative_path, eval.clone());
    if let Some(p) = &self.parent
    {
      Box::pin(p.add_evaluator(path, eval.clone())).await;
    }
  }
  pub async fn get_evaluator(&self, path: String) -> Option<Arc<Evaluator>>
  {
    let relative_path = format!("{}{}{}", self.my_path, std::path::MAIN_SEPARATOR, path);
    let ret = self
      .complex_registry
      .read()
      .await
      .get(&relative_path)
      .cloned();
    match (&ret, &self.parent)
    {
      (None, Some(p)) => Box::pin(p.get_evaluator(relative_path)).await,
      _ => ret,
    }
  }
  pub async fn read_bytes(&self, id: &Uuid, buf: &mut Vec<u8>) -> Result<usize, EvalError>
  {
    let mut guard = self.io_registry.lock().await;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;
    io.read_buf(buf).await.map_err(EvalError::from)
  }

  pub async fn write_bytes(&self, id: &Uuid, buf: &mut Vec<u8>) -> Result<(), EvalError>
  {
    let mut guard = self.io_registry.lock().await;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;

    io.write_all(buf).await.map_err(EvalError::from)
  }

  pub async fn read_until(&self, id: &Uuid, pattern: &[u8]) -> Result<Vec<u8>, EvalError>
  {
    let mut guard = self.io_registry.lock().await;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;
    read_until_generic(io, pattern).await
  }

  pub async fn eof(&self, id: &Uuid) -> Result<bool, EvalError>
  {
    let mut guard = self.io_registry.lock().await;
    let s = guard
      .get_mut(&id)
      .ok_or(EvalError::IoNotFound(id.clone()))?;
    let mut reader = BufReader::new(s);
    Ok(reader.fill_buf().await?.is_empty())
  }

  pub async fn register_io(&self, io: IoObject) -> Uuid
  {
    let mut guard = self.io_registry.lock().await;
    let mut ret = Uuid::new_v4();
    while guard.contains_key(&ret)
    {
      ret = Uuid::new_v4()
    }
    guard.insert(ret, io);
    ret
  }

  pub async fn kill(&self)
  {
    if !self.finished.load(std::sync::atomic::Ordering::Relaxed)
    {
      let mut guard = self.complex_registry.write().await;
      for p in guard
        .iter()
        .map(|(p, _)| p.clone())
        .collect::<Vec<String>>()
      {
        let x = guard.remove(&p).unwrap();
        Box::pin(x.kill()).await;
      }
      self
        .finished
        .store(true, std::sync::atomic::Ordering::Relaxed);
      let _ = self.log_task.lock().await.take().unwrap().await;
    }
  }
}
