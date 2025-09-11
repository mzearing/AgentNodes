use std::{
  fs::File,
  path::{self, Path},
};

use super::nodes::Complex;
use crate::language::{
  nodes::NodeType,
  typing::{ArithmaticError, DataValue},
};

#[derive(Debug)]
pub enum EvalError {
  MathError(ArithmaticError),
  InvalidComplexNode(String),
  IoError(std::io::Error),
}
impl From<ArithmaticError> for EvalError {
  fn from(value: ArithmaticError) -> Self {
    EvalError::MathError(value)
  }
}
impl From<std::io::Error> for EvalError {
  fn from(value: std::io::Error) -> Self {
    EvalError::IoError(value)
  }
}

pub trait EvaluateIt {
  fn evaluate(&self, inputs: Vec<DataValue>) -> Result<DataValue, EvalError>;
}

pub struct Evaluator {
  complex_nodes: std::collections::HashMap<String, Complex>,
}

impl Evaluator {
  pub fn new(path: String) -> Result<Self, EvalError> {
    let mut complex_nodes = std::collections::HashMap::<String, Complex>::new();
    let mut path_vec = Vec::new();
    path_vec.push(path.clone());
    while !path_vec.is_empty() {
      let path = path_vec.pop().unwrap();
      let file = File::open(path.clone()).map_err(|x| EvalError::from(x))?;
      let complex = serde_json::from_reader::<File, Complex>(file)
        .map_err(|_| EvalError::InvalidComplexNode(path.to_owned()))?;
      for (_, x) in &complex.instances {
        if let NodeType::Complex(p) = &x.node_type {
          if !complex_nodes.contains_key(p) {
            path_vec.push(p.clone());
          }
        }
      }
      complex_nodes.insert(path.clone(), complex);
    }
    Ok(Self { complex_nodes })
  }
  pub fn get_complex(&self, path: &str) -> Option<Complex> {
    self.complex_nodes.get(path).map(|o| o.clone())
  }
}
