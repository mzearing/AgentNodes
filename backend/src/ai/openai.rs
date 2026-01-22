use crate::ai::{Agent, AgentErr, ChatBody};
use crate::correct_body;
use openai::chat::{ChatCompletion, ChatCompletionFunctionDefinition, ChatCompletionMessage};
use openai::Credentials;
use tokio::sync::Mutex;

pub struct OpenAiAgent
{
  credentials: Credentials,
  messages: Mutex<Vec<ChatCompletionMessage>>,
  functions: Vec<ChatCompletionFunctionDefinition>,
  o_tempurature: Option<f64>,
  model: String,
}

impl OpenAiAgent
{
  pub fn new(
    model: String,
    creds: Option<Credentials>,
    functions: Vec<ChatCompletionFunctionDefinition>,
    o_tempurature: Option<f64>,
  ) -> Self
  {
    Self {
      credentials: creds.unwrap_or(Credentials::from_env()),
      messages: Mutex::new(Vec::new()),
      functions,
      o_tempurature,
      model,
    }
  }
}

#[async_trait::async_trait]
impl Agent for OpenAiAgent
{
  async fn send_chat(&self, body: ChatBody) -> Result<(), AgentErr>
  {
    let message = correct_body!(OpenAi, body)?.clone();
    let mut guard = self.messages.lock().await;

    guard.push(message);
    let mut builder = ChatCompletion::builder(&self.model, guard.clone())
      .credentials(self.credentials.clone())
      .n(1);
    if self.functions.len() > 0
    {
      builder = builder.functions(self.functions.clone())
    }
    if let Some(tempurature) = self.o_tempurature
    {
      builder = builder.temperature(tempurature as f32);
    }

    let o_response = builder
      .create()
      .await
      .map_err(|x| AgentErr::OpenAi(x))?
      .choices
      .first()
      .cloned();
    if let Some(response) = o_response
    {
      guard.push(response.message);
    }
    Ok(())
  }

  async fn get_last_response(&self) -> Option<ChatBody>
  {
    self
      .messages
      .lock()
      .await
      .last()
      .map(|x| ChatBody::OpenAi(x.clone()))
  }
  async fn create_body(&self, content: String) -> ChatBody
  {
    ChatBody::OpenAi(ChatCompletionMessage {
      role: openai::chat::ChatCompletionMessageRole::User,
      content: Some(content),
      name: None,
      function_call: None,
      tool_call_id: None,
      tool_calls: None,
    })
  }
}
