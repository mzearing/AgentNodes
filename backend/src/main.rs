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

  let tcp = TcpStream::connect("localhost:3001").await.unwrap();
  let (ws, _) = ClientBuilder::new()
    .uri("ws://localhost:3001")
    .unwrap()
    .connect_on(tcp)
    .await
    .unwrap();
  let node_logger = Arc::new(NodeStateLogger::new(ws));

  // console_subscriber::init();
  let eval = Evaluator::new(
    cli.filename.unwrap().to_str().unwrap().to_string(),
    None,
    Some(node_logger.clone()),
    Some(node_logger.clone()),
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

  node_logger.shutdown().await;
}
