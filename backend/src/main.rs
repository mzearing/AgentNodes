mod language;
use std::{fs::File, io::Write};

use language::eval::Evaluator;
use serde_json::from_reader;

use crate::language::nodes::Complex;

#[tokio::main]
async fn main() -> Result<(), ()>
{
  console_subscriber::init();
  let eval = Evaluator::new(
    "/home/rei/git-repos/AgentNodes/backend/testprogs/val_print.json".to_string(),
    None,
  )
  .unwrap();

  loop
  {
    eval.get_outputs().await.unwrap();
  }
}
