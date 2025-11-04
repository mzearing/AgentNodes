mod eval;
mod language;

use eval::Evaluator;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  // console_subscriber::init();
  let eval = Evaluator::new("testprogs/compiled.json".to_string(), None).unwrap();
  let instance = eval.instantiate(vec![]).await;

  for _ in 0..100
  {
    println!("{:?}", instance.get_outputs().await);
    //let b = instance.get_outputs().await;
    //b.unwrap();
  }
  instance.shutdown().await;
  // eval.kill().await;
  Ok(())
}
