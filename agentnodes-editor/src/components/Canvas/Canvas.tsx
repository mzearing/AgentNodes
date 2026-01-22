import React, { useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
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
import { useCanvasDrop } from '../../hooks';
import { ProjectState, NodeMetadata, NodeSummary, IOType } from '../../types/project';
import { nodeFileSystem } from '../../services/nodeFileSystem';

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
  // Debug logging for Agent types
  // Debug logging removed for Agent types
  
  // Same type - always valid
  if (fromType === toType) return true;
  
  // None type compatibility rules:
  // - Any type can be cast to None (for trigger/control flow purposes)
  // - None can only be cast to other None inputs (control flow only)
  if (toType === IOType.None) return true; // Any type can trigger None inputs
  if (fromType === IOType.None) return toType === IOType.None; // None outputs only go to None inputs
  
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
    
    const sourceHandle = (sourceNode.data as ScriptingNodeData)?.outputs?.find(output => output.id === edge.sourceHandle);
    const targetHandle = (targetNode.data as ScriptingNodeData)?.inputs?.find(input => input.id === edge.targetHandle);
    
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
  });
};

const CanvasComponent = forwardRef<CanvasMethods, CanvasProps>(({ 
  nodes: propNodes, 
  onNodesChange: propOnNodesChange, 
  onNodeAdd,
  projectName: _projectName = 'Untitled Project'
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
  // Migration function to ensure all nodes have type properties
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
      }
      return node;
    });
  }, []);

  const loadProject = useCallback(async (newProjectState: ProjectState): Promise<boolean> => {
    try {
      if (newProjectState.hasNodeLoaded && newProjectState.canvasStateCache) {
        // Migrate nodes to ensure they have type properties
        const migratedNodes = migrateNodesWithTypes(newProjectState.canvasStateCache.nodes);
        
        // Validate and clean connections to remove any invalid type connections
        const validatedEdges = validateAndCleanConnections(migratedNodes, newProjectState.canvasStateCache.edges);
        
        // Log if any connections were removed
        const removedCount = newProjectState.canvasStateCache.edges.length - validatedEdges.length;
        if (removedCount > 0) {
          // Connections were removed during project load
        }
        
        // Load the canvas state from the saved data
        propOnNodesChange(migratedNodes);
        setEdges(validatedEdges);
        setProjectState(newProjectState);
        
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
  
  // Add effect to validate and clean edges when nodes change
  React.useEffect(() => {
    setEdges(currentEdges => {
      const validatedEdges = validateAndCleanConnections(propNodes, currentEdges);
      if (validatedEdges.length !== currentEdges.length) {
        return validatedEdges;
      }
      return currentEdges;
    });
  }, [propNodes, setEdges]);

  // Add effect to mark starting point nodes
  React.useEffect(() => {
    // Identify nodes that are starting points:
    // - Have no incoming edges (no edges where node is target)
    // - Have at least one output that is connected to another node
    const updatedNodes = propNodes.map(node => {
      // Check if node has any incoming edges
      const hasIncomingEdges = edges.some(edge => edge.target === node.id);
      
      // Get all connected output handles for this node
      const connectedOutputs = edges
        .filter(edge => edge.source === node.id)
        .map(edge => edge.sourceHandle)
        .filter(Boolean) as string[];
      
      // Node is a starting point if it has no incoming edges but has outgoing edges
      const isStartingPoint = !hasIncomingEdges && connectedOutputs.length > 0;
      
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
        const sourceHandle = (sourceNode.data as ScriptingNodeData)?.outputs?.find(output => output.id === connection.sourceHandle);
        const targetHandle = (targetNode.data as ScriptingNodeData)?.inputs?.find(input => input.id === connection.targetHandle);
        
        if (sourceHandle && targetHandle) {
          // Handle cases where type might be an array or a single value
          const sourceType = Array.isArray(sourceHandle.type) ? sourceHandle.type[0] : (sourceHandle.type ?? IOType.None);
          const targetType = Array.isArray(targetHandle.type) ? targetHandle.type[0] : (targetHandle.type ?? IOType.None);
          
          // Allow connections if types match exactly or can be auto-cast
          if (!canAutocastTypes(sourceType, targetType)) {
            return false;
          }
          
          // If auto-cast is needed, log it for user feedback
          if (sourceType !== targetType) {
            // Type conversion will happen automatically
          }
        }
      }
      
      return true;
    },
    [propNodes]
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      setEdges((eds) => {
        // Remove any existing connection to the same input handle
        const filteredEdges = eds.filter(edge => 
          !(edge.target === params.target && edge.targetHandle === params.targetHandle)
        );
        // Add the new connection
        return addEdge(params, filteredEdges);
      });
    },
    [setEdges]
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