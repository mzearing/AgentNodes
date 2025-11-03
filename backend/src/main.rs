mod eval_error;
pub use eval_error::*;
mod language;

use language::eval::Evaluator;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  // console_subscriber::init();
  let eval = Evaluator::new("testprogs/add.json".to_string(), None).unwrap();
  let instance = eval.instantiate(vec![]).await;

  for _ in 0..10
  {
    println!("{:?}", instance.get_outputs().await);
  }
  instance.shutdown().await;
  // eval.kill().await;
  Ok(())
}
