#[async_trait::async_trait]
pub trait Logger: 'static + Send + Sync
{
  async fn log(&self, message: &str);
}
