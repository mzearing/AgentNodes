import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';
import { IOType } from '../types/project';
import { v4 as uuidv4 } from 'uuid';
import { determineConnectionStrength } from '../utils/connectionUtils';
import { configurationService } from './configurationService';

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
  outputs: any[];
  inputs: Array<[any, string, number, boolean]>; // Updated to include strong boolean
}

export type NodeType = 
  | { Atomic: string }
  | { Atomic: { Value: any } }
  | { Atomic: { BinOp: string } }
  | { Atomic: { UnaryOp: string } }
  | { Atomic: { Control: string } }
  | { Atomic: { Control: { WaitForInit: [string, string, number, boolean] } } }
  | { Atomic: { Control: { While: [string, string, number, boolean] } } }
  | { Atomic: { Control: { If: [string, string, number, boolean] } } }
  | { Atomic: { Variable: [string, string] } }
  | { Atomic: { Io: string | { Open: string } } }
  | { Atomic: { Cast: string } }
  | { Atomic: { LogicalOp: string } }
  | { Atomic: { AgentOp: string | { Create: string } } }
  | { Complex: string };

export class CompilationService {
  private currentOutputDir: string | undefined;

  private computeRelativePath(fromDir: string, toFile: string): string {
    const fromParts = fromDir.replace(/^\.\//, '').split('/').filter(Boolean);
    const toParts = toFile.replace(/^\.\//, '').split('/').filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
      common++;
    }
    const ups = fromParts.length - common;
    const remaining = toParts.slice(common);
    return [...Array(ups).fill('..'), ...remaining].join('/');
  }

  /**
   * Compiles a canvas (React Flow data) into the backend format
   */
  async compile(canvasData: ReactFlowJsonObject<Node, Edge>, isComplexNode = false, outputPath?: string): Promise<CompilationResult> {
    try {
      // Store the output directory for relative path computation
      if (outputPath) {
        this.currentOutputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
      }
      console.log('CompilationService.compile called with:', canvasData);
      
      // Debug: Log the actual node mappings and connections
      console.log('DEBUG: All nodes in canvas:');
      canvasData.nodes.forEach((node: any) => {
        console.log(`  ${node.id} (${node.data?.nodeId}): ${node.data?.name || 'unnamed'}`);
      });
      
      console.log('DEBUG: All edges in canvas:');
      canvasData.edges.forEach((edge: any) => {
        console.log(`  ${edge.source}[${edge.sourceHandle}] → ${edge.target}[${edge.targetHandle}]`);
      });
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
        console.log(`DEBUG: Canvas node ${node.id} (${node.data?.nodeId}) → UUID ${uuid}`);
        
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
          
          // Error if trying to use variables in complex nodes
          if (isComplexNode) {
            errors.push(`Variable nodes (${nodeData.label || 'Unknown'}) are not supported inside complex node groups. Variables can only be used in main programs.`);
          }
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
      
      // Second pass: Compile each node (skip variable nodes in complex nodes)
      for (const node of canvasData.nodes) {
        const uuid = nodeIdMap.get(node.id);
        if (!uuid) continue;
        
        // Skip variable nodes when compiling complex nodes
        const nodeData = node.data as any;
        if (isComplexNode && nodeData.isVariableNode) {
          continue;
        }
        
        const compiledInstance = await this.compileNode(node, canvasData.edges, nodeIdMap, canvasData.nodes);
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
      
      this.currentOutputDir = undefined;
      return { success: true, data: compiledProgram };

    } catch (error) {
      this.currentOutputDir = undefined;
      return {
        success: false,
        errors: [`Compilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  private async compileNode(
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
    
    // Map output types - special handling for finish, print, and variable nodes
    let outputs: (string | object)[];
    if (nodeId === 'finish') {
      // For finish nodes, outputs should match the program outputs (based on inputs)
      const nodeInputs = (node.data as any)?.inputs || [];
      outputs = this.mapIOTypes(nodeInputs);
    } else if ((nodeId as string)?.startsWith('variable_set_')) {
      // Variable setters have no outputs
      outputs = [];
    } else if ((nodeId as string)?.startsWith('variable_get_')) {
      // Variable getters output the type they store
      const nodeOutputs = (node.data as any)?.outputs || [];
      outputs = this.mapIOTypes(nodeOutputs);
    } else if ((metadataPath as string)?.startsWith('complex/')) {
      // For complex nodes, read outputs from compiled.json
      try {
        const groupId = (metadataPath as string).split('/')[1];
        const compiledPath = `${configurationService.getNodeDefinitionsPath()}/complex/${groupId}/${nodeId}/compiled.json`;
        // Use Electron API to read the compiled.json file
        if (window.electronAPI?.readFile) {
          const compiledContent = await window.electronAPI.readFile(compiledPath);
          const compiledData = JSON.parse(compiledContent);
          outputs = compiledData.outputs || [];
        } else {
          throw new Error('Electron API not available');
        }
      } catch (error) {
        console.warn(`Failed to read outputs for complex node ${nodeId}:`, error);
        outputs = ['None']; // Fallback
      }
    } else {
      const nodeOutputs = (node.data as any)?.outputs || [];
      outputs = this.mapIOTypes(nodeOutputs);
    }

    // Append "None" for control flow output (separate from data outputs)
    const nodeData = node.data as any;
    if (nodeData?.controlFlowOutput) {
      outputs.push('None');
    }
    
    // Find input connections (strength determination now handled by shared logic)
    let inputConnections: Array<[any, string, number, boolean]>;
    
    if ((nodeId as string)?.startsWith('variable_get_')) {
      // Variable getters have no inputs
      inputConnections = [];
    } else {
      // All other nodes get connections with strength determined by shared logic
      inputConnections = this.findInputConnections(node.id, edges, nodeIdMap, allNodes);
    }
    
    // Determine node type based on metadata and nodeId, passing node info for connection-based types
    const nodeType = this.determineNodeType(nodeId as string, metadataPath as string, (node.data as any)?.constantValues, node, edges, nodeIdMap, allNodes);
    
    const instance: CompiledInstance = {
      node_type: nodeType,
      default_overrides: {},
      outputs,
      inputs: inputConnections
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
      const opMap: Record<string, string> = {
        '+': 'Add', '-': 'Sub', '*': 'Mul', '/': 'Div', '**': 'Pow', '%': 'Mod',
        'Add': 'Add', 'Sub': 'Sub', 'Mul': 'Mul', 'Div': 'Div', 'Pow': 'Pow', 'Mod': 'Mod'
      };
      const operation = constantValues?.[0]?.value || 'Add';
      const finalOp = opMap[operation] || 'Add';
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
      const opMap: Record<string, string> = {
        'and': 'And', 'or': 'Or', 'xor': 'Xor', 'not': 'Not', 'eq': 'Eq',
        'And': 'And', 'Or': 'Or', 'Xor': 'Xor', 'Not': 'Not', 'Eq': 'Eq'
      };
      const operation = constantValues?.[0]?.value || 'And';
      const finalOp = opMap[operation] || 'And';
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
    
    // Handle variable setter nodes
    if (nodeId?.startsWith('variable_set_')) {
      const variableName = (node?.data as any)?.variableName || nodeId.replace('variable_set_', '');
      return { Atomic: { Variable: ["Set", variableName] } };
    }
    
    // Handle variable getter nodes
    if ((nodeId as string)?.startsWith('variable_get_')) {
      const variableName = (node?.data as any)?.variableName || nodeId.replace('variable_get_', '');
      return { Atomic: { Variable: ["Get", variableName] } };
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
    
    if (nodeId === 'console-input') {
      return { Atomic: { Io: 'ConsoleInput' } };
    }
    
    // Control flow nodes with connections
    if (nodeId === 'while-loop') {
      // While loops need [DataType, uuid, usize] format for body execution
      // Use syntactic sugar: automatically resolve the body connection
      const bodyConnection = this.findControlFlowBodyConnection(node!, edges!, nodeIdMap!, allNodes!);
      return { Atomic: { Control: { While: bodyConnection } } };
    }
    
    if (nodeId === 'if-condition') {
      // If conditions need [DataType, uuid, usize] format for then branch
      // Use syntactic sugar: automatically resolve the then branch connection
      const thenConnection = this.findControlFlowBodyConnection(node!, edges!, nodeIdMap!, allNodes!);
      return { Atomic: { Control: { If: thenConnection } } };
    }
    
    if (nodeId === 'wait-for-init') {
      // Wait for init needs [DataType, uuid, usize] format
      // Use syntactic sugar: automatically resolve the target connection
      const targetConnection = this.findControlFlowBodyConnection(node!, edges!, nodeIdMap!, allNodes!);
      return { Atomic: { Control: { WaitForInit: targetConnection } } };
    }
    
    // Handle complex nodes
    if (metadataPath?.startsWith('complex/')) {
      const groupId = metadataPath.split('/')[1];
      const nodeDefPath = configurationService.getNodeDefinitionsPath();
      const childPath = `${nodeDefPath}/complex/${groupId}/${nodeId}/compiled.json`;
      if (this.currentOutputDir) {
        return { Complex: this.computeRelativePath(this.currentOutputDir, childPath) };
      }
      // Fallback: assume parent is directly under nodeDefinitionsPath
      return { Complex: `complex/${groupId}/${nodeId}/compiled.json` };
    }
    
    // Handle agent operations
    if (nodeId === 'agent-create') {
      // Extract agent type from constantValues or default to OpenAi
      const agentType = constantValues?.[0]?.value || 'OpenAi';
      return { Atomic: { AgentOp: { Create: agentType } } };
    }
    
    if (nodeId === 'agent-send') {
      return { Atomic: { AgentOp: 'Send' } };
    }
    
    if (nodeId === 'agent-receive') {
      return { Atomic: { AgentOp: 'Recieve' } };
    }
    
    // Default to atomic with the nodeId
    return { Atomic: nodeId };
  }

  private findInputConnections(
    nodeId: string,
    edges: Edge[],
    nodeIdMap: Map<string, string>,
    allNodes: Node[]
  ): Array<[any, string, number, boolean]> {

    const connections: Array<[any, string, number, boolean]> = [];

    // Find all edges that target this node
    const incomingEdges = edges.filter(edge => edge.target === nodeId);

    for (const edge of incomingEdges) {
      const sourceUuid = nodeIdMap.get(edge.source);
      if (!sourceUuid) continue;

      // Check if this is a control flow connection
      const targetNode = allNodes.find(node => node.id === edge.target);
      const targetData = targetNode?.data as any;
      const isTargetControlFlow = targetData?.controlFlowInput?.id === edge.targetHandle;

      // Check if source is a control flow output
      const sourceNode = allNodes.find(node => node.id === edge.source);
      const sourceData = sourceNode?.data as any;
      const isSourceControlFlow = sourceData?.controlFlowOutput?.id === edge.sourceHandle;

      if (isTargetControlFlow && isSourceControlFlow) {
        // Control flow connection: source output index is the last index (after data outputs)
        const sourceOutputs = sourceData?.outputs || [];
        const cfOutputIndex = sourceOutputs.length; // control flow output is appended after data outputs

        // Determine connection strength
        const isStrong = targetNode ? determineConnectionStrength(targetNode, edge.targetHandle) : true;

        connections.push(['None', sourceUuid, cfOutputIndex, isStrong]);
        continue;
      }

      // Regular data connection
      const outputIndex = this.parseOutputIndex(edge.sourceHandle);
      const inputType = this.parseInputType(edge.targetHandle, edge.target, allNodes);

      const isStrong = targetNode ? determineConnectionStrength(targetNode, edge.targetHandle) : true;

      connections.push([inputType, sourceUuid, outputIndex, isStrong]);
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
  
  private parseInputType(targetHandle: string, targetNodeId: string, allNodes: Node[]): any {
    // Find the target node
    const targetNode = allNodes.find(node => node.id === targetNodeId);
    if (!targetNode) {
      return 'Integer'; // Fallback
    }

    const nodeData = targetNode.data as any;

    // Check if target handle is a control flow input
    if (nodeData?.controlFlowInput?.id === targetHandle) {
      return 'None';
    }

    if (!nodeData?.inputs) {
      return 'Integer'; // Fallback
    }

    const inputs = nodeData.inputs;

    // Find the input by matching the handle ID to input.id
    let inputIndex = 0;
    for (let i = 0; i < inputs.length; i++) {
      if (inputs[i].id === targetHandle) {
        inputIndex = i;
        break;
      }
    }

    const input = inputs[inputIndex];
    if (!input) {
      return 'Integer'; // Fallback
    }

    // Map the input type to backend schema types
    return this.mapIOTypeToBackend(input.type);
  }
  
  private mapIOTypes(outputs: any[]): any[] {
    return outputs.map(output => this.mapIOTypeToBackend(output.type));
  }
  
  private mapIOTypeToBackend(ioType: number): string | object {
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
      case IOType.Agent: return { 'Agent': 'OpenAi' }; // Use proper Agent complex type
      case IOType.None:
      default: return 'None';
    }
  }

  
  private normalizeType(type: any): string {
    // Convert complex types to comparable string format for type checking only
    if (typeof type === 'object' && type !== null) {
      return JSON.stringify(type);
    }
    return String(type);
  }
  
  private isComplexType(type: any): boolean {
    return typeof type === 'object' && type !== null;
  }

  private typesEqual(type1: any, type2: any): boolean {
    return this.normalizeType(type1) === this.normalizeType(type2);
  }

  private canAutocast(fromType: any, toType: any): boolean {
    // Return true if backend supports automatic casting from one type to another
    if (this.typesEqual(fromType, toType)) return true;
    
    // Normalize types for comparison
    const fromTypeStr = this.normalizeType(fromType);
    const toTypeStr = this.normalizeType(toType);
    
    // None type: only None <-> None (strict control flow separation)
    if (toTypeStr === 'None') return fromTypeStr === 'None';
    if (fromTypeStr === 'None') return false;
    
    
    // Special handling for Agent types
    if (this.isComplexType(fromType) && this.isComplexType(toType)) {
      // Allow Agent to Agent type compatibility
      if (fromTypeStr.includes('"Agent"') && toTypeStr.includes('"Agent"')) {
        return true; // Agent types are compatible with each other
      }
      return false; // Other complex types cannot be autocast
    }
    
    // Complex types (objects) generally cannot be autocast to/from simple types
    if (this.isComplexType(fromType) || this.isComplexType(toType)) {
      return false; // No casting between complex and simple types
    }
    
    // Note: The None->Boolean compatibility is overridden by the stricter None rule above
    if (fromTypeStr === 'Integer' && toTypeStr === 'Float') return true; 
    if (fromTypeStr === 'Float' && toTypeStr === 'Integer') return true;
    
    // Additional implicit conversions supported by backend arithmetic operations:
    // These are handled automatically by the backend in binary operations
    // String casts removed: backend try_cast doesn't support Cast("String").
    // String concatenation is handled natively by the backend's Add operator.
    
    return false;
  }
  
  private createCastNode(fromType: any, toType: any): CompiledInstance {
    // For cast nodes, we need to determine what cast type to use
    // Complex types like Agent can't be cast, so this should rarely be used for Agent types
    const castType = this.isComplexType(toType) ? this.normalizeType(toType) : toType;
    return {
      node_type: { Atomic: { Cast: castType } },
      default_overrides: {},
      outputs: [toType], // Preserve original format for outputs
      inputs: [[fromType, '', 0, true]] // Will be filled by connection logic, default to strong
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
      const newInputs: Array<[any, string, number, boolean]> = [];
      
      for (let i = 0; i < instance.inputs.length; i++) {
        const [expectedType, sourceNodeId, sourceOutputIndex, isStrong] = instance.inputs[i];
        
        // Find the source node and its output type
        const sourceInstance = updatedInstances[sourceNodeId];
        if (!sourceInstance) {
          castErrors.push(`Cannot find source node ${sourceNodeId} for input ${i} of node ${nodeId}`);
          newInputs.push(instance.inputs[i]);
          continue;
        }
        
        const actualType = sourceInstance.outputs[sourceOutputIndex] || 'None';
        
        // Check if cast is needed
        if (!this.typesEqual(expectedType, actualType)) {
          const expectedTypeStr = this.normalizeType(expectedType);
          const actualTypeStr = this.normalizeType(actualType);
          
          // Debug: Log type information for Agent-related connections
          if (expectedTypeStr.includes('Agent') || actualTypeStr.includes('Agent')) {
            console.log(`DEBUG Agent connection: Node ${nodeId} input ${i} expects ${expectedTypeStr}, got ${actualTypeStr} from ${sourceNodeId}[${sourceOutputIndex}]`);
            console.log(`Source instance outputs:`, JSON.stringify(sourceInstance.outputs, null, 2));
            console.log(`Expected type object:`, JSON.stringify(expectedType, null, 2));
            console.log(`Actual type object:`, JSON.stringify(actualType, null, 2));
            console.log(`Source node type:`, JSON.stringify(sourceInstance.node_type, null, 2));
          }
          
          if (this.canAutocast(actualType, expectedType)) {
            // Insert cast node with proper UUID
            const castNodeId = uuidv4(); // Use proper UUID instead of custom format
            const castInstance = this.createCastNode(actualType, expectedType);
            castInstance.inputs = [[actualType, sourceNodeId, sourceOutputIndex, isStrong]];
            
            updatedInstances[castNodeId] = castInstance;
            newInputs.push([expectedType, castNodeId, 0, isStrong]);
            
            console.log(`Inserted automatic cast from ${actualTypeStr} to ${expectedTypeStr} for node ${nodeId} input ${i} (cast node: ${castNodeId})`);
          } else {
            // Type mismatch that can't be automatically resolved
            castErrors.push(
              `Type mismatch for node ${nodeId} input ${i}: expected ${expectedTypeStr}, got ${actualTypeStr}. ` +
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
  
  private findControlFlowBodyConnection(
    node: Node,
    edges: Edge[],
    nodeIdMap: Map<string, string>,
    allNodes: Node[]
  ): [any, string, number, boolean] {
    const nodeData = node.data as any;

    // First, check for control flow output handle connections
    if (nodeData?.controlFlowOutput) {
      const cfOutId = nodeData.controlFlowOutput.id;
      const cfEdge = edges.find(edge => edge.source === node.id && edge.sourceHandle === cfOutId);
      if (cfEdge) {
        const targetNodeId = nodeIdMap.get(cfEdge.target);
        if (targetNodeId) {
          // Control flow output index is after all data outputs
          const dataOutputs = nodeData?.outputs || [];
          const cfOutputIndex = dataOutputs.length;
          return ['None', targetNodeId, cfOutputIndex, true];
        }
      }
    }

    // Fallback: find any outgoing edge (legacy behavior)
    const outgoingEdges = edges.filter(edge => edge.source === node.id);

    if (outgoingEdges.length > 0) {
      const targetEdge = outgoingEdges[0];
      const targetNodeId = nodeIdMap.get(targetEdge.target);
      const outputIndex = this.parseOutputIndex(targetEdge.sourceHandle);

      if (targetNodeId) {
        const inputType = this.parseInputType(targetEdge.targetHandle, targetEdge.target, allNodes);
        return [inputType, targetNodeId, outputIndex, true];
      }
    }

    // Fallback to default connection
    return ['None', '00000000-0000-0000-0000-000000000000', 0, true];
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