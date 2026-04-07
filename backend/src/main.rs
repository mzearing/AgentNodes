#![feature(fn_traits)]
#![feature(get_mut_unchecked)]

mod ai;
mod cli;
mod eval;
mod language;
mod logging;

use crate::logging::node_state_logger::NodeStateLogger;
use clap::Parser;
use cli::Cli;
use eval::Evaluator;
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio::signal::ctrl_c;
use tokio_websockets::ClientBuilder;

#[tokio::main]
async fn main()
{
  dotenvy::dotenv().unwrap();
  let cli = Cli::parse();

  if cli.print_schemas
  {
    println!(
      "{}\n",
      serde_json::to_string_pretty(&schemars::schema_for!(crate::language::nodes::Complex))
        .unwrap()
    );
    return;
  }

  // console_subscriber::init();
  let eval = Evaluator::<NodeStateLogger, NodeStateLogger>::new(
    cli.filename.unwrap().to_str().unwrap().to_string(),
    None,
    None,
    None,
  )
  .unwrap();
  let instance = eval.instantiate(vec![]).await;

  tokio::select! {
    _ = ctrl_c() => {println!("Ctrl c, shutting down");},
    _ = instance.wait_for_complete() => {
      if cli.print_output
      {
        println!("{:?}", instance.get_outputs().await);
      }
      else
      {
        let _ = instance.get_outputs().await;
      }
    }
  }

  instance.shutdown().await;
}
