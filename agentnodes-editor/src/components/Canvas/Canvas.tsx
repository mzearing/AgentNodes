import React, { useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import {
  ReactFlow,
  Node,
  addEdge,
  Connection,
  useEdgesState,
  Background,
  Controls,
  BackgroundVariant,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  Viewport,
  ReactFlowJsonObject,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes, ScriptingNodeData, ConstantDataValue } from '../ScriptingNodes/ScriptingNode';
import { useCanvasDrop, useKeyboardShortcuts, shortcuts, useCanvasHistory } from '../../hooks';
import { copySelectedNodes, pasteNodes } from '../../utils/nodeClipboard';
import { ProjectState, NodeMetadata, NodeSummary, IOType, Edge, Variable } from '../../types/project';
import { nodeFileSystem } from '../../services/nodeFileSystem';
import { determineConnectionStrength, getConnectionStyleClass } from '../../utils/connectionUtils';
import { getTypeColor } from '../../utils/typeColors';
import { canvasRefreshEmitter, sidebarRefreshEmitter } from '../../hooks/useSidebarData';

// Helper function to compare arrays
const arraysEqual = (arr1: string[], arr2: string[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((item, index) => item === arr2[index]);
};

// Helper function to compare type arrays (now supports IOType[][])
const typeArraysEqual = (arr1: IOType[][] | IOType[], arr2: IOType[][] | IOType[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  
  // Handle legacy IOType[] format by treating each item as a single-element array
  const normalize = (arr: IOType[][] | IOType[]): IOType[][] => {
    if (arr.length === 0) return [];
    // Check if it's IOType[] (legacy format)
    if (typeof arr[0] === 'number') {
      return (arr as IOType[]).map(type => [type]);
    }
    return arr as IOType[][];
  };
  
  const norm1 = normalize(arr1);
  const norm2 = normalize(arr2);
  
  if (norm1.length !== norm2.length) return false;
  
  return norm1.every((subArr1, index) => {
    const subArr2 = norm2[index];
    if (subArr1.length !== subArr2.length) return false;
    return subArr1.every((item, subIndex) => item === subArr2[subIndex]);
  });
};

// Helper function to get default value for IOType
const getDefaultValueForType = (type: IOType): string | number | boolean => {
  switch (type) {
    case IOType.Integer:
      return 0;
    case IOType.Float:
      return 0.0;
    case IOType.String:
      return '';
    case IOType.Boolean:
      return false;
    default:
      return '';
  }
};

interface CanvasProps {
  nodes: Node[];
  onNodesChange: (nodes: Node[]) => void;
  onNodeAdd?: (node: Node) => void;
  projectName?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

export interface CanvasMethods {
  saveProject: () => Promise<boolean>;
  loadProject: (projectState: ProjectState) => Promise<boolean>;
  getProjectState: () => ProjectState | null;
  setProjectState: (projectState: ProjectState) => void;
  reloadCurrentProject: () => Promise<boolean>;
  getCanvasData: () => ReactFlowJsonObject<Node, Edge> | null;
}

interface IDName {
  id: string;
  name: string;
  type?: IOType;
}

const initialEdges: Edge[] = [];

// Helper function to check if automatic casting is supported (shared logic)
const canAutocastTypes = (fromType: IOType, toType: IOType): boolean => {
  // Same type - always valid
  if (fromType === toType) return true;

  // None type: only None <-> None (strict control flow separation)
  if (fromType === IOType.None || toType === IOType.None) return false;

  // Other supported automatic casts:
  if (fromType === IOType.Integer && toType === IOType.Float) return true;
  if (fromType === IOType.Float && toType === IOType.Integer) return true;

  // Additional implicit conversions for string concatenation:
  if (toType === IOType.String && (fromType === IOType.Integer || fromType === IOType.Float || fromType === IOType.Boolean)) {
    return true;
  }

  return false;
};

// Helper function to validate connections and remove invalid ones
const validateAndCleanConnections = (nodes: Node[], edges: Edge[]): Edge[] => {
  return edges.filter(edge => {
    const sourceNode = nodes.find(node => node.id === edge.source);
    const targetNode = nodes.find(node => node.id === edge.target);

    if (!sourceNode || !targetNode) {
      return false;
    }

    const sourceData = sourceNode.data as ScriptingNodeData;
    const targetData = targetNode.data as ScriptingNodeData;

    // Check if this is a control flow connection
    const isSourceControlFlow = sourceData?.controlFlowOutput?.id === edge.sourceHandle;
    const isTargetControlFlow = targetData?.controlFlowInput?.id === edge.targetHandle;

    if (isSourceControlFlow || isTargetControlFlow) {
      // Both ends must be control flow handles for a valid control flow connection
      return isSourceControlFlow && isTargetControlFlow;
    }

    // Regular data port validation
    const sourceHandle = sourceData?.outputs?.find(output => output.id === edge.sourceHandle);
    const targetHandle = targetData?.inputs?.find(input => input.id === edge.targetHandle);

    if (!sourceHandle || !targetHandle) {
      return false;
    }

    // Type validation - allow exact matches or auto-castable types
    const sourceType = Array.isArray(sourceHandle.type) ? sourceHandle.type[0] : (sourceHandle.type ?? IOType.None);
    const targetType = Array.isArray(targetHandle.type) ? targetHandle.type[0] : (targetHandle.type ?? IOType.None);

    if (!canAutocastTypes(sourceType, targetType)) {
      return false;
    }

    return true;
  }).map(edge => {
    // Determine connection strength using shared logic
    const targetNode = nodes.find(node => node.id === edge.target);
    const sourceNode = nodes.find(node => node.id === edge.source);
    const strong = targetNode ? determineConnectionStrength(targetNode, edge.targetHandle) : true;

    // Preserve control-flow-connection class for CF edges
    const sourceData = sourceNode?.data as ScriptingNodeData | undefined;
    const isControlFlow = sourceData?.controlFlowOutput?.id === edge.sourceHandle;
    const baseClass = getConnectionStyleClass(strong);
    const className = isControlFlow ? `${baseClass} control-flow-connection` : baseClass;

    return {
      ...edge,
      strong,
      className
    };
  });
};

const CanvasComponent = forwardRef<CanvasMethods, CanvasProps>(({
  nodes: propNodes,
  onNodesChange: propOnNodesChange,
  onNodeAdd,
  projectName: _projectName = 'Untitled Project',
  onDirtyChange
}, ref) => {

  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [projectState, setProjectState] = useState<ProjectState>({
    hasNodeLoaded: false,
    openedNodeName: '',
    openedNodeId: '',
    openedNodePath: '',
    canvasStateCache: { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
  });
  
  const canvasDrop = useCanvasDrop(propNodes, propOnNodesChange, onNodeAdd);
  const { toObject, getNodes, getEdges } = useReactFlow();
  
  // History management for undo/redo
  const {
    saveState: saveHistoryState,
    undo,
    redo,
    canUndo,
    canRedo,
    cancelPendingSave,
    initializeHistory,
    markSaved,
    isDirty
  } = useCanvasHistory();

  // Guard: skip history save/init effects during undo/redo
  const isUndoRedoRef = React.useRef(false);

  // Save project functionality
  const saveProject = useCallback(async (): Promise<boolean> => {
    if (!projectState.hasNodeLoaded) {
      alert('Cannot save: No node loaded!');
      return false;
    }
    
    try {
      // Use getNodes/getEdges for most current state instead of toObject
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      
      // Validate and clean connections before saving
      const validatedEdges = validateAndCleanConnections(currentNodes, currentEdges);
      
      // Log if any connections were removed
      const removedCount = currentEdges.length - validatedEdges.length;
      if (removedCount > 0) {
        // Connections were removed during validation
      }
      
      const currentState = {
        nodes: currentNodes,
        edges: validatedEdges, 
        viewport: toObject().viewport
      };
      const loadedName = projectState.openedNodeName;
      const loadedId = projectState.openedNodeId;
      const path = projectState.openedNodePath;
      
      // Read existing metadata to get previous dependencies for comparison
      let previousDependencies: NodeSummary[] = [];
      try {
        const categoryPath = path.split('/')[0] === 'complex' ? 'Complex' : 'Atomic';
        const existingMetadata = await nodeFileSystem.readNode(
          path.split('/')[1], 
          loadedId, 
          categoryPath as 'Complex' | 'Atomic'
        );
        
        if (existingMetadata && typeof existingMetadata === 'object' && 'dependencies' in existingMetadata) {
          const existingData = existingMetadata as unknown as NodeMetadata;
          previousDependencies = existingData.dependencies || [];
        }
      } catch (error) {
        // Error loading metadata handled silently
      }

      // Collect dependencies from current canvas
      const dependencies: NodeSummary[] = [];
      
      // Go through all nodes to collect dependencies
      for (const node of currentState.nodes) {
        // Skip start/finish nodes as they are not dependencies
        if (node.data?.["nodeId"] === "start" || node.data?.["nodeId"] === "finish") {
          continue;
        }
        
        // Check if node has metadataPath (complex node)
        const metadataPath = node.data?.["metadataPath"];
        if (metadataPath && typeof metadataPath === 'string') {
          try {
            // Extract category and groupId from metadataPath
            const metadataPathParts = metadataPath.split('/');
            if (metadataPathParts.length >= 2) {
              const nodeCategory = metadataPathParts[0] === 'complex' ? 'Complex' : 'Atomic';
              const nodeGroupId = metadataPathParts[1];
              const nodeIdFromPath = node.data?.["nodeId"];
              
              if (nodeIdFromPath && typeof nodeIdFromPath === 'string') {
                // Read the node metadata to get its summary
                const nodeMetadata = await nodeFileSystem.readNode(
                  nodeGroupId, 
                  nodeIdFromPath, 
                  nodeCategory as 'Complex' | 'Atomic'
                );
                
                if (nodeMetadata && typeof nodeMetadata === 'object' && 'summary' in nodeMetadata) {
                  const metadata = nodeMetadata as unknown as NodeMetadata;
                  if (metadata.summary) {
                    dependencies.push(metadata.summary);
                  }
                }
              }
            }
          } catch (error) {
            // Error reading dependency node handled silently
          }
        }
      }
      
      // Compare dependencies and check for changes
      const changedDependencies: { node: string; changes: string[] }[] = [];
      const nameOnlyChanges: { oldSummary: NodeSummary; newSummary: NodeSummary }[] = [];
      
      for (const currentDep of dependencies) {
        const previousDep = previousDependencies.find(prev => 
          prev.path === currentDep.path && prev.id === currentDep.id
        );
        
        if (previousDep) {
          const changes: string[] = [];
          
          // Check if inputs differ (names and types)
          const inputsChanged = !arraysEqual(previousDep.inputs, currentDep.inputs) ||
                                !typeArraysEqual(previousDep.inputTypes || [], currentDep.inputTypes || []);
          if (inputsChanged) {
            changes.push('inputs');
          }
          
          // Check if outputs differ (names and types)
          const outputsChanged = !arraysEqual(previousDep.outputs, currentDep.outputs) ||
                                 !typeArraysEqual(previousDep.outputTypes || [], currentDep.outputTypes || []);
          if (outputsChanged) {
            changes.push('outputs');
          }
          
          // Check if name differs
          const nameChanged = previousDep.name !== currentDep.name;
          if (nameChanged) {
            changes.push('name');
          }
          
          if (changes.length > 0) {
            if (changes.length === 1 && changes[0] === 'name') {
              nameOnlyChanges.push({ oldSummary: previousDep, newSummary: currentDep });
            } else {
              changedDependencies.push({ 
                node: currentDep.name || currentDep.id, 
                changes 
              });
            }
          }
        }
      }
      
      // Handle dependency changes
      if (changedDependencies.length > 0) {
        const changedNodeNames = changedDependencies.map(dep => dep.node).join(', ');
        const changeTypes = Array.from(new Set(changedDependencies.flatMap(dep => dep.changes)));
        const message = `${changedNodeNames}'s ${changeTypes.join('/')} have changed. Recreate?`;
        
        if (!confirm(message)) {
          // User chose not to recreate - update affected nodes on canvas instead
          for (const changedDep of changedDependencies) {
            const currentDep = dependencies.find(dep => dep.name === changedDep.node || dep.id === changedDep.node);
            if (currentDep) {
              const previousDep = previousDependencies.find(prev => 
                prev.path === currentDep.path && prev.id === currentDep.id
              );
              
              if (previousDep) {
                // Find and update the node on the canvas
                const nodeToUpdate = currentState.nodes.find(node => {
                  const nodeData = node.data as Record<string, unknown>;
                  return nodeData?.nodeId === currentDep.id;
                });
                
                if (nodeToUpdate && nodeToUpdate.data) {
                  const nodeData = nodeToUpdate.data as Record<string, unknown>;
                  
                  // Update inputs if changed
                  if (changedDep.changes.includes('inputs')) {
                    const newInputs = currentDep.inputs.map((name, index) => ({
                      id: `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
                      name,
                      type: currentDep.inputTypes?.[index] || IOType.None
                    }));
                    nodeData.inputs = newInputs;
                  }
                  
                  // Update outputs if changed
                  if (changedDep.changes.includes('outputs')) {
                    const newOutputs = currentDep.outputs.map((name, index) => ({
                      id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
                      name,
                      type: currentDep.outputTypes?.[index] || IOType.None
                    }));
                    nodeData.outputs = newOutputs;
                  }
                }
              }
            }
          }
          
          // Update the live canvas with the changes and don't save
          propOnNodesChange(currentState.nodes);
          return false;
        }
        // If user confirms, we'll continue with saving
      }
      
      // Handle name-only changes silently
      if (nameOnlyChanges.length > 0) {
        
        // Update node labels in the current canvas state
        for (const change of nameOnlyChanges) {
          const nodeToUpdate = currentState.nodes.find(node => {
            const nodeData = node.data as Record<string, unknown>;
            return nodeData?.nodeId === change.oldSummary.id;
          });
          
          if (nodeToUpdate && nodeToUpdate.data) {
            (nodeToUpdate.data as Record<string, unknown>).label = change.newSummary.name;
          }
        }
      }
      
      // Parse path to get category, groupId
      const pathParts = path.split('/');
      if (pathParts.length < 2) {
        alert('Invalid node path');
        return false;
      }
      
      const category = pathParts[0] === 'complex' ? 'Complex' : 'Atomic';
      const groupId = pathParts[1];
      
      const inputArray: string[] = [];
      const outputArray: string[] = [];
      const inputTypesArray: IOType[] = [];
      const outputTypesArray: IOType[] = [];
      currentState.nodes.forEach((node: Node) => {
        if (node.data?.["nodeId"] === "start") {
          (node.data?.["outputs"] as IDName[]).forEach((element, _index) => {
            inputArray.push(element.name);
            inputTypesArray.push(element.type || IOType.None);
          });
        } else if (node.data?.["nodeId"] === "finish") {
          (node.data?.["inputs"] as IDName[]).forEach(element => {
            outputArray.push(element.name);
            outputTypesArray.push(element.type || IOType.None);
          });
        }
      });


      const mySummary: NodeSummary = {
        path: `${path}/${loadedId}`,
        id: loadedId,
        name: loadedName,
        inputs: inputArray || [],
        inputTypes: (inputTypesArray || []).map(type => [type]),
        outputs: outputArray || [],
        outputTypes: (outputTypesArray || []).map(type => [type]),
        variadicOutputs: false,
        variadicInputs: false,
        constantData: [],
        solo: false
      }

      // Update canvas nodes to reflect any dependency changes before saving
      const updatedCanvasState = await updateCanvasForDependencyChanges(currentState, dependencies);

      // Apply the updated canvas state to the live canvas immediately
      if (updatedCanvasState && updatedCanvasState._dependencyChangesApplied) {
        // Validate connections when applying dependency changes
        const validatedEdges = validateAndCleanConnections(updatedCanvasState.nodes, updatedCanvasState.edges);
        propOnNodesChange(updatedCanvasState.nodes);
        setEdges(validatedEdges);
        // Update the canvas state with validated edges
        updatedCanvasState.edges = validatedEdges;
      }

      const finalSaveData: NodeMetadata = {
        summary: mySummary,
        dependencies: dependencies,
        data: updatedCanvasState,
        variables: projectState.variables || []
      };

      
      const success = await nodeFileSystem.writeNode(
        groupId, 
        loadedId, 
        finalSaveData as unknown as JSON, 
        category as 'Complex' | 'Atomic'
      );
      
      
      if (success) {
        markSaved(updatedCanvasState.nodes, updatedCanvasState.edges, projectState.variables || [], projectState.openedNodeName);
        // Note: Recursive dependency updates are handled automatically by the canvasRefreshEmitter
        // system in App.tsx when nodeFileSystem.writeNode() triggers dependency updates
        return true;
      } else {
        alert('Failed to save project');
        return false;
      }
    } catch (error) {
      alert('Failed to save project');
      return false;
    }
  }, [toObject, projectState]);

  // Update canvas nodes based on dependency changes
  const updateCanvasForDependencyChanges = useCallback(async (canvasState: {nodes: Node[], edges: Edge[], viewport: Viewport}, dependencies: NodeSummary[]) => {
    
    // Create a deep copy of the canvas state to avoid mutating the original
    const updatedState = JSON.parse(JSON.stringify(canvasState));
    let hasChanges = false;
    
    // Update each canvas node that corresponds to a dependency
    for (const canvasNode of updatedState.nodes) {
      // Skip start/finish nodes
      if (canvasNode.data?.nodeId === 'start' || canvasNode.data?.nodeId === 'finish') {
        continue;
      }

      // Find the corresponding dependency
      const matchingDependency = dependencies.find((dep: NodeSummary) => {
        return dep.id === canvasNode.data?.nodeId;
      });

      if (matchingDependency) {
        
        // Check if there are actual changes before updating
        const currentInputs = JSON.stringify(canvasNode.data.inputs || []);
        const currentOutputs = JSON.stringify(canvasNode.data.outputs || []);
        const currentLabel = canvasNode.data.label;
        
        // Update the canvas node's label and inputs/outputs
        canvasNode.data.label = matchingDependency.name;
        
        // Generate new inputs based on dependency data, preserving existing IDs where possible
        const newInputs = matchingDependency.inputs.map((inputName: string, index: number) => ({
          id: canvasNode.data.inputs?.[index]?.id || `input-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
          name: inputName,
          type: matchingDependency.inputTypes?.[index] || IOType.None
        }));
        
        // Generate new outputs based on dependency data, preserving existing IDs where possible
        const newOutputs = matchingDependency.outputs.map((outputName: string, index: number) => ({
          id: canvasNode.data.outputs?.[index]?.id || `output-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
          name: outputName,
          type: matchingDependency.outputTypes?.[index] || IOType.None
        }));
        
        // Update the canvas node data
        canvasNode.data.inputs = newInputs;
        canvasNode.data.outputs = newOutputs;
        canvasNode.data.variadicInputs = matchingDependency.variadicInputs;
        canvasNode.data.variadicOutputs = matchingDependency.variadicOutputs;
        canvasNode.data.solo = matchingDependency.solo;
        
        // Check if anything actually changed
        const newInputsStr = JSON.stringify(newInputs);
        const newOutputsStr = JSON.stringify(newOutputs);
        if (currentInputs !== newInputsStr || currentOutputs !== newOutputsStr || currentLabel !== matchingDependency.name) {
          hasChanges = true;
        }
      }
    }
    
    // Mark the state as changed if we made updates
    if (hasChanges) {
      updatedState._dependencyChangesApplied = true;
    }
    
    return updatedState;
  }, []);

  // Load project functionality
  // Migration function to ensure all nodes have type properties and control flow handles
  const migrateNodesWithTypes = useCallback((nodes: Node[]) => {
    return nodes.map(node => {
      if (node.type === 'scripting-node') {
        const scriptingData = node.data as ScriptingNodeData;
        if (scriptingData.inputs) {
          scriptingData.inputs = scriptingData.inputs.map((input) => ({
            ...input,
            type: input.type !== undefined ? input.type : IOType.None
          }));
        }
        if (scriptingData.outputs) {
          scriptingData.outputs = scriptingData.outputs.map((output) => ({
            ...output,
            type: output.type !== undefined ? output.type : IOType.None
          }));
        }
        // Initialize constantValues if they don't exist but constantData does
        if (scriptingData.constantData && scriptingData.constantData.length > 0 && !scriptingData.constantValues) {
          scriptingData.constantValues = scriptingData.constantData.map((type): ConstantDataValue => ({
            type,
            value: getDefaultValueForType(type)
          }));
        }

        // Migration: Add control flow handles if missing
        const nodeId = scriptingData.nodeId;
        if (!scriptingData.controlFlowInput && nodeId !== 'start') {
          scriptingData.controlFlowInput = {
            id: `cf-in-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
          };
        }
        if (!scriptingData.controlFlowOutput && nodeId !== 'finish') {
          scriptingData.controlFlowOutput = {
            id: `cf-out-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
          };
        }

        // Migration: Remove None-typed data outputs (they are now control flow)
        // Track removed output IDs for edge migration
        if (scriptingData.outputs) {
          const noneOutputs = scriptingData.outputs.filter(o => o.type === IOType.None);
          if (noneOutputs.length > 0) {
            // Store the old None output IDs so edges can be redirected
            (scriptingData as Record<string, unknown>)._migratedNoneOutputIds = noneOutputs.map(o => o.id);
            scriptingData.outputs = scriptingData.outputs.filter(o => o.type !== IOType.None);
          }
        }

        // Migration: Remove None-typed data inputs
        if (scriptingData.inputs) {
          const noneInputs = scriptingData.inputs.filter(i => i.type === IOType.None);
          if (noneInputs.length > 0) {
            (scriptingData as Record<string, unknown>)._migratedNoneInputIds = noneInputs.map(i => i.id);
            scriptingData.inputs = scriptingData.inputs.filter(i => i.type !== IOType.None);
          }
        }

        // Migration: Remove None from availableInputTypes/availableOutputTypes
        if (scriptingData.availableInputTypes) {
          scriptingData.availableInputTypes = scriptingData.availableInputTypes.map(types =>
            types ? types.filter(t => t !== IOType.None) : types
          );
        }
        if (scriptingData.availableOutputTypes) {
          scriptingData.availableOutputTypes = scriptingData.availableOutputTypes.map(types =>
            types ? types.filter(t => t !== IOType.None) : types
          );
        }
      }
      return node;
    });
  }, []);

  const loadProject = useCallback(async (newProjectState: ProjectState): Promise<boolean> => {
    try {
      if (newProjectState.hasNodeLoaded && newProjectState.canvasStateCache) {
        // Migrate nodes to ensure they have type properties and control flow handles
        const migratedNodes = migrateNodesWithTypes(newProjectState.canvasStateCache.nodes);

        // Migrate edges: redirect old None-typed data port edges to control flow handles
        const migratedEdges = newProjectState.canvasStateCache.edges.map(edge => {
          let newEdge = { ...edge };

          // Check if source handle was a migrated None output
          const sourceNode = migratedNodes.find(n => n.id === edge.source);
          if (sourceNode) {
            const sourceData = sourceNode.data as ScriptingNodeData;
            const migratedOutputIds = (sourceData as Record<string, unknown>)?._migratedNoneOutputIds as string[] | undefined;
            if (migratedOutputIds && migratedOutputIds.includes(edge.sourceHandle ?? '')) {
              if (sourceData.controlFlowOutput) {
                newEdge = { ...newEdge, sourceHandle: sourceData.controlFlowOutput.id };
              }
            }
          }

          // Check if target handle was a migrated None input
          const targetNode = migratedNodes.find(n => n.id === edge.target);
          if (targetNode) {
            const targetData = targetNode.data as ScriptingNodeData;
            const migratedInputIds = (targetData as Record<string, unknown>)?._migratedNoneInputIds as string[] | undefined;
            if (migratedInputIds && migratedInputIds.includes(edge.targetHandle ?? '')) {
              if (targetData.controlFlowInput) {
                newEdge = { ...newEdge, targetHandle: targetData.controlFlowInput.id };
              }
            }
          }

          return newEdge;
        });

        // Clean up temporary migration markers
        migratedNodes.forEach(node => {
          const data = node.data as Record<string, unknown>;
          delete data._migratedNoneOutputIds;
          delete data._migratedNoneInputIds;
        });

        // Validate and clean connections to remove any invalid type connections
        const validatedEdges = validateAndCleanConnections(migratedNodes, migratedEdges);

        // Load the canvas state from the saved data
        propOnNodesChange(migratedNodes);
        setEdges(validatedEdges);
        setProjectState(newProjectState);
        markSaved(migratedNodes, validatedEdges, newProjectState.variables || [], newProjectState.openedNodeName);

        // Sync the node ID counter to prevent ID conflicts when adding new nodes
        canvasDrop.syncNodeIdCounter(migratedNodes);

        return true;
      } else {
        alert('Invalid project state');
        return false;
      }
    } catch (error) {
      alert('Failed to load project');
      return false;
    }
  }, [propOnNodesChange, setEdges, canvasDrop, migrateNodesWithTypes]);

  // Get current project state
  const getProjectState = useCallback((): ProjectState | null => {
    return projectState;
  }, [projectState]);

  // Set project state (for external updates)
  const setProjectStateMethod = useCallback((newProjectState: ProjectState) => {
    setProjectState(newProjectState);
  }, []);

  // Reload current project from filesystem (used when dependencies change)
  const reloadCurrentProject = useCallback(async (): Promise<boolean> => {
    if (!projectState.hasNodeLoaded) {
      return false;
    }

    try {
      const category = projectState.openedNodePath.startsWith('complex/') ? 'Complex' : 'Atomic';
      const pathParts = projectState.openedNodePath.split('/');
      if (pathParts.length < 2) {
        return false;
      }

      const groupId = pathParts[1];
      const nodeId = projectState.openedNodeId;


      // Read the updated node data from filesystem
      const nodeData = await nodeFileSystem.readNode(groupId, nodeId, category as 'Complex' | 'Atomic');
      if (!nodeData || typeof nodeData !== 'object' || !('data' in nodeData)) {
        return false;
      }

      const metadata = nodeData as unknown as NodeMetadata;
      if (!metadata.data) {
        return false;
      }

      // Create updated project state with fresh canvas data
      const updatedProjectState: ProjectState = {
        ...projectState,
        canvasStateCache: metadata.data
      };

      // Load the fresh project state
      const success = await loadProject(updatedProjectState);
      if (success) {
        // Project reloaded successfully
      }
      return success;
    } catch (error) {
      return false;
    }
  }, [projectState, loadProject]);

  const getCanvasData = useCallback((): ReactFlowJsonObject<Node, Edge> | null => {
    if (!projectState?.hasNodeLoaded) {
      return null;
    }
    
    return {
      nodes: propNodes,
      edges: edges,
      viewport: { x: 0, y: 0, zoom: 1 } // Default viewport
    };
  }, [propNodes, edges, projectState]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    saveProject,
    loadProject,
    getProjectState,
    setProjectState: setProjectStateMethod,
    reloadCurrentProject,
    getCanvasData,
  }), [saveProject, loadProject, getProjectState, setProjectStateMethod, reloadCurrentProject, getCanvasData]);

  // Use the nodes from props directly and create a wrapped onChange
  const wrappedOnNodesChange = React.useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
    // Apply the changes to get the new nodes
    const newNodes = applyNodeChanges(changes, propNodes);
    propOnNodesChange(newNodes);
  }, [propOnNodesChange]);
  
  // Initialize history when project loads
  React.useEffect(() => {
    if (isUndoRedoRef.current) return;
    if (projectState.hasNodeLoaded && propNodes.length > 0) {
      initializeHistory(propNodes, edges, projectState.variables || [], projectState.openedNodeName);
    }
  }, [projectState.hasNodeLoaded, initializeHistory, projectState.variables, projectState.openedNodeName]);

  // Save history when nodes or edges change
  React.useEffect(() => {
    if (isUndoRedoRef.current) return;
    if (projectState.hasNodeLoaded && propNodes.length > 0) {
      saveHistoryState(propNodes, edges, projectState.variables || [], projectState.openedNodeName);
    }
  }, [propNodes, edges, projectState.hasNodeLoaded, saveHistoryState, projectState.variables, projectState.openedNodeName]);

  // Get selected nodes
  const getSelectedNodes = React.useCallback(() => {
    return propNodes.filter(node => node.selected);
  }, [propNodes]);

  // Handle copy operation
  const handleCopy = React.useCallback(() => {
    const selectedNodes = getSelectedNodes();
    if (selectedNodes.length > 0) {
      const success = copySelectedNodes(selectedNodes, edges);
      if (success) {
        console.log(`Copied ${selectedNodes.length} node(s)`);
      }
    }
  }, [getSelectedNodes, edges]);

  // Handle paste operation
  const handlePaste = React.useCallback(() => {
    const result = pasteNodes(propNodes, edges);
    if (result) {
      // Flush any pending debounced save to capture pre-paste state
      saveHistoryState(propNodes, edges, projectState.variables || [], projectState.openedNodeName, true);

      const allNodes = [...propNodes, ...result.nodes];
      const allEdges = [...edges, ...result.edges];

      // Clear selection from existing nodes
      const updatedNodes = allNodes.map(node => ({
        ...node,
        selected: result.nodes.some(newNode => newNode.id === node.id)
      }));

      // Save post-paste state immediately so undo can revert it
      saveHistoryState(updatedNodes, allEdges, projectState.variables || [], projectState.openedNodeName, true);

      propOnNodesChange(updatedNodes);
      setEdges(allEdges);
    }
  }, [propNodes, edges, propOnNodesChange, setEdges, saveHistoryState, projectState.variables, projectState.openedNodeName]);

  // Comprehensive state synchronization after undo/redo
  const synchronizeState = React.useCallback(async (restoredState: { nodes: Node[]; edges: Edge[]; variables: Variable[]; projectName?: string }) => {
    // Update project state with restored variables and name
    const updatedProjectState: ProjectState = {
      ...projectState,
      variables: restoredState.variables,
      openedNodeName: restoredState.projectName || projectState.openedNodeName,
      canvasStateCache: {
        ...projectState.canvasStateCache,
        nodes: restoredState.nodes,
        edges: restoredState.edges
      }
    };
    setProjectState(updatedProjectState);

    // Do NOT call updateVariableNodes during undo/redo — the restored nodes
    // already contain the correct variable node state, and updateVariableNodes
    // uses a stale nodesRef that would overwrite the restored nodes.

    // Trigger refresh events for UI synchronization
    canvasRefreshEmitter.emit();
    sidebarRefreshEmitter.emit();
  }, [projectState, setProjectState]);

  // Handle undo operation
  const handleUndo = React.useCallback(async () => {
    if (canUndo()) {
      // Cancel any pending debounced save that could overwrite history after undo
      cancelPendingSave();

      const result = undo();
      if (result) {
        isUndoRedoRef.current = true;

        // History already stores fully migrated nodes — apply directly
        propOnNodesChange(result.nodes);
        setEdges(result.edges);

        // Synchronize the full state including variables
        await synchronizeState(result);
      }
    }
  }, [canUndo, undo, cancelPendingSave, propOnNodesChange, setEdges, synchronizeState]);

  // Handle redo operation
  const handleRedo = React.useCallback(async () => {
    if (canRedo()) {
      // Cancel any pending debounced save that could overwrite history after redo
      cancelPendingSave();

      const result = redo();
      if (result) {
        isUndoRedoRef.current = true;

        // History already stores fully migrated nodes — apply directly
        propOnNodesChange(result.nodes);
        setEdges(result.edges);

        // Synchronize the full state including variables
        await synchronizeState(result);
      }
    }
  }, [canRedo, redo, cancelPendingSave, propOnNodesChange, setEdges, synchronizeState]);

  // Handle delete operation
  const handleDelete = React.useCallback(() => {
    const selectedNodes = getSelectedNodes();
    const selectedEdges = edges.filter(e => e.selected);

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // Flush any pending debounced save to capture pre-delete state
    saveHistoryState(propNodes, edges, projectState.variables || [], projectState.openedNodeName, true);

    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));
    const selectedEdgeIds = new Set(selectedEdges.map(edge => edge.id));

    // Remove selected nodes
    const remainingNodes = propNodes.filter(node => !node.selected);

    // Remove edges connected to deleted nodes AND selected edges
    const remainingEdges = edges.filter(edge =>
      !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target) && !selectedEdgeIds.has(edge.id)
    );

    // Save post-delete state immediately so undo can revert it
    saveHistoryState(remainingNodes, remainingEdges, projectState.variables || [], projectState.openedNodeName, true);

    propOnNodesChange(remainingNodes);
    setEdges(remainingEdges);
  }, [getSelectedNodes, propNodes, edges, propOnNodesChange, setEdges, saveHistoryState, projectState.variables, projectState.openedNodeName]);

  // Set up keyboard shortcuts
  useKeyboardShortcuts([
    shortcuts.copy(handleCopy),
    shortcuts.paste(handlePaste),
    shortcuts.undo(handleUndo),
    shortcuts.redo(handleRedo),
    shortcuts.redoAlt(handleRedo), // Ctrl+Shift+Z alternative
    shortcuts.delete(handleDelete),
    shortcuts.backspace(handleDelete)
  ]);

  // Add effect to validate and clean edges when nodes change
  // Skip during undo/redo — restored edges from history are already valid
  React.useEffect(() => {
    if (isUndoRedoRef.current) return;
    setEdges(currentEdges => {
      const validatedEdges = validateAndCleanConnections(propNodes, currentEdges);
      // Check if any edge styling needs to be updated (not just length changes)
      const hasChanges = validatedEdges.length !== currentEdges.length ||
        validatedEdges.some((edge, index) => {
          const currentEdge = currentEdges[index];
          return !currentEdge || edge.strong !== currentEdge.strong || edge.className !== currentEdge.className;
        });

      if (hasChanges) {
        return validatedEdges;
      }
      return currentEdges;
    });
  }, [propNodes, setEdges]);

  // Add effect to mark starting point nodes
  // Skip during undo/redo — restored nodes already have correct starting point state
  React.useEffect(() => {
    if (isUndoRedoRef.current) return;
    // Helper function to recursively check if all connections in entire graph are strong
    const hasOnlyStrongConnections = (nodeId: string, visited = new Set<string>()): boolean => {
      // Avoid infinite loops in case of cycles
      if (visited.has(nodeId)) return true;
      visited.add(nodeId);
      
      // Check all outgoing edges from this node
      const outgoingEdges = edges.filter(edge => edge.source === nodeId);
      for (const edge of outgoingEdges) {
        const targetNode = propNodes.find(n => n.id === edge.target);
        if (!targetNode) continue;
        
        // Check if this specific connection is strong
        const isStrong = determineConnectionStrength(targetNode, edge.targetHandle);
        
        // If this connection is weak, the entire chain is weak
        if (!isStrong) {
          return false;
        }
        
        // Recursively check the target node's connections
        if (!hasOnlyStrongConnections(edge.target, new Set(visited))) {
          return false;
        }
      }
      
      // Check all incoming edges to this node
      const incomingEdges = edges.filter(edge => edge.target === nodeId);
      for (const edge of incomingEdges) {
        const targetNode = propNodes.find(n => n.id === edge.target);
        if (!targetNode) continue;
        
        // Check if this specific connection is strong
        const isStrong = determineConnectionStrength(targetNode, edge.targetHandle);
        
        // If this connection is weak, the entire chain is weak
        if (!isStrong) {
          return false;
        }
        
        // Recursively check the source node's connections
        if (!hasOnlyStrongConnections(edge.source, new Set(visited))) {
          return false;
        }
      }
      
      return true;
    };

    // Identify nodes that are starting points:
    // - Have no direct strong incoming connections
    // - Have at least one output that is connected to another node  
    // - ALL dependencies in the entire chain are strong connections
    const updatedNodes = propNodes.map(node => {
      // Check if node has any direct strong incoming connections
      const hasDirectStrongIncoming = edges.some(edge => {
        if (edge.target !== node.id) return false;
        const isStrong = determineConnectionStrength(node, edge.targetHandle);
        return isStrong;
      });
      
      // Get all connected output handles for this node
      const connectedOutputs = edges
        .filter(edge => edge.source === node.id)
        .map(edge => edge.sourceHandle)
        .filter(Boolean) as string[];
      
      // Check if all connections in the entire connected graph are strong
      const hasOnlyStrongChain = hasOnlyStrongConnections(node.id);
      
      // Node is a starting point if:
      // 1. It has no direct strong incoming connections
      // 2. It has outgoing edges
      // 3. ALL dependencies in its entire chain are strong connections
      const isStartingPoint = !hasDirectStrongIncoming && connectedOutputs.length > 0 && hasOnlyStrongChain;
      
      // Update node data if starting point status or connected outputs changed
      const currentConnectedOutputs = (node.data as ScriptingNodeData).connectedOutputs || [];
      const outputsChanged = connectedOutputs.length !== currentConnectedOutputs.length ||
        !connectedOutputs.every(output => currentConnectedOutputs.includes(output));
      
      if ((node.data as ScriptingNodeData).isStartingPoint !== isStartingPoint || outputsChanged) {
        return {
          ...node,
          data: {
            ...node.data,
            isStartingPoint,
            connectedOutputs
          }
        };
      }
      
      return node;
    });

    // Only update if there were changes
    const hasChanges = updatedNodes.some((node, index) => 
      (node.data as ScriptingNodeData).isStartingPoint !== (propNodes[index].data as ScriptingNodeData).isStartingPoint
    );
    
    if (hasChanges) {
      propOnNodesChange(updatedNodes);
    }
  }, [edges, propNodes, propOnNodesChange]);

  // Clear the undo/redo guard after all guarded effects have run.
  // React executes effects in declaration order, so this runs last.
  React.useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
    }
  });

  // Propagate dirty state changes to parent
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const isValidConnection = useCallback(
    (connection: Connection) => {
      // Prevent self-connections
      if (connection.source === connection.target) {
        return false;
      }

      // Type validation for connections
      const sourceNode = propNodes.find(node => node.id === connection.source);
      const targetNode = propNodes.find(node => node.id === connection.target);

      if (sourceNode && targetNode) {
        const sourceData = sourceNode.data as ScriptingNodeData;
        const targetData = targetNode.data as ScriptingNodeData;

        // Check if source or target is a control flow handle
        const isSourceControlFlow = sourceData?.controlFlowOutput?.id === connection.sourceHandle;
        const isTargetControlFlow = targetData?.controlFlowInput?.id === connection.targetHandle;

        // Control flow handles can only connect to other control flow handles
        if (isSourceControlFlow || isTargetControlFlow) {
          return isSourceControlFlow && isTargetControlFlow;
        }

        // Regular data port validation
        const sourceHandle = sourceData?.outputs?.find(output => output.id === connection.sourceHandle);
        const targetHandle = targetData?.inputs?.find(input => input.id === connection.targetHandle);

        if (sourceHandle && targetHandle) {
          const sourceType = Array.isArray(sourceHandle.type) ? sourceHandle.type[0] : (sourceHandle.type ?? IOType.None);
          const targetType = Array.isArray(targetHandle.type) ? targetHandle.type[0] : (targetHandle.type ?? IOType.None);

          if (!canAutocastTypes(sourceType, targetType)) {
            return false;
          }
        }
      }

      return true;
    },
    [propNodes]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      // Remove any existing connection to the same input handle
      const filteredEdges = edges.filter(edge =>
        !(edge.target === params.target && edge.targetHandle === params.targetHandle)
      );

      // Check if this is a control flow connection
      const sourceNode = propNodes.find(node => node.id === params.source);
      const sourceData = sourceNode?.data as ScriptingNodeData;
      const isControlFlow = sourceData?.controlFlowOutput?.id === params.sourceHandle;

      // Determine connection strength using shared logic
      const targetNode = propNodes.find(node => node.id === params.target);
      const strong = targetNode ? determineConnectionStrength(targetNode, params.targetHandle) : true;

      let typeColor: string;
      let edgeClassName: string;

      if (isControlFlow) {
        // Control flow edges use the None type color and distinct class
        typeColor = getTypeColor(IOType.None);
        edgeClassName = `${getConnectionStyleClass(strong)} control-flow-connection`;
      } else {
        // Get source type for coloring
        const sourceHandle = sourceData?.outputs?.find(output => output.id === params.sourceHandle);
        const sourceType = sourceHandle?.type ?? IOType.None;
        typeColor = getTypeColor(Array.isArray(sourceType) ? sourceType[0] : sourceType);
        edgeClassName = getConnectionStyleClass(strong);
      }

      // Create edge with proper strong/weak styling and type color
      const newEdge: Edge = {
        ...params,
        id: 'id' in params ? params.id : `${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}`,
        strong,
        className: edgeClassName,
        style: {
          stroke: typeColor,
          '--edge-color': typeColor
        } as React.CSSProperties
      };

      // Compute the new edges
      const newEdges = addEdge(newEdge, filteredEdges);

      // Flush pre-connect state and save post-connect state immediately
      saveHistoryState(propNodes, edges, projectState.variables || [], projectState.openedNodeName, true);
      saveHistoryState(propNodes, newEdges, projectState.variables || [], projectState.openedNodeName, true);

      setEdges(newEdges);
    },
    [edges, setEdges, propNodes, saveHistoryState, projectState.variables, projectState.openedNodeName]
  );


  return (
    <div 
      className={styles.canvas}
      onDragEnter={canvasDrop.onDragEnter}
      onDragLeave={canvasDrop.onDragLeave}
      onDrop={canvasDrop.onDrop}
      onDragOver={canvasDrop.onDragOver}
    >
      <div 
        className={styles.reactFlowWrapper} 
        ref={canvasDrop.reactFlowWrapper}
        onDragEnter={canvasDrop.onDragEnter}
        onDragLeave={canvasDrop.onDragLeave}
        onDrop={canvasDrop.onDrop}
        onDragOver={canvasDrop.onDragOver}
      >
        <ReactFlow
          nodes={propNodes}
          edges={edges}
          onNodesChange={wrappedOnNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onInit={canvasDrop.setReactFlowInstance}
          onDrop={canvasDrop.onDrop}
          onDragOver={canvasDrop.onDragOver}
          nodeTypes={nodeTypes}
          className={styles.reactFlow}
          proOptions={{hideAttribution: true}}
          deleteKeyCode={null}
          nodesDraggable={true}
          nodesConnectable={true}
          nodesFocusable={true}
          edgesFocusable={true}
          elementsSelectable={true}
          selectNodesOnDrag={false}
          fitView
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
          />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
});

CanvasComponent.displayName = 'CanvasComponent';

const Canvas = forwardRef<CanvasMethods, CanvasProps>((props, ref) => (
  <ReactFlowProvider>
    <CanvasComponent {...props} ref={ref} />
  </ReactFlowProvider>
));

Canvas.displayName = 'Canvas';

export default Canvas;