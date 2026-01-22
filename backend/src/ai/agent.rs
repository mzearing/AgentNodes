use crate::{ai::openai::OpenAiAgent, language::typing::DataValue};
use openai::chat::ChatCompletionFunctionDefinition;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::pin::Pin;

#[derive(Serialize, Deserialize, Clone, Debug, JsonSchema, PartialEq, Eq, Hash)]
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

pub struct FunctionCall
{
  pub name: String,
  pub args: String,
}

pub struct FunctionDefinition
{
  pub name: String,
  pub description: Option<String>,
  pub arguments: Option<serde_json::Value>,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub enum AgentErr
{
  OpenAi(openai::OpenAiError),
  IncorrectBodyType(AgentType, ChatBody),
}

pub struct AgentArgs
{
  pub(crate) model: String,
  pub(crate) functions: Option<Vec<FunctionDefinition>>,
  pub(crate) tempurature: Option<f64>,
}

impl AgentArgs
{
  pub fn from_values(vals: &Vec<DataValue>) -> Option<Self>
  {
    match (
      vals.get(0).cloned(),
      vals.get(1).cloned(),
      vals.get(2).cloned(),
    )
    {
      (Some(DataValue::String(model)), Some(v_functions), Some(v_temp)) =>
      {
        let mut ret = Self {
          model,
          functions: None,
          tempurature: None,
        };
        match v_functions
        {
          DataValue::Array(_functions) => todo!(),
          DataValue::None => (),
          _ => return None,
        };

        match v_temp
        {
          DataValue::Float(tempurature) => ret.tempurature = Some(tempurature),
          DataValue::None => (),
          _ => return None,
        };
        Some(ret)
      }

      _ => None,
    }
  }
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
      AgentType::OpenAi =>
      {
        Box::pin(OpenAiAgent::new(
          args.model,
          None,
          args
            .functions
            .map(|funcs| {
              funcs
                .into_iter()
                .map(|x| {
                  ChatCompletionFunctionDefinition {
                    name: x.name,
                    description: x.description,
                    parameters: x.arguments,
                  }
                })
                .collect()
            })
            .unwrap_or(vec![]),
          args.tempurature,
        ))
      }
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
  pub fn get_function_call(&self) -> Option<FunctionCall>
  {
    match self
    {
      ChatBody::OpenAi(message) =>
      {
        message.function_call.clone().map(|x| {
          FunctionCall {
            name: x.name,
            args: x.arguments,
          }
        })
      }
      ChatBody::OpenRouter(_) => todo!(),
    }
  }
}
