use crate::ai::{Agent, AgentErr, ChatBody};
use crate::correct_body;
use openai::chat::{ChatCompletion, ChatCompletionMessage};
use openai::Credentials;
use tokio::sync::Mutex;

pub struct OpenAiAgent
{
  credentials: Credentials,
  messages: Mutex<Vec<ChatCompletionMessage>>,
  model: String,
}

impl OpenAiAgent
{
  pub fn new(model: String, creds: Option<Credentials>) -> Self
  {
    Self {
      credentials: creds.unwrap_or(Credentials::from_env()),
      messages: Mutex::new(Vec::new()),
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
    let o_response = ChatCompletion::builder(&self.model, guard.clone())
      .credentials(self.credentials.clone())
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
