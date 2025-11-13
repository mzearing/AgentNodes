mod cli;
mod eval;
mod language;

use clap::Parser;
use cli::Cli;
use eval::Evaluator;

#[tokio::main]
async fn main()
{
  let cli = Cli::parse();

  // console_subscriber::init();
  let eval = Evaluator::new(cli.filename.to_str().unwrap().to_string(), None).unwrap();
  let instance = eval.instantiate(vec![]).await;

  if cli.print_output
  {
    println!("{:?}", instance.get_outputs().await);
  }
  else
  {
    let _ = instance.get_outputs().await;
  }

  instance.shutdown().await;
}
