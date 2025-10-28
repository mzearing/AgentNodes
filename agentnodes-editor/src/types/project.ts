import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';

export type Category = 'Complex' | 'Atomic';

export interface NodeGroup {
  id: string;
  name: string;
  color: string;
  nodes: NodeSummary[];
}

export interface ProjectState {
  hasNodeLoaded: boolean;
  openedNodeName: string;
  openedNodeId: string;
  openedNodePath: string;
  canvasStateCache: ReactFlowJsonObject<Node, Edge>;
}

export interface NodeSummary {
  path: string;
  id: string;
  name: string;
  inputs: string[]
  outputs: string[]
  variadicOutputs: boolean;
  variadicInputs: boolean;
  solo: boolean;
}

export interface NodeMetadata {
  summary: NodeSummary
  dependencies: NodeSummary[]
  data: ReactFlowJsonObject<Node, Edge>;
}