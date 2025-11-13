use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "agent_nodes", about = "Runs compiled programs by the AgentNodes ui", long_about = None)]
pub struct Cli
{
  pub filename: PathBuf,
  #[arg(short, long)]
  pub print_output: bool,
}
