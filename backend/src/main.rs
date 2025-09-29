mod language;

use language::eval::Evaluator;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  // console_subscriber::init();
  let eval = Evaluator::new("testprogs/add.json".to_string(), None).unwrap();

  println!("{:?}", eval.get_outputs().await.unwrap());
  Ok(())
}
