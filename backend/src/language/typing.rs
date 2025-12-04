use crate::ai::AgentType;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  fmt::Display,
  ops::{Add, Div, Mul, Rem, Sub},
};
use uuid::Uuid;

#[derive(Serialize, Debug)]
pub enum ArithmaticError
{
  InvalidCombo(DataValue, DataValue),
  DivByZero,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, JsonSchema)]
pub enum DataType
{
  Array,
  String,
  Integer,
  Float,
  Boolean,
  Byte,
  Handle,
  Object,
  Agent(AgentType),
  None,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq, JsonSchema)]
#[serde(untagged)]
pub enum DataValue
{
  String(String),
  Integer(i64),
  Float(f64),
  Boolean(bool),
  Byte(u8),
  Array(Vec<DataValue>),
  Handle(Uuid),
  Object(HashMap<String, DataValue>),
  Agent(AgentType, Uuid),
  None,
}
impl Display for DataType
{
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result
  {
    write!(f, "{:?}", self)
  }
}
impl Display for DataValue
{
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result
  {
    match self
    {
      DataValue::String(x) => write!(f, "{x}"),
      DataValue::Integer(x) => write!(f, "{x}"),
      DataValue::Float(x) => write!(f, "{x}"),
      DataValue::Boolean(x) => write!(f, "{x}"),
      DataValue::Handle(x) => write!(f, "{x}"),
      DataValue::Array(x) => write!(f, "{}", serde_json::to_string(x).unwrap()),
      DataValue::Byte(x) => write!(f, "{x:x}"),
      DataValue::Object(x) => write!(f, "{}", serde_json::to_string(x).unwrap()),
      DataValue::Agent(t, id) => write!(f, "{t:?}:{id}"),
      DataValue::None => Ok(()),
    }
  }
}

impl Add for DataValue
{
  type Output = Result<Self, ArithmaticError>;

  fn add(self, rhs: Self) -> Self::Output
  {
    match (&self, &rhs)
    {
      (Self::Float(x), Self::Float(y)) => Ok(DataValue::Float(x + y)),
      (Self::Integer(x), Self::Integer(y)) => Ok(DataValue::Integer(x + y)),
      (Self::String(x), Self::String(y)) => Ok(DataValue::String(x.clone() + &y)),
      (Self::Float(x), Self::Integer(y)) => Ok(DataValue::Float(x + *y as f64)),
      (Self::Integer(x), Self::Float(y)) => Ok(DataValue::Float(*x as f64 + y)),
      (Self::String(x), y) => Ok(DataValue::String(format!("{x}{y}"))),
      (x, Self::String(y)) => Ok(DataValue::String(format!("{x}{y}"))),
      _ => Err(ArithmaticError::InvalidCombo(self, rhs)),
    }
  }
}

impl Sub for DataValue
{
  type Output = Result<Self, ArithmaticError>;

  fn sub(self, rhs: Self) -> Self::Output
  {
    match (&self, &rhs)
    {
      (Self::Float(x), Self::Float(y)) => Ok(DataValue::Float(x - y)),
      (Self::Integer(x), Self::Integer(y)) => Ok(DataValue::Integer(x - y)),
      (Self::Float(x), Self::Integer(y)) => Ok(DataValue::Float(x - *y as f64)),
      (Self::Integer(x), Self::Float(y)) => Ok(DataValue::Float(*x as f64 - y)),
      _ => Err(ArithmaticError::InvalidCombo(self, rhs)),
    }
  }
}

impl Mul for DataValue
{
  type Output = Result<Self, ArithmaticError>;

  fn mul(self, rhs: Self) -> Self::Output
  {
    match (&self, &rhs)
    {
      (Self::Float(x), Self::Float(y)) => Ok(DataValue::Float(x * y)),
      (Self::Integer(x), Self::Integer(y)) => Ok(DataValue::Integer(x * y)),
      (Self::Float(x), Self::Integer(y)) => Ok(DataValue::Float(x * *y as f64)),
      (Self::Integer(x), Self::Float(y)) => Ok(DataValue::Float(*x as f64 * y)),
      _ => Err(ArithmaticError::InvalidCombo(self, rhs)),
    }
  }
}

impl Div for DataValue
{
  type Output = Result<Self, ArithmaticError>;

  fn div(self, rhs: Self) -> Self::Output
  {
    match (&self, &rhs)
    {
      (Self::Float(x), Self::Float(y)) =>
      {
        if *y == 0.0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(x / y))
        }
      }
      (Self::Integer(x), Self::Integer(y)) =>
      {
        if *y == 0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Integer(x / y))
        }
      }
      (Self::Float(x), Self::Integer(y)) =>
      {
        if *y == 0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(x / *y as f64))
        }
      }
      (Self::Integer(x), Self::Float(y)) =>
      {
        if *y == 0.0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(*x as f64 / y))
        }
      }
      _ => Err(ArithmaticError::InvalidCombo(self, rhs)),
    }
  }
}

impl Rem for DataValue
{
  type Output = Result<Self, ArithmaticError>;

  fn rem(self, rhs: Self) -> Self::Output
  {
    match (&self, &rhs)
    {
      (Self::Float(x), Self::Float(y)) =>
      {
        if *y == 0.0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(x % y))
        }
      }
      (Self::Integer(x), Self::Integer(y)) =>
      {
        if *y == 0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Integer(x % y))
        }
      }
      (Self::Float(x), Self::Integer(y)) =>
      {
        if *y == 0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(x % *y as f64))
        }
      }
      (Self::Integer(x), Self::Float(y)) =>
      {
        if *y == 0.0
        {
          Err(ArithmaticError::DivByZero)
        }
        else
        {
          Ok(DataValue::Float(*x as f64 % y))
        }
      }
      _ => Err(ArithmaticError::InvalidCombo(self, rhs)),
    }
  }
}

impl DataValue
{
  pub fn pow(&self, power: &Self) -> Result<Self, ArithmaticError>
  {
    match (self, power)
    {
      (&DataValue::Float(b), &DataValue::Float(e)) => Ok(DataValue::Float(b.powf(e))),
      (&DataValue::Integer(b), &DataValue::Integer(e)) =>
      {
        if e < 0
        {
          Ok(DataValue::Float((b as f64).powi(e as i32)))
        }
        else
        {
          Ok(DataValue::Integer(b.pow(e as u32)))
        }
      }
      (&DataValue::Float(b), &DataValue::Integer(e)) =>
      {
        Ok(DataValue::Float((b as f64).powi(e as i32)))
      }
      (&DataValue::Integer(b), &DataValue::Float(e)) => Ok(DataValue::Float((b as f64).powf(e))),
      _ => Err(ArithmaticError::InvalidCombo(self.clone(), power.clone())),
    }
  }
  pub fn get_type(&self) -> DataType
  {
    match self
    {
      DataValue::String(_) => DataType::String,
      DataValue::Integer(_) => DataType::Integer,
      DataValue::Float(_) => DataType::Float,
      DataValue::Boolean(_) => DataType::Boolean,
      DataValue::Byte(_) => DataType::Byte,
      DataValue::Array(_) => DataType::Array,
      DataValue::Handle(_) => DataType::Handle,
      DataValue::Object(_) => DataType::Object,
      DataValue::Agent(t, _) => DataType::Agent(t.clone()),
      DataValue::None => DataType::None,
    }
  }

  pub fn try_cast(&self, to_type: DataType) -> Result<DataValue, (DataType, DataType)>
  {
    if self.get_type() == to_type
    {
      return Ok(self.clone());
    }

    match (self, &to_type)
    {
      (DataValue::None, DataType::Boolean) => Ok(DataValue::Boolean(false)),
      (DataValue::Integer(x), DataType::Float) => Ok(DataValue::Float(x.clone() as f64)),
      (DataValue::Float(x), DataType::Integer) => Ok(DataValue::Integer(x.trunc() as i64)),
      _ => Err((self.get_type(), to_type)),
    }
  }
  pub fn is_none(&self) -> bool
  {
    *self == DataValue::None
  }
}
