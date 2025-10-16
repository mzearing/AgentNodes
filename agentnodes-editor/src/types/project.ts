import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';

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
}

export interface NodeMetadata {
  summary: NodeSummary
  dependencies: NodeSummary[]
  data: ReactFlowJsonObject<Node, Edge>;
}