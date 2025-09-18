export interface SidebarNode {
  id: string;
  name: string;
  inputs: string[];
  outputs: string[];
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
  solo?: boolean;
}

export interface NodeGroup {
  id: string;
  name: string;
  color: string;
  nodes: SidebarNode[];
}

export type Category = 'Complex' | 'Atomic';