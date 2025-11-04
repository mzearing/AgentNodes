import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';
import { IOType } from '../types/project';
import { v4 as uuidv4 } from 'uuid';

export interface CompilationResult {
  success: boolean;
  data?: CompiledProgram;
  errors?: string[];
}

export interface CompiledProgram {
  inputs: string[];
  outputs: string[];
  defaults: Record<string, any>;
  instances: Record<string, CompiledInstance>;
  end_node: string;
}

export interface CompiledInstance {
  node_type: NodeType;
  default_overrides: Record<string, any>;
  outputs: string[];
  inputs: Array<[string, string, number]>;
}

export type NodeType = 
  | { Atomic: string }
  | { Atomic: { Value: any } }
  | { Atomic: { BinOp: string } }
  | { Atomic: { Control: string } }
  | { Atomic: { Io: string | { Open: string } } }
  | { Complex: string };

export class CompilationService {
  
  /**
   * Compiles a canvas (React Flow data) into the backend format
   */
  compile(canvasData: ReactFlowJsonObject<Node, Edge>): CompilationResult {
    try {
      console.log('CompilationService.compile called with:', canvasData);
      const errors: string[] = [];
      const instances: Record<string, CompiledInstance> = {};
      const nodeIdMap = new Map<string, string>(); // Maps canvas node IDs to UUIDs
      
      // Validate canvas data structure
      if (!canvasData || !canvasData.nodes || !Array.isArray(canvasData.nodes)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid nodes array'] };
      }
      
      if (!canvasData.edges || !Array.isArray(canvasData.edges)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid edges array'] };
      }
      
      // Start and finish nodes are optional for compilation
      
      // First pass: Create UUIDs for all nodes and basic validation
      for (const node of canvasData.nodes) {
        const uuid = uuidv4();
        nodeIdMap.set(node.id, uuid);
        
        // Basic validation
        if (!node.data?.nodeId) {
          errors.push(`Node ${node.id} is missing nodeId`);
          continue;
        }
        
        if (!node.id) {
          errors.push(`Node is missing id property`);
          continue;
        }
      }
      
      // Validate edges reference valid nodes
      for (const edge of canvasData.edges) {
        if (!nodeIdMap.has(edge.source)) {
          errors.push(`Edge references invalid source node: ${edge.source}`);
        }
        if (!nodeIdMap.has(edge.target)) {
          errors.push(`Edge references invalid target node: ${edge.target}`);
        }
      }
      
      // Early return if there are validation errors
      if (errors.length > 0) {
        return { success: false, errors };
      }
      
      // Second pass: Compile each node
      for (const node of canvasData.nodes) {
        const uuid = nodeIdMap.get(node.id);
        if (!uuid) continue;
        
        const compiledInstance = this.compileNode(node, canvasData.edges, nodeIdMap, canvasData.nodes);
        if (compiledInstance.success && compiledInstance.instance) {
          instances[uuid] = compiledInstance.instance;
        } else {
          errors.push(...(compiledInstance.errors || [`Failed to compile node ${node.id}`]));
        }
      }
      
      // Determine program inputs and outputs by examining start and finish nodes
      const { inputs, outputs } = this.extractProgramInterface(canvasData.nodes);
      
      // Find the end node (finish node or furthest node in graph)
      const endNode = this.findEndNode(canvasData.nodes, canvasData.edges, nodeIdMap);
      
      if (errors.length > 0) {
        return { success: false, errors };
      }
      
      const compiledProgram: CompiledProgram = {
        inputs,
        outputs,
        defaults: {},
        instances,
        end_node: endNode
      };
      
      return { success: true, data: compiledProgram };
      
    } catch (error) {
      return { 
        success: false, 
        errors: [`Compilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`] 
      };
    }
  }
  
  private compileNode(
    node: Node, 
    edges: Edge[], 
    nodeIdMap: Map<string, string>,
    allNodes: Node[]
  ): { success: boolean; instance?: CompiledInstance; errors?: string[] } {
    
    const nodeId = node.data?.nodeId;
    const metadataPath = node.data?.metadataPath;
    
    if (!nodeId) {
      return { success: false, errors: [`Node ${node.id} missing nodeId`] };
    }
    
    // Map output types - special handling for finish nodes
    let outputs: string[];
    if (nodeId === 'finish') {
      // For finish nodes, outputs should match the program outputs (based on inputs)
      const nodeInputs = (node.data as any)?.inputs || [];
      outputs = this.mapIOTypes(nodeInputs);
    } else {
      outputs = this.mapIOTypes((node.data as any)?.outputs || []);
    }
    
    // Find input connections
    const inputConnections = this.findInputConnections(node.id, edges, nodeIdMap, allNodes);
    
    // Determine node type based on metadata and nodeId
    const nodeType = this.determineNodeType(nodeId as string, metadataPath as string, (node.data as any)?.constantValues);
    
    const instance: CompiledInstance = {
      node_type: nodeType,
      default_overrides: {},
      outputs,
      inputs: inputConnections
    };
    
    return { success: true, instance };
  }
  
  private determineNodeType(nodeId: string, metadataPath?: string, constantValues?: any[]): NodeType {
    // Handle control flow nodes
    if (nodeId === 'start') {
      return { Atomic: { Control: 'Start' } };
    }
    
    if (nodeId === 'finish') {
      return { Atomic: { Control: 'End' } };
    }
    
    // Handle constant value nodes
    if (metadataPath === 'atomic/constants' && constantValues && constantValues.length > 0) {
      return { Atomic: { Value: constantValues[0].value } };
    }
    
    // Handle specific atomic nodes
    if (nodeId === 'binary-operation') {
      return { Atomic: { BinOp: 'Add' } }; // Default to Add, could be configurable
    }
    
    if (nodeId === 'print') {
      return { Atomic: 'Print' };
    }
    
    if (nodeId === 'tcp-socket') {
      return { Atomic: { Io: { Open: 'TcpSocket' } } };
    }
    
    if (nodeId === 'get-line') {
      return { Atomic: { Io: 'GetLine' } };
    }
    
    if (nodeId === 'write') {
      return { Atomic: { Io: 'Write' } };
    }
    
    // Handle complex nodes
    if (metadataPath?.startsWith('complex/')) {
      return { Complex: `${nodeId}.json` };
    }
    
    // Default to atomic with the nodeId
    return { Atomic: nodeId };
  }
  
  private findInputConnections(
    nodeId: string, 
    edges: Edge[], 
    nodeIdMap: Map<string, string>,
    allNodes: Node[]
  ): Array<[string, string, number]> {
    
    const connections: Array<[string, string, number]> = [];
    
    // Find all edges that target this node
    const incomingEdges = edges.filter(edge => edge.target === nodeId);
    
    for (const edge of incomingEdges) {
      const sourceUuid = nodeIdMap.get(edge.source);
      if (!sourceUuid) continue;
      
      // Parse output index from sourceHandle (format: "output-timestamp-index-randomId")
      const outputIndex = this.parseOutputIndex(edge.sourceHandle);
      
      // Parse input type from targetHandle and target node
      const inputType = this.parseInputType(edge.targetHandle, edge.target, allNodes);
      
      connections.push([inputType, sourceUuid, outputIndex]);
    }
    
    return connections;
  }
  
  private parseOutputIndex(sourceHandle: string): number {
    // Handle format: "output-timestamp-index-randomId"
    const parts = sourceHandle.split('-');
    if (parts.length >= 3) {
      const indexPart = parts[2];
      const index = parseInt(indexPart, 10);
      return isNaN(index) ? 0 : index;
    }
    return 0;
  }
  
  private parseInputType(targetHandle: string, targetNodeId: string, allNodes: Node[]): string {
    // Parse format: "input-timestamp-index-randomId"
    const parts = targetHandle.split('-');
    let inputIndex = 0;
    
    if (parts.length >= 3) {
      const indexPart = parts[2];
      const index = parseInt(indexPart, 10);
      inputIndex = isNaN(index) ? 0 : index;
    }
    
    // Find the target node and look up its input type
    const targetNode = allNodes.find(node => node.id === targetNodeId);
    if (targetNode && (targetNode.data as any)?.inputs && (targetNode.data as any).inputs[inputIndex]) {
      const input = (targetNode.data as any).inputs[inputIndex];
      
      // Map the input type using the same logic as mapIOTypes
      switch (input.type) {
        case IOType.Integer: return 'Integer';
        case IOType.Float: return 'Float';
        case IOType.String: return 'String';
        case IOType.Boolean: return 'Boolean';
        case IOType.None:
        default: return 'None';
      }
    }
    
    // Fallback to default type
    return 'Integer';
  }
  
  private mapIOTypes(outputs: any[]): string[] {
    return outputs.map(output => {
      switch (output.type) {
        case IOType.Integer: return 'Integer';
        case IOType.Float: return 'Float';
        case IOType.String: return 'String';
        case IOType.Boolean: return 'Boolean';
        case IOType.None:
        default: return 'None';
      }
    });
  }
  
  private extractProgramInterface(nodes: Node[]): { inputs: string[], outputs: string[] } {
    let inputs: string[] = [];
    let outputs: string[] = [];
    
    // Find start node for inputs
    const startNode = nodes.find(node => node.data?.nodeId === 'start');
    if (startNode && (startNode.data as any)?.outputs) {
      inputs = this.mapIOTypes((startNode.data as any).outputs);
    }
    
    // Find finish node for outputs  
    const finishNode = nodes.find(node => node.data?.nodeId === 'finish');
    if (finishNode && (finishNode.data as any)?.inputs) {
      outputs = this.mapIOTypes((finishNode.data as any).inputs);
    }
    
    return { inputs, outputs };
  }
  
  private findEndNode(nodes: Node[], edges: Edge[], nodeIdMap: Map<string, string>): string {
    // First, try to find a finish node
    const finishNode = nodes.find(node => node.data?.nodeId === 'finish');
    if (finishNode) {
      const endNodeUuid = nodeIdMap.get(finishNode.id);
      if (endNodeUuid) {
        return endNodeUuid;
      }
    }
    
    // If no finish node, find the node that has no outgoing connections (furthest in graph)
    const nodesWithOutgoing = new Set<string>();
    
    // Track all nodes that have outgoing edges
    for (const edge of edges) {
      nodesWithOutgoing.add(edge.source);
    }
    
    // Find nodes with no outgoing edges
    const endCandidates = nodes.filter(node => !nodesWithOutgoing.has(node.id));
    
    if (endCandidates.length > 0) {
      // If multiple end candidates, prefer the one that's not a start node
      const nonStartCandidate = endCandidates.find(node => node.data?.nodeId !== 'start');
      const selectedEndNode = nonStartCandidate || endCandidates[0];
      
      const endNodeUuid = nodeIdMap.get(selectedEndNode.id);
      if (endNodeUuid) {
        return endNodeUuid;
      }
    }
    
    // Fallback: return the UUID of the first node if no end node can be determined
    const firstNode = nodes[0];
    const fallbackUuid = nodeIdMap.get(firstNode?.id);
    return fallbackUuid || '';
  }
}

export const compilationService = new CompilationService();