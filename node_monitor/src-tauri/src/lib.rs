use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, net::TcpListener, time::Duration};
use tauri::{AppHandle, Emitter};
use tungstenite::{accept, Message};

#[derive(Serialize, Deserialize, Clone)]
struct NodeInfo
{
  node_id: String,
  node_type: String,
  state: String,
}

fn table_index(state: &str) -> Result<usize>
{
  match state
  {
    "Waiting" => Ok(0),
    "Processing" => Ok(1),
    "Outputting" => Ok(2),
    _ => Err(anyhow!("Invalid state")),
  }
}

fn listen_thread(listener: TcpListener, app_handle: AppHandle) -> Result<()>
{
  std::thread::sleep(Duration::from_secs(1));
  let mut tables: [HashMap<String, NodeInfo>; 3] = [HashMap::new(), HashMap::new(), HashMap::new()];
  app_handle.emit("hellorld", ())?;
  loop
  {
    for rstream in listener.incoming()
    {
      let stream = rstream?;
      let mut websocket = accept(stream)?;
      let res: Result<()> = {
        loop
        {
          if !websocket.can_read() || !websocket.can_write()
          {
            break;
          }
          let message = websocket.read()?;
          if let Message::Close(Some(_)) = message
          {
            break;
          }
          let text = message.into_text()?.to_string();
          let node: NodeInfo = serde_json::from_str(&text)?;
          tables.iter_mut().for_each(|x| {
            x.remove(&node.node_id);
          });
          let index = table_index(&node.state)?;
          tables[index].insert(node.node_id.clone(), node);
          app_handle.emit("update_tables", tables.clone())?;
        }
        Ok(())
      };
      if let Err(e) = res
      {
        println!("Errored out! {e}");
        break;
      }
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run()
{
  let listener = TcpListener::bind("0.0.0.0:3001").unwrap();
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let handle = app.handle().clone();
      std::thread::spawn(move || listen_thread(listener, handle));
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
