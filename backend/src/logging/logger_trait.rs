#[async_trait::async_trait]
pub trait Logger
{
  async fn log(&self, message: &str);
}
