use crate::ai::openai::OpenAiAgent;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema, PartialEq)]
pub enum AgentType
{
  OpenAi,
  OpenRouter,
}

#[derive(Debug, Clone)]
pub enum ChatBody
{
  OpenAi(openai::chat::ChatCompletionMessage),
  OpenRouter(usize),
}

#[derive(Debug, Clone)]
pub enum AgentErr
{
  OpenAi(openai::OpenAiError),
  IncorrectBodyType(AgentType, ChatBody),
}

pub struct AgentArgs
{
  pub(crate) model: String,
}

pub type DynAgent = Pin<Box<dyn Agent + Send + Sync>>;

#[async_trait::async_trait]
pub trait Agent
{
  async fn send_chat(&self, body: ChatBody) -> Result<(), AgentErr>;
  async fn get_last_response(&self) -> Option<ChatBody>;
  async fn create_body(&self, content: String) -> ChatBody;
}

#[macro_export]
macro_rules! correct_body {
  ($agent_type:ident, $body:ident) => {
    if let crate::ai::ChatBody::$agent_type(x) = $body
    {
      Ok(x)
    }
    else
    {
      Err(AgentErr::IncorrectBodyType(
        crate::ai::AgentType::$agent_type,
        $body,
      ))
    }
  };
}

impl AgentType
{
  pub fn create(self, args: AgentArgs) -> DynAgent
  {
    match self
    {
      AgentType::OpenAi => Box::pin(OpenAiAgent::new(args.model, None)),
      AgentType::OpenRouter => todo!(),
    }
  }
}

impl ChatBody
{
  pub fn get_content(&self) -> Option<String>
  {
    match self
    {
      ChatBody::OpenAi(message) => message.content.clone(),
      ChatBody::OpenRouter(_) => todo!(),
    }
  }
}
