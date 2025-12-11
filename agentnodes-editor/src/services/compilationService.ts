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
  | { Atomic: { UnaryOp: string } }
  | { Atomic: { Control: string } }
  | { Atomic: { Control: { WaitForInit: [string, string, number] } } }
  | { Atomic: { Control: { While: [string, string, number] } } }
  | { Atomic: { Variable: [string, string, number] } }
  | { Atomic: { Io: string | { Open: string } } }
  | { Atomic: { Cast: string } }
  | { Atomic: { LogicalOp: string } }
  | { Complex: string };

export class CompilationService {
  
  /**
   * Compiles a canvas (React Flow data) into the backend format
   */
  compile(canvasData: ReactFlowJsonObject<Node, Edge>): CompilationResult {
    try {
      console.log('CompilationService.compile called with:', canvasData);
      const errors: string[] = [];
      let instances: Record<string, CompiledInstance> = {};
      const nodeIdMap = new Map<string, string>(); // Maps canvas node IDs to UUIDs
      
      // Validate canvas data structure
      if (!canvasData || !canvasData.nodes || !Array.isArray(canvasData.nodes)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid nodes array'] };
      }
      
      if (!canvasData.edges || !Array.isArray(canvasData.edges)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid edges array'] };
      }
      
      // Start and finish nodes are optional for compilation
      
      // First pass: Create UUIDs for all nodes and identify variables
      const variableNodes: Node[] = [];
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
        
        // Collect variable get/set nodes
        const nodeData = node.data as any;
        if (nodeData.isVariableNode) {
          variableNodes.push(node);
        }
      }
      
      // Don't create separate declaration nodes - variables will be handled during compilation
      
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
      
      // Third pass: Insert automatic cast nodes where needed
      const { updatedInstances, castErrors } = this.insertAutomaticCasts(instances, nodeIdMap);
      instances = updatedInstances;
      errors.push(...castErrors);
      
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
    
    // Map output types - special handling for finish and print nodes
    let outputs: string[];
    if (nodeId === 'finish') {
      // For finish nodes, outputs should match the program outputs (based on inputs)
      const nodeInputs = (node.data as any)?.inputs || [];
      outputs = this.mapIOTypes(nodeInputs);
    } else if (nodeId === 'print') {
      // Print nodes always output ["None"] regardless of UI definition
      outputs = ['None'];
    } else {
      outputs = this.mapIOTypes((node.data as any)?.outputs || []);
    }
    
    // Find input connections
    const inputConnections = this.findInputConnections(node.id, edges, nodeIdMap, allNodes);
    
    // Determine node type based on metadata and nodeId, passing node info for connection-based types
    const nodeType = this.determineNodeType(nodeId as string, metadataPath as string, (node.data as any)?.constantValues, node, edges, nodeIdMap, allNodes);
    
    // Special case: Variable getters need execution trigger from their setter  
    let finalInputConnections = inputConnections;
    if (typeof nodeId === 'string' && nodeId.startsWith('variable_get_')) {
      // Find the corresponding setter to create execution dependency
      const nodeData = node.data as any;
      const variableSetter = allNodes.find(n => {
        const data = n.data as any;
        return data.isVariableNode && !data.isGetter && data.variableId === nodeData.variableId;
      });
      
      if (variableSetter) {
        const setterUuid = nodeIdMap.get(variableSetter.id);
        if (setterUuid) {
          // Use the setter's output as a trigger (but get data via Variable reference)
          const variableType = this.mapIOTypeToBackend((nodeData.outputs?.[0]?.type || 0) as IOType);
          finalInputConnections = [[variableType, setterUuid, 0]];
        } else {
          finalInputConnections = [];
        }
      } else {
        finalInputConnections = [];
      }
    }
    
    const instance: CompiledInstance = {
      node_type: nodeType,
      default_overrides: {},
      outputs,
      inputs: finalInputConnections
    };
    
    return { success: true, instance };
  }
  
  private determineNodeType(nodeId: string, metadataPath?: string, constantValues?: any[], node?: Node, edges?: Edge[], nodeIdMap?: Map<string, string>, allNodes?: Node[]): NodeType {
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
    
    // Handle specific atomic nodes with operation selection
    if (nodeId === 'binary-operation') {
      // Extract operation from constantValues (should be a string like "Add", "Sub", etc.)
      const operation = constantValues?.[0]?.value || 'Add';
      const validOps = ['Add', 'Sub', 'Mul', 'Div', 'Pow', 'Mod'];
      const finalOp = validOps.includes(operation) ? operation : 'Add';
      return { Atomic: { BinOp: finalOp } };
    }
    
    if (nodeId === 'unary-operation') {
      // Extract operation from constantValues 
      const operation = constantValues?.[0]?.value || 'Neg';
      const validOps = ['Neg'];
      const finalOp = validOps.includes(operation) ? operation : 'Neg';
      return { Atomic: { UnaryOp: finalOp } };
    }
    
    if (nodeId === 'logical-operation') {
      // Extract operation from constantValues
      const operation = constantValues?.[0]?.value || 'And';
      const validOps = ['And', 'Or', 'Xor', 'Not', 'Eq'];
      const finalOp = validOps.includes(operation) ? operation : 'And';
      return { Atomic: { LogicalOp: finalOp } };
    }
    
    if (nodeId === 'print') {
      return { Atomic: 'Print' };
    }
    
    if (nodeId === 'replace') {
      return { Atomic: 'Replace' };
    }
    
    if (nodeId === 'is-none') {
      return { Atomic: 'IsNone' };
    }
    
    // Handle variable get/set nodes with syntactic sugar
    if (nodeId?.startsWith('variable_get_') || nodeId?.startsWith('variable_set_')) {
      return this.compileVariableNode(node, nodeIdMap, edges, allNodes);
    }
    
    if (nodeId === 'variable') {
      // Variables need [DataType, uuid, usize] format
      // Try to get actual connection info if available, otherwise use constants
      const variableType = constantValues?.[0]?.value || 'String';
      const variableId = constantValues?.[1]?.value || '00000000-0000-0000-0000-000000000000';
      const variableIndex = constantValues?.[2]?.value || 0;
      return { Atomic: { Variable: [variableType, variableId, variableIndex] } };
    }
    
    // IO operations
    if (nodeId === 'tcp-socket') {
      return { Atomic: { Io: { Open: 'TcpSocket' } } };
    }
    
    if (nodeId === 'file-open') {
      return { Atomic: { Io: { Open: 'File' } } };
    }
    
    if (nodeId === 'get-line') {
      return { Atomic: { Io: 'GetLine' } };
    }
    
    if (nodeId === 'write') {
      return { Atomic: { Io: 'Write' } };
    }
    
    if (nodeId === 'read') {
      return { Atomic: { Io: 'Read' } };
    }
    
    // Control flow nodes with connections
    if (nodeId === 'while-loop') {
      // While loops need [DataType, uuid, usize] format for condition
      const conditionType = constantValues?.[0]?.value || 'Boolean';
      const conditionNodeId = constantValues?.[1]?.value || '00000000-0000-0000-0000-000000000000';
      const conditionIndex = constantValues?.[2]?.value || 0;
      return { Atomic: { Control: { While: [conditionType, conditionNodeId, conditionIndex] } } };
    }
    
    if (nodeId === 'wait-for-init') {
      // Wait for init needs [DataType, uuid, usize] format
      const waitType = constantValues?.[0]?.value || 'None';
      const waitNodeId = constantValues?.[1]?.value || '00000000-0000-0000-0000-000000000000';
      const waitIndex = constantValues?.[2]?.value || 0;
      return { Atomic: { Control: { WaitForInit: [waitType, waitNodeId, waitIndex] } } };
    }
    
    // Handle complex nodes
    if (metadataPath?.startsWith('complex/')) {
      const groupId = metadataPath.split('/')[1];
      return { Complex: `${groupId}/${nodeId}/compiled.json` };
    }
    
    // Default to atomic with the nodeId
    return { Atomic: nodeId };
  }

  private compileVariableNode(node?: Node, nodeIdMap?: Map<string, string>, edges?: Edge[], allNodes?: Node[]): NodeType {
    if (!node || !nodeIdMap || !edges || !allNodes) {
      console.error('Cannot compile variable node without complete data');
      return { Atomic: 'Print' }; // Fallback
    }

    const nodeData = node.data as any;
    const isGetter = nodeData.isGetter;
    const variableType = this.mapIOTypeToBackend(
      isGetter ? (nodeData.outputs?.[0]?.type || 0) : (nodeData.inputs?.[0]?.type || 0)
    );

    if (isGetter) {
      // Variable getter: Reference the setter node directly (setter stores the value)
      const variableSetter = allNodes.find(n => {
        const data = n.data as any;
        return data.isVariableNode && !data.isGetter && data.variableId === nodeData.variableId;
      });
      
      if (variableSetter) {
        const setterUuid = nodeIdMap.get(variableSetter.id);
        if (setterUuid) {
          return {
            Atomic: {
              Variable: [variableType, setterUuid, 0]
            }
          };
        }
      }
      
      // Fallback: Variable with no setter - references a dummy node
      return {
        Atomic: {
          Variable: [variableType, '00000000-0000-0000-0000-000000000000', 0]
        }
      };
    } else {
      // Variable setter: Listen to whatever is connected to this node's input
      const incomingEdge = edges.find(edge => edge.target === node.id);
      if (incomingEdge) {
        const sourceUuid = nodeIdMap.get(incomingEdge.source);
        const outputIndex = this.parseOutputIndex(incomingEdge.sourceHandle);
        
        if (sourceUuid) {
          return {
            Atomic: {
              Variable: [variableType, sourceUuid, outputIndex]
            }
          };
        }
      }
      
      // Fallback: Variable with no input connection
      return {
        Atomic: {
          Variable: [variableType, '00000000-0000-0000-0000-000000000000', 0]
        }
      };
    }
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
      
      // Map the input type to backend schema types
      return this.mapIOTypeToBackend(input.type);
    }
    
    // Fallback to default type
    return 'Integer';
  }
  
  private mapIOTypes(outputs: any[]): string[] {
    return outputs.map(output => this.mapIOTypeToBackend(output.type));
  }
  
  private mapIOTypeToBackend(ioType: number): string {
    // Map IOType enum values to backend schema types
    switch (ioType) {
      case IOType.Integer: return 'Integer';
      case IOType.Float: return 'Float';
      case IOType.String: return 'String';
      case IOType.Boolean: return 'Boolean';
      case IOType.Handle: return 'Handle';
      case IOType.Array: return 'Array';
      case IOType.Byte: return 'Byte';
      case IOType.Object: return 'Object';
      case IOType.None:
      default: return 'None';
    }
  }
  
  private canAutocast(fromType: string, toType: string): boolean {
    // Return true if backend supports automatic casting from one type to another
    if (fromType === toType) return true;
    
    // None type compatibility rules:
    // - Any type can be cast to None (for trigger/control flow purposes)
    // - None can only be cast to other None inputs (control flow only)
    if (toType === 'None') return true; // Any type can trigger None inputs
    if (fromType === 'None' && toType !== 'None') return false; // None outputs only go to None inputs
    
    // Note: The None->Boolean compatibility is overridden by the stricter None rule above
    if (fromType === 'Integer' && toType === 'Float') return true; 
    if (fromType === 'Float' && toType === 'Integer') return true;
    
    // Additional implicit conversions supported by backend arithmetic operations:
    // These are handled automatically by the backend in binary operations
    if (toType === 'String' && (fromType === 'Integer' || fromType === 'Float' || fromType === 'Boolean')) {
      return true; // Any type can be implicitly converted to string in string concatenation
    }
    
    return false;
  }
  
  private createCastNode(fromType: string, toType: string): CompiledInstance {
    return {
      node_type: { Atomic: { Cast: toType } },
      default_overrides: {},
      outputs: [toType],
      inputs: [[fromType, '', 0]] // Will be filled by connection logic
    };
  }
  
  private insertAutomaticCasts(
    instances: Record<string, CompiledInstance>, 
    _nodeIdMap: Map<string, string>
  ): { updatedInstances: Record<string, CompiledInstance>, castErrors: string[] } {
    const updatedInstances = { ...instances };
    const castErrors: string[] = [];
    
    // Analyze each node's inputs to see if casts are needed
    for (const [nodeId, instance] of Object.entries(updatedInstances)) {
      const newInputs: Array<[string, string, number]> = [];
      
      for (let i = 0; i < instance.inputs.length; i++) {
        const [expectedType, sourceNodeId, sourceOutputIndex] = instance.inputs[i];
        
        // Find the source node and its output type
        const sourceInstance = updatedInstances[sourceNodeId];
        if (!sourceInstance) {
          castErrors.push(`Cannot find source node ${sourceNodeId} for input ${i} of node ${nodeId}`);
          newInputs.push(instance.inputs[i]);
          continue;
        }
        
        const actualType = sourceInstance.outputs[sourceOutputIndex] || 'None';
        
        // Check if cast is needed
        if (expectedType !== actualType) {
          // Special case: None inputs accept any type directly without cast nodes
          if (expectedType === 'None') {
            // Connect directly to None inputs - no cast node needed
            newInputs.push([expectedType, sourceNodeId, sourceOutputIndex]);
            console.log(`Direct connection from ${actualType} to ${expectedType} for node ${nodeId} input ${i} (trigger input)`);
          } else if (this.canAutocast(actualType, expectedType)) {
            // Insert cast node with proper UUID
            const castNodeId = uuidv4(); // Use proper UUID instead of custom format
            const castInstance = this.createCastNode(actualType, expectedType);
            castInstance.inputs = [[actualType, sourceNodeId, sourceOutputIndex]];
            
            updatedInstances[castNodeId] = castInstance;
            newInputs.push([expectedType, castNodeId, 0]);
            
            console.log(`Inserted automatic cast from ${actualType} to ${expectedType} for node ${nodeId} input ${i} (cast node: ${castNodeId})`);
          } else {
            // Type mismatch that can't be automatically resolved
            castErrors.push(
              `Type mismatch for node ${nodeId} input ${i}: expected ${expectedType}, got ${actualType}. ` +
              `No automatic cast available.`
            );
            newInputs.push(instance.inputs[i]);
          }
        } else {
          // Types match, no cast needed
          newInputs.push(instance.inputs[i]);
        }
      }
      
      // Update the instance with new inputs (potentially going through cast nodes)
      updatedInstances[nodeId] = {
        ...instance,
        inputs: newInputs
      };
    }
    
    return { updatedInstances, castErrors };
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