import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';
import { IOType } from '../types/project';
import { v4 as uuidv4 } from 'uuid';
import { configurationService } from './configurationService';

export interface CompilationResult {
  success: boolean;
  data?: CompiledProgram;
  errors?: string[];
}

export interface CompiledProgram {
  inputs: any[];
  outputs: any[];
  defaults: Record<string, any>;
  instances: Record<string, CompiledInstance>;
  end_node: string;
}

export interface CompiledInstance {
  node_type: NodeType;
  default_overrides: Record<string, any>;
  outputs: string[];                              // UUID strings, one per downstream data consumer
  control_flow_in: Array<Array<[string, number]>>;
  control_flow_out: Array<Array<[string, number]>>;
  inputs: Array<[any, string, number]>;           // 3-tuples: [DataType, sourceUuid, sourcePort]
}

export type NodeType =
  | { Atomic: string }
  | { Atomic: { Value: any } }
  | { Atomic: { BinOp: string } }
  | { Atomic: { UnaryOp: string } }
  | { Atomic: { Control: string } }
  | { Atomic: { Control: { Loop: string } } }
  | { Atomic: { Control: { Loop: { Continue: string } } } }
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
   * Compiles a canvas (React Flow data) into the backend format.
   *
   * Multi-pass pipeline:
   *   1. UUID assignment (+ synthesized Loop::Continue UUIDs for while-loop nodes)
   *   2. Build node metadata (node type, data output types, CF out port count)
   *   3. Classify edges → build CF and data connection maps
   *   3.5. Eliminate Break nodes (rewire CF edges through them)
   *   4. Synthesize Loop::Continue instances
   *   5. Fix End node outputs count
   *   6. Insert automatic casts
   *   7. Assemble final instances
   */
  async compile(canvasData: ReactFlowJsonObject<Node, Edge>, isComplexNode = false, outputPath?: string): Promise<CompilationResult> {
    try {
      if (outputPath) {
        this.currentOutputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
      }

      const errors: string[] = [];

      // --- Validation ---
      if (!canvasData?.nodes || !Array.isArray(canvasData.nodes)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid nodes array'] };
      }
      if (!canvasData?.edges || !Array.isArray(canvasData.edges)) {
        return { success: false, errors: ['Invalid canvas data: missing or invalid edges array'] };
      }

      // ====== Pass 1: UUID assignment ======
      const nodeIdMap = new Map<string, string>();       // canvasId → UUID
      const loopContinueMap = new Map<string, string>(); // canvasId (while-loop) → continueUUID
      const breakNodeSet = new Set<string>();            // canvas IDs of break nodes

      for (const node of canvasData.nodes) {
        if (!node.id) { errors.push('Node is missing id property'); continue; }
        if (!node.data?.nodeId) { errors.push(`Node ${node.id} is missing nodeId`); continue; }

        const uuid = uuidv4();
        nodeIdMap.set(node.id, uuid);

        // Variable nodes in complex nodes are forbidden
        const nd = node.data as any;
        if (nd.isVariableNode && isComplexNode) {
          errors.push(`Variable nodes (${nd.label || 'Unknown'}) are not supported inside complex node groups.`);
        }

        // For while-loop nodes, pre-generate Continue UUID
        if (nd.nodeId === 'while-loop') {
          loopContinueMap.set(node.id, uuidv4());
        }

        // Track break nodes for elimination
        if (nd.nodeId === 'break') {
          breakNodeSet.add(node.id);
        }
      }

      // Validate edge endpoints
      for (const edge of canvasData.edges) {
        if (!nodeIdMap.has(edge.source)) errors.push(`Edge references invalid source node: ${edge.source}`);
        if (!nodeIdMap.has(edge.target)) errors.push(`Edge references invalid target node: ${edge.target}`);
      }

      if (errors.length > 0) return { success: false, errors };

      // ====== Pass 2: Build node metadata ======
      // Per-UUID data: nodeType, dataOutputTypes (for type-checking), cfOutPortCount
      interface NodeMeta {
        nodeType: NodeType;
        dataOutputTypes: any[];   // backend type strings for each data output port
        cfOutPortCount: number;   // number of CF out ports (0 for End, 2 for If, 1 for most)
      }

      const metaMap = new Map<string, NodeMeta>();       // UUID → metadata

      for (const node of canvasData.nodes) {
        const uuid = nodeIdMap.get(node.id);
        if (!uuid) continue;

        const nd = node.data as any;
        if (isComplexNode && nd.isVariableNode) continue;

        const nodeId = nd.nodeId as string;
        const metadataPath = nd.metadataPath as string | undefined;
        const constantValues = nd.constantValues;

        // Determine node type (simplified — no edge params needed)
        const nodeType = this.determineNodeType(nodeId, metadataPath, constantValues, node);

        // Determine data output types (for type-checking / auto-cast)
        let dataOutputTypes: any[];
        if (nodeId === 'finish') {
          dataOutputTypes = this.mapIOTypes(nd.inputs || []);
        } else if (nodeId.startsWith('variable_set_')) {
          dataOutputTypes = [];
        } else if (nodeId.startsWith('variable_get_')) {
          dataOutputTypes = this.mapIOTypes(nd.outputs || []);
        } else if (metadataPath?.startsWith('complex/')) {
          // Read output types from compiled.json for type-checking
          try {
            const groupId = metadataPath.split('/')[1];
            const compiledPath = `${configurationService.getNodeDefinitionsPath()}/complex/${groupId}/${nodeId}/compiled.json`;
            if (window.electronAPI?.readFile) {
              const content = await window.electronAPI.readFile(compiledPath);
              const compiled = JSON.parse(content);
              dataOutputTypes = compiled.outputs || [];
            } else {
              throw new Error('Electron API not available');
            }
          } catch {
            dataOutputTypes = ['None'];
          }
        } else {
          dataOutputTypes = this.mapIOTypes(nd.outputs || []);
        }

        // CF out port count
        let cfOutPortCount: number;
        if (nodeId === 'finish') {
          cfOutPortCount = 0;
        } else if (nodeId === 'if-condition') {
          cfOutPortCount = nd.controlFlowOutputs?.length || 2;
        } else if (nodeId === 'while-loop') {
          // Loop::Start has 1 CF out (→ body)
          cfOutPortCount = 1;
        } else if (nd.controlFlowOutput) {
          cfOutPortCount = 1;
        } else {
          cfOutPortCount = 0;
        }

        // while-loop (Loop::Start) has no data outputs
        if (nodeId === 'while-loop') {
          dataOutputTypes = [];
        }

        metaMap.set(uuid, { nodeType, dataOutputTypes, cfOutPortCount });
      }

      // ====== Pass 3: Classify edges and build connection maps ======
      // Per-UUID accumulators
      const outputsMap = new Map<string, string[]>();                     // UUID → consumer UUIDs
      const inputsMap = new Map<string, Array<[any, string, number]>>(); // UUID → data inputs
      const cfInMap = new Map<string, Array<Array<[string, number]>>>();  // UUID → cf_in ports
      const cfOutMap = new Map<string, Array<Array<[string, number]>>>(); // UUID → cf_out ports

      // Also accumulate for synthesized Continue nodes
      const continueNodeCfIn = new Map<string, Array<[string, number]>>(); // continueUUID → cf_in[0] sources

      // Initialize accumulators for all nodes
      for (const [canvasId, uuid] of nodeIdMap) {
        outputsMap.set(uuid, []);
        inputsMap.set(uuid, []);

        const canvasNode = canvasData.nodes.find(n => n.id === canvasId);
        const canvasNodeId = (canvasNode?.data as any)?.nodeId;

        // Start node has no CF-in ports (auto-triggers); all others have 1 CF-in port
        if (canvasNodeId === 'start') {
          cfInMap.set(uuid, []);
        } else {
          cfInMap.set(uuid, [[]]);
        }

        // Initialize cf_out based on port count
        const meta = metaMap.get(uuid);
        const cfOutCount = meta?.cfOutPortCount ?? 0;
        cfOutMap.set(uuid, Array.from({ length: cfOutCount }, () => []));
      }

      // Initialize Continue node accumulators
      for (const [_canvasId, contUuid] of loopContinueMap) {
        continueNodeCfIn.set(contUuid, []);
      }

      // Classify each edge
      for (const edge of canvasData.edges) {
        const sourceCanvasId = edge.source;
        const targetCanvasId = edge.target;
        const sourceUuid = nodeIdMap.get(sourceCanvasId)!;
        const targetUuid = nodeIdMap.get(targetCanvasId)!;
        if (!sourceUuid || !targetUuid) continue;

        const sourceNode = canvasData.nodes.find(n => n.id === sourceCanvasId);
        const targetNode = canvasData.nodes.find(n => n.id === targetCanvasId);
        if (!sourceNode || !targetNode) continue;

        const sourceData = sourceNode.data as any;
        const targetData = targetNode.data as any;

        // Is this a CF edge?
        const isSourceCF = sourceData.controlFlowOutput?.id === edge.sourceHandle ||
          (sourceData.controlFlowOutputs?.some((h: any) => h.id === edge.sourceHandle) ?? false);
        const isTargetCF = targetData.controlFlowInput?.id === edge.targetHandle;

        if (isSourceCF && isTargetCF) {
          // --- Control flow edge ---
          // Determine source CF port index
          let sourceCfPort = 0;
          if (sourceData.controlFlowOutputs) {
            const idx = sourceData.controlFlowOutputs.findIndex((h: any) => h.id === edge.sourceHandle);
            if (idx >= 0) sourceCfPort = idx;
          }
          // Target CF port is always 0

          const targetNodeId = targetData.nodeId as string;

          if (targetNodeId === 'while-loop' && loopContinueMap.has(targetCanvasId)) {
            // Special case: if target is a while-loop, redirect CF to its Continue node
            const contUuid = loopContinueMap.get(targetCanvasId)!;
            // Add to continue node's cf_in
            const contIn = continueNodeCfIn.get(contUuid)!;
            contIn.push([sourceUuid, sourceCfPort]);
            // Add to source's cf_out
            const srcOut = cfOutMap.get(sourceUuid)!;
            if (srcOut[sourceCfPort]) {
              srcOut[sourceCfPort].push([contUuid, 0]);
            }
          } else {
            // Normal CF edge
            // Add [targetUuid, 0] to source's cf_out[sourceCfPort]
            const srcOut = cfOutMap.get(sourceUuid)!;
            if (srcOut[sourceCfPort]) {
              srcOut[sourceCfPort].push([targetUuid, 0]);
            }
            // Add [sourceUuid, sourceCfPort] to target's cf_in[0]
            const tgtIn = cfInMap.get(targetUuid)!;
            tgtIn[0].push([sourceUuid, sourceCfPort]);
          }
        } else if (!isSourceCF && !isTargetCF) {
          // --- Data edge ---
          const outputIndex = this.parseOutputIndex(edge.sourceHandle, sourceCanvasId, canvasData.nodes);
          const inputType = this.parseInputType(edge.targetHandle, targetCanvasId, canvasData.nodes);

          // Add to target's inputs
          inputsMap.get(targetUuid)!.push([inputType, sourceUuid, outputIndex]);
          // Add consumer UUID to source's outputs
          outputsMap.get(sourceUuid)!.push(targetUuid);
        }
        // Mixed CF/data edges are invalid — silently ignore
      }

      // ====== Pass 3.5: Eliminate Break nodes ======
      // Break is a canvas-level concept — rewire CF edges through it and remove it.
      for (const breakCanvasId of breakNodeSet) {
        const breakUuid = nodeIdMap.get(breakCanvasId)!;
        const breakCfIn = cfInMap.get(breakUuid)?.[0] || [];   // sources
        const breakCfOut = cfOutMap.get(breakUuid)?.[0] || [];  // targets

        // Rewire: in each source's cf_out, replace [breakUuid, 0] with break's targets
        for (const [srcUuid, srcPort] of breakCfIn) {
          const srcOut = cfOutMap.get(srcUuid);
          if (srcOut?.[srcPort]) {
            srcOut[srcPort] = srcOut[srcPort]
              .filter(([uuid]) => uuid !== breakUuid)
              .concat(breakCfOut);
          }
        }

        // Rewire: in each target's cf_in, replace [breakUuid, *] with break's sources
        for (const [tgtUuid, tgtPort] of breakCfOut) {
          const tgtIn = cfInMap.get(tgtUuid);
          if (tgtIn?.[tgtPort]) {
            tgtIn[tgtPort] = tgtIn[tgtPort]
              .filter(([uuid]) => uuid !== breakUuid)
              .concat(breakCfIn);
          }
        }

        // Remove break from all maps
        metaMap.delete(breakUuid);
        outputsMap.delete(breakUuid);
        inputsMap.delete(breakUuid);
        cfInMap.delete(breakUuid);
        cfOutMap.delete(breakUuid);
      }

      // ====== Pass 4: Synthesize Loop::Continue nodes ======
      for (const [canvasId, contUuid] of loopContinueMap) {
        const loopStartUuid = nodeIdMap.get(canvasId)!;
        const contCfIn = continueNodeCfIn.get(contUuid) || [];

        // Continue triggers Start programmatically (trigger_processing), not via CF wiring.
        // So Continue's control_flow_out is empty.
        metaMap.set(contUuid, {
          nodeType: { Atomic: { Control: { Loop: { Continue: loopStartUuid } } } },
          dataOutputTypes: [],
          cfOutPortCount: 0
        });

        outputsMap.set(contUuid, []);
        inputsMap.set(contUuid, []);
        cfInMap.set(contUuid, [contCfIn]);
        cfOutMap.set(contUuid, []);  // empty — trigger is programmatic

        // Add Continue→Start wiring in Start's cf_in
        const startCfIn = cfInMap.get(loopStartUuid);
        if (startCfIn && startCfIn.length > 0) {
          startCfIn[0].push([contUuid, 0]);
        }
      }

      // ====== Pass 5: Fix End node outputs count ======
      // The evaluator iterates `0..outputs.len()` to collect program outputs.
      // End node's outputs array must have length = number of program outputs.
      const finishNode = canvasData.nodes.find(n => (n.data as any)?.nodeId === 'finish');
      if (finishNode) {
        const finishUuid = nodeIdMap.get(finishNode.id)!;
        const programOutputCount = ((finishNode.data as any)?.inputs || []).length;
        const placeholders: string[] = [];
        for (let i = 0; i < programOutputCount; i++) {
          placeholders.push(uuidv4());
        }
        outputsMap.set(finishUuid, placeholders);
      }

      // ====== Pass 6: Insert automatic casts ======
      // Build a type lookup map: UUID → data output types
      const outputTypesMap = new Map<string, any[]>();
      for (const [uuid, meta] of metaMap) {
        outputTypesMap.set(uuid, meta.dataOutputTypes);
      }

      // Build reverse map: UUID → canvas node (for multitype checks)
      const uuidToCanvasNode = new Map<string, Node>();
      for (const [canvasId, uuid] of nodeIdMap) {
        const canvasNode = canvasData.nodes.find(n => n.id === canvasId);
        if (canvasNode) uuidToCanvasNode.set(uuid, canvasNode);
      }

      // Process each node's inputs
      const castInstances: Record<string, CompiledInstance> = {};
      for (const [uuid] of metaMap) {
        const nodeInputs = inputsMap.get(uuid)!;
        const newInputs: Array<[any, string, number]> = [];

        for (let i = 0; i < nodeInputs.length; i++) {
          const [expectedType, sourceUuid, sourcePort] = nodeInputs[i];
          const sourceTypes = outputTypesMap.get(sourceUuid);
          const actualType = sourceTypes?.[sourcePort] || 'None';

          if (!this.typesEqual(expectedType, actualType)) {
            // Check multitype compatibility before attempting auto-cast.
            // If the target port is multitype and accepts the source's actual type,
            // use the actual type directly (no cast needed).
            let multitypeResolved = false;
            const targetCanvasNode = uuidToCanvasNode.get(uuid);
            const targetNd = targetCanvasNode?.data as any;
            if (targetNd?.multitypeInputs && targetNd?.availableInputTypes) {
              const backendToIOType = this.createBackendToIOTypeMap();
              const actualIOType = backendToIOType.get(this.normalizeType(actualType));
              if (actualIOType !== undefined) {
                // Find which input port this is (by matching order in inputsMap)
                // Input ports are accumulated per-edge, so we use the handle ordering
                const targetInputHandles = targetNd.inputs || [];
                if (i < targetInputHandles.length) {
                  const availableTypes: number[] | undefined = targetNd.availableInputTypes[i];
                  if (availableTypes && availableTypes.includes(actualIOType)) {
                    newInputs.push([actualType, sourceUuid, sourcePort]);
                    multitypeResolved = true;
                  }
                }
              }
            }

            // Also check if the source has multitype outputs that include the expected type
            if (!multitypeResolved) {
              const sourceCanvasNode = uuidToCanvasNode.get(sourceUuid);
              const sourceNd = sourceCanvasNode?.data as any;
              if (sourceNd?.multitypeOutputs && sourceNd?.availableOutputTypes) {
                const backendToIOType = this.createBackendToIOTypeMap();
                const expectedIOType = backendToIOType.get(this.normalizeType(expectedType));
                if (expectedIOType !== undefined && sourcePort < (sourceNd.outputs || []).length) {
                  const availableTypes: number[] | undefined = sourceNd.availableOutputTypes[sourcePort];
                  if (availableTypes && availableTypes.includes(expectedIOType)) {
                    // The source can produce the expected type — use expected type
                    newInputs.push([expectedType, sourceUuid, sourcePort]);
                    // Also update the source's output type map for downstream checks
                    const srcTypes = outputTypesMap.get(sourceUuid);
                    if (srcTypes && sourcePort < srcTypes.length) {
                      srcTypes[sourcePort] = expectedType;
                    }
                    multitypeResolved = true;
                  }
                }
              }
            }

            if (!multitypeResolved) {
              if (this.canAutocast(actualType, expectedType)) {
                const castUuid = uuidv4();
                const castType = this.isComplexType(expectedType) ? this.normalizeType(expectedType) : expectedType;

                // Create cast instance
                castInstances[castUuid] = {
                  node_type: { Atomic: { Cast: castType } },
                  default_overrides: {},
                  outputs: [uuid],      // consumer is the current node
                  control_flow_in: [],
                  control_flow_out: [],
                  inputs: [[actualType, sourceUuid, sourcePort]]
                };

                // Update output types for the cast node (so downstream casts can reference it)
                outputTypesMap.set(castUuid, [expectedType]);

                // Remove consumer UUID from source's outputs, add cast UUID instead
                const srcOutputs = outputsMap.get(sourceUuid)!;
                const consumerIdx = srcOutputs.indexOf(uuid);
                if (consumerIdx >= 0) srcOutputs[consumerIdx] = castUuid;
                else srcOutputs.push(castUuid);

                // Update input to point to cast node
                newInputs.push([expectedType, castUuid, 0]);
              } else {
                errors.push(
                  `Type mismatch: expected ${this.normalizeType(expectedType)}, got ${this.normalizeType(actualType)}. No automatic cast available.`
                );
                newInputs.push(nodeInputs[i]);
              }
            }
          } else {
            newInputs.push(nodeInputs[i]);
          }
        }

        inputsMap.set(uuid, newInputs);
      }

      if (errors.length > 0) {
        this.currentOutputDir = undefined;
        return { success: false, errors };
      }

      // ====== Pass 6.5: Patch agent-create inputs ======
      // The backend's AgentArgs::from_values expects [Model, Functions, Temperature]
      // but the editor omits the Functions input (unimplemented in backend).
      // Insert a None placeholder at index 1 so Temperature lands at index 2.
      // The None Value node must be wired into the CF chain (before CreateAgent)
      // so the backend triggers it and populates its output.
      for (const [uuid, meta] of metaMap) {
        const nt = meta.nodeType as any;
        if (nt?.Atomic?.AgentOp?.Create) {
          const nodeInputs = inputsMap.get(uuid)!;
          const noneUuid = uuidv4();

          // Read CreateAgent's CF-in sources (port 0)
          const agentCfIn = cfInMap.get(uuid) || [[]];
          const cfInSources: Array<[string, number]> = agentCfIn[0] || [];

          // Wire None node into CF chain: sources → None → CreateAgent
          castInstances[noneUuid] = {
            node_type: { Atomic: { Value: null } },
            default_overrides: {},
            outputs: [uuid],
            control_flow_in: cfInSources.length > 0 ? [cfInSources] : [],
            control_flow_out: [[[uuid, 0]]],
            inputs: []
          };

          // Update CreateAgent's CF-in to reference None instead of original sources
          cfInMap.set(uuid, [[[noneUuid, 0]]]);

          // Update original sources' CF-out to point to None instead of CreateAgent
          for (const [srcUuid, srcPort] of cfInSources) {
            const srcCfOut = cfOutMap.get(srcUuid);
            if (srcCfOut?.[srcPort]) {
              srcCfOut[srcPort] = srcCfOut[srcPort].map(
                ([tgtUuid, tgtPort]) =>
                  tgtUuid === uuid ? [noneUuid, tgtPort] as [string, number] : [tgtUuid, tgtPort]
              );
            }
          }

          outputTypesMap.set(noneUuid, ['None']);
          nodeInputs.splice(1, 0, ['None', noneUuid, 0]);
        }
      }

      // ====== Pass 7: Assemble final instances ======
      let instances: Record<string, CompiledInstance> = {};

      for (const [uuid, meta] of metaMap) {
        instances[uuid] = {
          node_type: meta.nodeType,
          default_overrides: {},
          outputs: outputsMap.get(uuid) || [],
          control_flow_in: cfInMap.get(uuid) || [],
          control_flow_out: cfOutMap.get(uuid) || [],
          inputs: inputsMap.get(uuid) || []
        };
      }

      // Add cast instances
      Object.assign(instances, castInstances);

      // Extract program interface
      const { inputs, outputs } = this.extractProgramInterface(canvasData.nodes);

      // Find end node
      const endNode = this.findEndNode(canvasData.nodes, canvasData.edges, nodeIdMap);

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

  // ─── Node type determination (no edge params needed) ───

  private determineNodeType(nodeId: string, metadataPath?: string, constantValues?: any[], node?: Node): NodeType {
    if (nodeId === 'start') return { Atomic: { Control: 'Start' } };
    if (nodeId === 'finish') return { Atomic: { Control: 'End' } };

    if (metadataPath === 'atomic/constants' && constantValues?.length) {
      return { Atomic: { Value: constantValues[0].value } };
    }

    if (nodeId === 'binary-operation') {
      const opMap: Record<string, string> = {
        '+': 'Add', '-': 'Sub', '*': 'Mul', '/': 'Div', '**': 'Pow', '%': 'Mod',
        'Add': 'Add', 'Sub': 'Sub', 'Mul': 'Mul', 'Div': 'Div', 'Pow': 'Pow', 'Mod': 'Mod'
      };
      return { Atomic: { BinOp: opMap[constantValues?.[0]?.value] || 'Add' } };
    }

    if (nodeId === 'unary-operation') {
      const op = constantValues?.[0]?.value || 'Neg';
      return { Atomic: { UnaryOp: ['Neg'].includes(op) ? op : 'Neg' } };
    }

    if (nodeId === 'logical-operation') {
      const opMap: Record<string, string> = {
        'and': 'And', 'or': 'Or', 'xor': 'Xor', 'not': 'Not', 'eq': 'Eq', 'neq': 'Neq',
        'And': 'And', 'Or': 'Or', 'Xor': 'Xor', 'Not': 'Not', 'Eq': 'Eq', 'Neq': 'Neq'
      };
      return { Atomic: { LogicalOp: opMap[constantValues?.[0]?.value] || 'And' } };
    }

    if (nodeId === 'print') return { Atomic: 'Print' };
    if (nodeId === 'replace') return { Atomic: 'Replace' };
    if (nodeId === 'is-none') return { Atomic: 'IsNone' };

    if (nodeId.startsWith('variable_set_')) {
      const name = (node?.data as any)?.variableName || nodeId.replace('variable_set_', '');
      return { Atomic: { Variable: ['Set', name] } };
    }
    if (nodeId.startsWith('variable_get_')) {
      const name = (node?.data as any)?.variableName || nodeId.replace('variable_get_', '');
      return { Atomic: { Variable: ['Get', name] } };
    }

    // IO
    if (nodeId === 'tcp-socket') return { Atomic: { Io: { Open: 'TcpSocket' } } };
    if (nodeId === 'file-open') return { Atomic: { Io: { Open: 'File' } } };
    if (nodeId === 'get-line') return { Atomic: { Io: 'GetLine' } };
    if (nodeId === 'write') return { Atomic: { Io: 'Write' } };
    if (nodeId === 'read') return { Atomic: { Io: 'Read' } };
    if (nodeId === 'console-input') return { Atomic: { Io: 'ConsoleInput' } };

    // Control: Loop::Start (while-loop canvas node becomes Loop::Start)
    if (nodeId === 'while-loop') return { Atomic: { Control: { Loop: 'Start' } } };

    // Break: placeholder (eliminated in Pass 3.5 before final output)
    if (nodeId === 'break') return { Atomic: { Control: 'Start' } }; // never reaches output

    // Control: If (uses custom_control, no payload)
    if (nodeId === 'if-condition') return { Atomic: { Control: 'If' } };

    // Skip wait-for-init (removed from backend)
    if (nodeId === 'wait-for-init') {
      console.warn('wait-for-init node encountered — skipping (removed from backend)');
      return { Atomic: { Control: 'Start' } }; // fallback
    }

    // Complex nodes
    if (metadataPath?.startsWith('complex/')) {
      const groupId = metadataPath.split('/')[1];
      const nodeDefPath = configurationService.getNodeDefinitionsPath();
      const childPath = `${nodeDefPath}/complex/${groupId}/${nodeId}/compiled.json`;
      if (this.currentOutputDir) {
        return { Complex: this.computeRelativePath(this.currentOutputDir, childPath) };
      }
      return { Complex: `complex/${groupId}/${nodeId}/compiled.json` };
    }

    // Agent operations
    if (nodeId === 'agent-create') {
      return { Atomic: { AgentOp: { Create: constantValues?.[0]?.value || 'OpenAi' } } };
    }
    if (nodeId === 'agent-send') return { Atomic: { AgentOp: 'Send' } };
    if (nodeId === 'agent-receive') return { Atomic: { AgentOp: 'Recieve' } };

    return { Atomic: nodeId };
  }

  // ─── Helpers ───

  private parseOutputIndex(sourceHandle: string | null | undefined, sourceNodeId?: string, allNodes?: Node[]): number {
    if (!sourceHandle) return 0;

    // Look up the actual port index by matching handle ID in the node's outputs
    if (sourceNodeId && allNodes) {
      const sourceNode = allNodes.find(node => node.id === sourceNodeId);
      if (sourceNode) {
        const nodeData = sourceNode.data as any;
        if (nodeData?.outputs) {
          const idx = nodeData.outputs.findIndex((out: any) => out.id === sourceHandle);
          if (idx >= 0) return idx;
        }
      }
    }

    // Fallback: parse from handle ID format "output-{x}-{index}-{y}"
    const parts = sourceHandle.split('-');
    if (parts.length >= 3) {
      const index = parseInt(parts[2], 10);
      return isNaN(index) ? 0 : index;
    }
    return 0;
  }

  private parseInputType(targetHandle: string | null | undefined, targetNodeId: string, allNodes: Node[]): any {
    if (!targetHandle) return 'Integer';
    const targetNode = allNodes.find(node => node.id === targetNodeId);
    if (!targetNode) return 'Integer';

    const nodeData = targetNode.data as any;
    if (nodeData?.controlFlowInput?.id === targetHandle) return 'None';
    if (!nodeData?.inputs) return 'Integer';

    const inputs = nodeData.inputs;
    const input = inputs.find((inp: any) => inp.id === targetHandle) || inputs[0];
    if (!input) return 'Integer';

    return this.mapIOTypeToBackend(input.type);
  }

  private mapIOTypes(handles: any[]): any[] {
    return handles.map(h => this.mapIOTypeToBackend(h.type));
  }

  private mapIOTypeToBackend(ioType: number): string | object {
    switch (ioType) {
      case IOType.Integer: return 'Integer';
      case IOType.Float: return 'Float';
      case IOType.String: return 'String';
      case IOType.Boolean: return 'Boolean';
      case IOType.Handle: return 'Handle';
      case IOType.Array: return 'Array';
      case IOType.Byte: return 'Byte';
      case IOType.Object: return 'Object';
      case IOType.Agent: return { 'Agent': 'OpenAi' };
      case IOType.None:
      default: return 'None';
    }
  }

  private normalizeType(type: any): string {
    if (typeof type === 'object' && type !== null) return JSON.stringify(type);
    return String(type);
  }

  private isComplexType(type: any): boolean {
    return typeof type === 'object' && type !== null;
  }

  private typesEqual(type1: any, type2: any): boolean {
    return this.normalizeType(type1) === this.normalizeType(type2);
  }

  private canAutocast(fromType: any, toType: any): boolean {
    if (this.typesEqual(fromType, toType)) return true;

    const fromStr = this.normalizeType(fromType);
    const toStr = this.normalizeType(toType);

    if (toStr === 'None') return fromStr === 'None';
    if (fromStr === 'None') return false;

    if (this.isComplexType(fromType) && this.isComplexType(toType)) {
      if (fromStr.includes('"Agent"') && toStr.includes('"Agent"')) return true;
      return false;
    }
    if (this.isComplexType(fromType) || this.isComplexType(toType)) return false;

    if (fromStr === 'Integer' && toStr === 'Float') return true;
    if (fromStr === 'Float' && toStr === 'Integer') return true;

    return false;
  }

  private createBackendToIOTypeMap(): Map<string, number> {
    const map = new Map<string, number>();
    map.set('Integer', IOType.Integer);
    map.set('Float', IOType.Float);
    map.set('String', IOType.String);
    map.set('Boolean', IOType.Boolean);
    map.set('Handle', IOType.Handle);
    map.set('Array', IOType.Array);
    map.set('Byte', IOType.Byte);
    map.set('Object', IOType.Object);
    map.set('None', IOType.None);
    // Agent types are complex objects like {"Agent":"OpenAi"} — normalize to string key
    map.set('{"Agent":"OpenAi"}', IOType.Agent);
    return map;
  }

  /**
   * Bakes user-provided input values into a compiled program by replacing
   * Start node data outputs with Value constant nodes. This allows programs
   * with inputs to run on a backend that always passes empty inputs.
   */
  bakeInputValues(program: CompiledProgram, values: any[]): CompiledProgram {
    const modified: CompiledProgram = JSON.parse(JSON.stringify(program));

    if (values.length === 0 || modified.inputs.length === 0) return modified;

    // Find the Start node UUID
    let startUuid: string | null = null;
    for (const [uuid, instance] of Object.entries(modified.instances)) {
      const nt = instance.node_type as any;
      if (nt?.Atomic?.Control === 'Start') {
        startUuid = uuid;
        break;
      }
    }
    if (!startUuid) return modified;

    const startInstance = modified.instances[startUuid];

    // Capture ALL of Start's original CF targets before we modify anything
    const originalCfTargets: Array<[string, number]> = startInstance.control_flow_out[0] || [];

    // Create Value nodes for each input
    const valueUuids: string[] = [];
    for (let i = 0; i < values.length; i++) {
      const valueUuid = uuidv4();
      valueUuids.push(valueUuid);

      modified.instances[valueUuid] = {
        node_type: { Atomic: { Value: values[i] } },
        default_overrides: {},
        outputs: [],
        control_flow_in: [],
        control_flow_out: [],
        inputs: []
      };
    }

    // Replace all data input references from Start → Value nodes
    for (const instance of Object.values(modified.instances)) {
      for (let j = 0; j < instance.inputs.length; j++) {
        const [type, srcUuid, srcPort] = instance.inputs[j];
        if (srcUuid === startUuid && srcPort < valueUuids.length) {
          instance.inputs[j] = [type, valueUuids[srcPort], 0];
        }
      }
    }

    // Build outputs (consumer lists) for each Value node
    for (let i = 0; i < valueUuids.length; i++) {
      const consumers: string[] = [];
      for (const [uuid, instance] of Object.entries(modified.instances)) {
        for (const input of instance.inputs) {
          if (input[1] === valueUuids[i] && !consumers.includes(uuid)) {
            consumers.push(uuid);
          }
        }
      }
      modified.instances[valueUuids[i]].outputs = consumers;
    }

    // Clear Start's data outputs (they now come from Value nodes)
    startInstance.outputs = [];

    // Wire CF chain: Start → Value1 → Value2 → ... → (ALL original CF targets)
    if (valueUuids.length > 0) {
      // Start → first Value node
      startInstance.control_flow_out = [[[valueUuids[0], 0]]];

      for (let i = 0; i < valueUuids.length; i++) {
        const prevUuid = i === 0 ? startUuid : valueUuids[i - 1];
        const isLast = i === valueUuids.length - 1;

        // CF in: from previous node
        modified.instances[valueUuids[i]].control_flow_in = [[[prevUuid, 0]]];

        // CF out: to next Value node, or to ALL original targets
        if (isLast && originalCfTargets.length > 0) {
          modified.instances[valueUuids[i]].control_flow_out = [originalCfTargets];
        } else if (!isLast) {
          modified.instances[valueUuids[i]].control_flow_out = [[[valueUuids[i + 1], 0]]];
        } else {
          modified.instances[valueUuids[i]].control_flow_out = [[]];
        }
      }

      // Fix ALL original CF targets' cf_in: replace Start with last Value node
      const lastValueUuid = valueUuids[valueUuids.length - 1];
      for (const [targetUuid, targetPort] of originalCfTargets) {
        const targetInstance = modified.instances[targetUuid];
        if (targetInstance?.control_flow_in?.[targetPort]) {
          targetInstance.control_flow_in[targetPort] =
            targetInstance.control_flow_in[targetPort].map(
              ([uuid, port]: [string, number]) =>
                uuid === startUuid ? [lastValueUuid, 0] : [uuid, port]
            );
        }
      }
    }

    // Clear program inputs (backend no longer needs to provide them)
    modified.inputs = [];

    return modified;
  }

  private extractProgramInterface(nodes: Node[]): { inputs: any[], outputs: any[] } {
    let inputs: any[] = [];
    let outputs: any[] = [];

    const startNode = nodes.find(node => (node.data as any)?.nodeId === 'start');
    if (startNode && (startNode.data as any)?.outputs) {
      inputs = this.mapIOTypes((startNode.data as any).outputs);
    }

    const finishNode = nodes.find(node => (node.data as any)?.nodeId === 'finish');
    if (finishNode && (finishNode.data as any)?.inputs) {
      outputs = this.mapIOTypes((finishNode.data as any).inputs);
    }

    return { inputs, outputs };
  }

  private findEndNode(nodes: Node[], edges: Edge[], nodeIdMap: Map<string, string>): string {
    const finishNode = nodes.find(node => (node.data as any)?.nodeId === 'finish');
    if (finishNode) {
      const uuid = nodeIdMap.get(finishNode.id);
      if (uuid) return uuid;
    }

    const nodesWithOutgoing = new Set<string>();
    for (const edge of edges) nodesWithOutgoing.add(edge.source);

    const endCandidates = nodes.filter(node => !nodesWithOutgoing.has(node.id));
    if (endCandidates.length > 0) {
      const selected = endCandidates.find(n => (n.data as any)?.nodeId !== 'start') || endCandidates[0];
      const uuid = nodeIdMap.get(selected.id);
      if (uuid) return uuid;
    }

    const fallback = nodeIdMap.get(nodes[0]?.id);
    return fallback || '';
  }
}

export const compilationService = new CompilationService();