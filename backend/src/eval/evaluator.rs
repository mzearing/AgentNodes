use super::{AsyncClone, EvalError, ExecutionNode, IoObject};
use crate::{
  ai::{AgentArgs, AgentType, ChatBody, DynAgent},
  language::{nodes::Complex, typing::DataValue},
};
use std::{
  collections::{HashMap, HashSet, VecDeque},
  sync::{atomic::AtomicBool, Arc},
};
use tokio::{
  io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
  sync::{RwLock, RwLockWriteGuard},
  task::{AbortHandle, JoinHandle, JoinSet},
};
use uuid::Uuid;

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

async fn task_listen(
  eval: Arc<Evaluator>,
  tasks: Vec<JoinHandle<(Uuid, Result<Vec<DataValue>, EvalError>)>>,
) -> ()
{
  let mut js = JoinSet::new();
  let mut abort_handles: Vec<AbortHandle> = tasks.into_iter().map(|x| js.spawn(x)).collect();

  while !eval.closed.load(std::sync::atomic::Ordering::Acquire)
  {
    if let Some(ret) = js.try_join_next()
    {
      match ret
      {
        Ok(Ok((id, x))) =>
        {
          match x
          {
            Ok(v) => println!("Node {id} finished successfully with value(s) {:?}", v),
            Err(e) => println!("Node {id} failed with error {e:?}"),
          }
        }
        Ok(Err(e)) => println!("Task join error {:?}", e),
        Err(e) => println!("Task join error {:?}", e),
      }
    }
    else if js.is_empty()
    {
      return;
    }
    tokio::task::yield_now().await;
  }
  for handle in abort_handles.drain(0..)
  {
    handle.abort();
  }
}

pub struct Evaluator
{
  pub scope_id: Uuid,
  pub(super) nodes: HashMap<Uuid, Arc<ExecutionNode>>,
  evaluator_cache: RwLock<HashMap<String, Arc<Self>>>, // cache of parsed evaluators, not "alive"
  complex_nodes: RwLock<HashMap<Uuid, Arc<Self>>>,     // running complex nodes

  parent: Option<Arc<Self>>,
  end_node: Uuid,
  inputs: (
    tokio::sync::mpsc::Sender<Vec<DataValue>>,
    RwLock<tokio::sync::mpsc::Receiver<Vec<DataValue>>>,
  ),
  pub(crate) my_path: String,
  listen_handle: RwLock<Option<JoinHandle<()>>>,
  pub(self) closed: AtomicBool,
  io_registry: Arc<RwLock<HashMap<Uuid, IoObject>>>,

  agent_registry: Arc<RwLock<HashMap<Uuid, DynAgent>>>,

  dangling_nodes: Arc<HashSet<Uuid>>,

  variables: RwLock<HashMap<String, DataValue>>,
}

impl AsyncClone for Evaluator
{
  async fn clone(&self) -> Self
  {
    Self {
      scope_id: self.scope_id.clone(),
      nodes: self
        .nodes
        .iter()
        .map(|(id, node)| (id.clone(), Arc::new((*(node.clone())).clone())))
        .collect(),
      evaluator_cache: RwLock::new(self.evaluator_cache.read().await.clone()),
      complex_nodes: RwLock::new(HashMap::new()),
      parent: self.parent.clone(),
      end_node: self.end_node.clone(),
      inputs: {
        let channels = tokio::sync::mpsc::channel(1024);
        (channels.0, RwLock::new(channels.1))
      },
      my_path: self.my_path.clone(),
      listen_handle: RwLock::new(None),
      closed: AtomicBool::new(false),
      io_registry: Arc::new(RwLock::new(HashMap::new())),
      agent_registry: Arc::new(RwLock::new(HashMap::new())),
      dangling_nodes: Arc::new(self.dangling_nodes.as_ref().clone()),
      variables: RwLock::new(HashMap::new()),
    }
  }
}
impl Evaluator
{
  pub fn new(path: String, parent: Option<Arc<Self>>) -> Result<Arc<Self>, EvalError>
  {
    let parent_id = parent.as_ref().map(|x| x.scope_id).unwrap_or(Uuid::nil());
    let scope_id = Uuid::new_v5(&parent_id, Uuid::new_v4().as_bytes());
    let file = std::fs::File::open(&path)?;
    let me = serde_json::from_reader::<std::fs::File, Complex>(file)
      .map_err(|x| EvalError::InvalidComplexNode(path.clone(), x))?;

    let mut non_dangling = HashSet::new();
    let all_ids: HashSet<Uuid> = me
      .instances
      .iter()
      .map(|(unscoped, _)| Self::convert_id(&scope_id, unscoped.clone()))
      .collect();

    //wow iterators are insane
    let nodes: HashMap<Uuid, Arc<ExecutionNode>> = me
      .instances
      .into_iter()
      .map(|(unscoped, instance)| {
        let scoped = Self::convert_id(&scope_id, unscoped);
        let inputs = instance
          .inputs
          .iter()
          .map(|(t, id, socket, strong)| {
            non_dangling.insert(Self::convert_id(&scope_id, id.clone()));
            (
              t.clone(),
              Self::convert_id(&scope_id, id.clone()),
              *socket,
              *strong,
            )
          })
          .collect();

        let ex = Arc::new(ExecutionNode::new(scoped, instance, inputs));
        (scoped, ex)
      })
      .collect();

    let dangling: HashSet<Uuid> = all_ids.difference(&non_dangling).cloned().collect();

    Ok(Arc::new(Self {
      scope_id: scope_id.clone(),
      nodes,
      evaluator_cache: RwLock::new(HashMap::new()),
      complex_nodes: RwLock::new(HashMap::new()),
      parent,
      end_node: Self::convert_id(&scope_id, me.end_node),
      inputs: {
        let channels = tokio::sync::mpsc::channel(1024);
        (channels.0, RwLock::new(channels.1))
      },
      my_path: std::path::Path::new(&path)
        .parent()
        .map(|x| x.to_str().unwrap().to_string())
        .unwrap_or_default(),
      listen_handle: RwLock::new(None),
      closed: AtomicBool::new(false),
      io_registry: Arc::new(RwLock::new(HashMap::new())),
      agent_registry: Arc::new(RwLock::new(HashMap::new())),
      dangling_nodes: Arc::new(dangling),
      variables: RwLock::new(HashMap::new()),
    }))
  }

  fn convert_id(scope: &Uuid, unscoped: Uuid) -> Uuid
  {
    Uuid::new_v5(scope, unscoped.as_bytes())
  }

  pub async fn send_inputs(&self, inputs: Vec<DataValue>)
  {
    self.inputs.0.clone().send(inputs).await.unwrap();
  }

  pub async fn get_inputs(&self) -> Vec<DataValue>
  {
    self.inputs.1.write().await.recv().await.unwrap_or_default()
  }

  pub async fn get_outputs(&self) -> Result<Vec<DataValue>, EvalError>
  {
    // println!("Getoutputs");
    let node = self.nodes.get(&self.end_node).ok_or(EvalError::NoEndNode)?;
    // println!("Got");

    let dangles: Vec<Result<&Arc<ExecutionNode>, EvalError>> = self
      .dangling_nodes
      .iter()
      .map(|x| self.nodes.get(x).ok_or(EvalError::NodeNotFound(x.clone())))
      .collect();

    for node in dangles
    {
      node?.trigger_processing().await;
    }

    let mut out = Vec::with_capacity(node.outputs.len());
    for i in 0..node.outputs.len()
    {
      let n = node.clone();
      // println!("listening");
      let recv = n.listen(i).await?;
      // println!("receiving");
      let res = recv.await?.ok_or(EvalError::Closed)?;
      out.push(res);

      // out.push(
      //   node
      //     .clone()
      //     .listen(i)
      //     .await?
      //     .await?
      //     .ok_or(EvalError::Closed)?,
      // );
    }
    Ok(out)
  }

  pub async fn shutdown(self: Arc<Self>)
  {
    self
      .closed
      .store(true, std::sync::atomic::Ordering::Release);
    // self
    //   .listen_handle
    //   .write()
    //   .await
    //   .take()
    //   .unwrap()
    //   .await
    //   .unwrap();
  }
  #[allow(dead_code)]
  pub async fn print_states(&self)
  {
    for x in self.nodes.values()
    {
      println!("{}:{:?}", x.id, x.state.read().await);
    }
  }

  pub async fn instantiate(self: Arc<Self>, inputs: Vec<DataValue>) -> Arc<Self>
  {
    let instance = Arc::new((*self).clone().await);
    instance.send_inputs(inputs).await;
    let tasks = instance
      .nodes
      .values()
      .map(|x| x.clone().spawn(instance.clone()))
      .collect();
    *instance.listen_handle.write().await =
      Some(tokio::task::spawn(task_listen(instance.clone(), tasks)));

    instance
  }

  pub async fn get_evaluator(&self, path: &str) -> Option<Arc<Self>>
  {
    if let Some(e) = self.evaluator_cache.read().await.get(path)
    {
      Some(e.clone())
    }
    else if let Some(p) = self.parent.as_ref()
    {
      let got = Box::pin(p.clone().get_evaluator(path)).await;
      if let Some(e) = &got
      {
        self
          .evaluator_cache
          .write()
          .await
          .insert(path.to_string(), e.clone());
      }
      got
    }
    else
    {
      None
    }
  }

  pub async fn get_complex_runner(&self, id: &Uuid) -> Option<Arc<Self>>
  {
    self.complex_nodes.read().await.get(id).cloned()
  }

  pub async fn add_complex_runner(&self, instance: Arc<Self>, id: &Uuid)
  {
    self.complex_nodes.write().await.insert(*id, instance);
  }

  pub async fn add_evaluator(self: Arc<Self>, path: &str, eval: Arc<Self>)
  {
    self
      .evaluator_cache
      .write()
      .await
      .insert(path.to_string(), eval.clone());
    if let Some(p) = self.parent.as_ref()
    {
      Box::pin(p.clone().add_evaluator(path, eval)).await;
    }
  }

  pub async fn register_io(&self, io: IoObject) -> Uuid
  {
    let mut guard = self.io_registry.write().await;
    let mut ret = Uuid::new_v4();
    while guard.contains_key(&ret)
    {
      ret = Uuid::new_v4();
    }
    guard.insert(ret, io);
    ret
  }

  async fn find_io_registry_mut(
    self: &Arc<Self>,
    id: &Uuid,
  ) -> Result<RwLockWriteGuard<'_, HashMap<Uuid, IoObject>>, EvalError>
  {
    if self.io_registry.read().await.contains_key(id)
    {
      return Ok(self.io_registry.write().await);
    }

    let mut current = &self.parent;
    while let Some(parent) = &current
    {
      if parent.io_registry.read().await.contains_key(id)
      {
        return Ok(parent.io_registry.write().await);
      }
      current = &parent.parent
    }
    Err(EvalError::IoNotFound(id.clone()))
  }

  pub async fn read_until(self: Arc<Self>, id: &Uuid, pattern: &[u8])
    -> Result<Vec<u8>, EvalError>
  {
    let mut guard = self.find_io_registry_mut(id).await?;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;
    read_until_generic(io, pattern).await
  }

  pub async fn read_bytes(self: Arc<Self>, id: &Uuid, buf: &mut Vec<u8>)
    -> Result<usize, EvalError>
  {
    let mut guard = self.find_io_registry_mut(id).await?;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;
    io.read_buf(buf).await.map_err(EvalError::from)
  }

  pub async fn write_bytes(self: Arc<Self>, id: &Uuid, buf: &mut Vec<u8>) -> Result<(), EvalError>
  {
    let mut guard = self.find_io_registry_mut(id).await?;
    let io = guard.get_mut(id).ok_or(EvalError::IoNotFound(id.clone()))?;

    io.write_all(buf).await.map_err(EvalError::from)
  }

  pub fn find_node(&self, id: &Uuid) -> Result<Arc<ExecutionNode>, EvalError>
  {
    self
      .nodes
      .get(&Uuid::new_v5(&self.scope_id, id.as_bytes()))
      .cloned()
      .ok_or(EvalError::NodeNotFound(id.clone()))
  }

  pub async fn register_agent(&self, agent_type: AgentType, args: AgentArgs) -> Uuid
  {
    let agent = agent_type.create(args);
    let id = Uuid::new_v4();
    self.agent_registry.write().await.insert(id.clone(), agent);
    id
  }

  async fn find_agent_registry_mut(
    self: &Arc<Self>,
    id: &Uuid,
  ) -> Result<RwLockWriteGuard<'_, HashMap<Uuid, DynAgent>>, EvalError>
  {
    if self.agent_registry.read().await.contains_key(id)
    {
      return Ok(self.agent_registry.write().await);
    }

    let mut current = &self.parent;
    while let Some(parent) = &current
    {
      if parent.agent_registry.read().await.contains_key(id)
      {
        return Ok(parent.agent_registry.write().await);
      }
      current = &parent.parent;
    }
    Err(EvalError::AgentNotFound(id.clone()))
  }
  pub async fn agent_send_message(self: Arc<Self>, id: &Uuid, body: String)
    -> Result<(), EvalError>
  {
    let agent = &self.find_agent_registry_mut(id).await?[id];

    agent
      .send_chat(agent.create_body(body).await)
      .await
      .map_err(EvalError::from)
  }

  pub async fn agent_get_last_message(
    self: Arc<Self>,
    id: &Uuid,
  ) -> Result<Option<ChatBody>, EvalError>
  {
    Ok(
      self.find_agent_registry_mut(id).await?[id]
        .get_last_response()
        .await,
    )
  }

  pub async fn get_variable(self: Arc<Self>, name: &str) -> DataValue
  {
    let mut guard = self.variables.write().await;
    if let Some(v) = guard.get(name)
    {
      v.clone()
    }
    else
    {
      guard.insert(name.to_string(), DataValue::None);
      DataValue::None
    }
  }

  pub async fn set_variable(self: Arc<Self>, name: String, value: DataValue)
  {
    self.variables.write().await.insert(name, value);
  }
}
