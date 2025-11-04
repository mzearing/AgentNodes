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

export enum IOType {
  None = 0,
  Integer,
  Float,
  String,
  Boolean
}

export interface NodeSummary {
  path: string;
  id: string;
  name: string;
  inputs: string[];
  inputTypes: IOType[];
  outputs: string[];
  outputTypes: IOType[];
  variadicOutputs: boolean;
  variadicInputs: boolean;
  constantData: IOType[];
  solo: boolean;
}

export interface NodeMetadata {
  summary: NodeSummary
  dependencies: NodeSummary[]
  data: ReactFlowJsonObject<Node, Edge>;
}
