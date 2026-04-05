import { listen } from "@tauri-apps/api/event"

let tables : HTMLTableSectionElement[] =[]

interface NodeInfo
{
  node_id: string,
  node_type: string,
  state: string
}

function update_tables(new_tables: Map<string, NodeInfo>[])
{
  console.log("Should update");
  for(let i = 0; i < 3; i++)
  {
    let ht_table = tables[i];
    let new_table = document.createElement("tbody");
    console.log(new_tables[i]);
    let rows = Array.from(Object.entries(new_tables[i]));

    rows.forEach(([_, node_info]) =>{
      let row = new_table.insertRow(new_table.rows.length);
      row.insertCell(0).innerText = node_info.node_type;
      row.insertCell(1).innerText = node_info.node_id;
    })

    ht_table.replaceWith(new_table);
    tables[i] = new_table;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  tables.push(document.getElementById("Waiting")!    as HTMLTableSectionElement);
  tables.push(document.getElementById("Processing")! as HTMLTableSectionElement);
  tables.push(document.getElementById("Outputting")! as HTMLTableSectionElement);
});

listen<Map<string, NodeInfo>[]>('update_tables', (event) => update_tables(event.payload))



