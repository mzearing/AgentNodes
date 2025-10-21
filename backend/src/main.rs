mod eval_error;
pub use eval_error::*;
mod language;

use language::eval::Evaluator;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  //console_subscriber::init();
  let eval = Evaluator::new("testprogs/val_print.json".to_string(), None).unwrap();

  println!("{:?}", eval.get_outputs().await.unwrap());
  // eval.kill().await;
  Ok(())
}
