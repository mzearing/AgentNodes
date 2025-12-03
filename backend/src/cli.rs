use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "agent_nodes", about = "Runs compiled programs by the AgentNodes ui", long_about = None)]
pub struct Cli
{
  #[arg(required_unless_present = "print_schemas")]
  pub filename: Option<PathBuf>,
  #[arg(short, long)]
  pub print_output: bool,

  #[arg(long)]
  pub print_schemas: bool,
}
