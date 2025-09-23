mod language;
use std::{fs::File, io::Write};

use language::eval::Evaluator;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  // console_subscriber::init();
  let eval = Evaluator::new("testprogs/add.json".to_string(), None).unwrap();

  eval.get_outputs().await.unwrap();
  Ok(())
}
