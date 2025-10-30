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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes, ScriptingNodeData } from '../ScriptingNodes/ScriptingNode';
import { useCanvasDrop } from '../../hooks';
import { ProjectState, NodeMetadata, NodeSummary, IOType } from '../../types/project';
import { nodeFileSystem } from '../../services/nodeFileSystem';

// Helper function to compare arrays
const arraysEqual = (arr1: string[], arr2: string[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((item, index) => item === arr2[index]);
};

// Helper function to compare type arrays
const typeArraysEqual = (arr1: IOType[], arr2: IOType[]): boolean => {
  if (arr1.length !== arr2.length) return false;
  return arr1.every((item, index) => item === arr2[index]);
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
}

interface IDName {
  id: string;
  name: string;
  type?: IOType;
}

const initialEdges: Edge[] = [];

// Helper function to validate connections and remove invalid ones
const validateAndCleanConnections = (nodes: Node[], edges: Edge[]): Edge[] => {
  return edges.filter(edge => {
    const sourceNode = nodes.find(node => node.id === edge.source);
    const targetNode = nodes.find(node => node.id === edge.target);
    
    if (!sourceNode || !targetNode) {
      console.warn(`Removing edge with missing node: ${edge.source} -> ${edge.target}`);
      return false;
    }
    
    const sourceHandle = (sourceNode.data as ScriptingNodeData)?.outputs?.find(output => output.id === edge.sourceHandle);
    const targetHandle = (targetNode.data as ScriptingNodeData)?.inputs?.find(input => input.id === edge.targetHandle);
    
    if (!sourceHandle || !targetHandle) {
      console.warn(`Removing edge with missing handle: ${edge.sourceHandle} -> ${edge.targetHandle}`);
      return false;
    }
    
    // Type validation - only allow exact type matches
    const sourceType = sourceHandle.type ?? IOType.None;
    const targetType = targetHandle.type ?? IOType.None;
    
    if (sourceType !== targetType) {
      console.warn(`Removing edge with type mismatch: ${IOType[sourceType]} -> ${IOType[targetType]}`);
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
        console.log(`Removed ${removedCount} invalid connection(s) before saving`);
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
        console.log('No previous metadata found or failed to read:', error);
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
        console.log("Got metadata ", metadataPath);
        if (metadataPath && typeof metadataPath === 'string') {
          try {
            // Extract category and groupId from metadataPath
            const metadataPathParts = metadataPath.split('/');
            if (metadataPathParts.length >= 2) {
              console.log(metadataPathParts);
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
                  console.log("metadata: ", metadata)
                  if (metadata.summary) {
                    dependencies.push(metadata.summary);
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`Failed to read dependency node ${metadataPath}:`, error);
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
          console.log('Applying dependency updates to live canvas without saving...');
          propOnNodesChange(currentState.nodes);
          return false;
        }
        // If user confirms, we'll continue with saving
      }
      
      // Handle name-only changes silently
      if (nameOnlyChanges.length > 0) {
        console.log('Updating node names silently:', nameOnlyChanges.map(change => 
          `${change.oldSummary.name} -> ${change.newSummary.name}`
        ));
        
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
      
      // Find input and output nodes in current canvas state
      let inputNode: Node | null = null;
      let outputNode: Node | null = null;
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
          inputNode = node;
        } else if (node.data?.["nodeId"] === "finish") {
          (node.data?.["inputs"] as IDName[]).forEach(element => {
            outputArray.push(element.name);
            outputTypesArray.push(element.type || IOType.None);
          });
          outputNode = node;
        }
      });

      console.log("found input node: ", inputNode)
      console.log("found output node: ", outputNode)

      const mySummary: NodeSummary = {
        path: `${path}/${loadedId}`,
        id: loadedId,
        name: loadedName,
        inputs: inputArray || [],
        inputTypes: inputTypesArray || [],
        outputs: outputArray || [],
        outputTypes: outputTypesArray || [],
        variadicOutputs: false,
        variadicInputs: false,
        solo: false
      }

      // Update canvas nodes to reflect any dependency changes before saving
      const updatedCanvasState = await updateCanvasForDependencyChanges(currentState, dependencies);

      // Apply the updated canvas state to the live canvas immediately
      if (updatedCanvasState && updatedCanvasState._dependencyChangesApplied) {
        console.log('Applying updated canvas state to live canvas...');
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
        data: updatedCanvasState
      };

      // Save the node data
      console.log('Saving node with params:', {
        groupId,
        loadedId,
        category,
        path,
        dataStructure: finalSaveData
      });
      
      const success = await nodeFileSystem.writeNode(
        groupId, 
        loadedId, 
        finalSaveData as unknown as JSON, 
        category as 'Complex' | 'Atomic'
      );
      
      console.log('Save result:', success);
      
      if (success) {
        // Note: Recursive dependency updates are handled automatically by the canvasRefreshEmitter
        // system in App.tsx when nodeFileSystem.writeNode() triggers dependency updates
        return true;
      } else {
        alert('Failed to save project');
        return false;
      }
    } catch (error) {
      console.error('Failed to save project:', error);
      alert('Failed to save project');
      return false;
    }
  }, [toObject, projectState]);

  // Update canvas nodes based on dependency changes
  const updateCanvasForDependencyChanges = useCallback(async (canvasState: {nodes: Node[], edges: Edge[], viewport: Viewport}, dependencies: NodeSummary[]) => {
    console.log('Updating canvas for dependency changes...');
    
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
        console.log(`Updating canvas node ${canvasNode.id} (${canvasNode.data?.nodeId}) with dependency data`);
        
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
          console.log(`Updated canvas node with ${newInputs.length} inputs and ${newOutputs.length} outputs`);
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
          console.log(`Removed ${removedCount} invalid connection(s) during project load`);
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
      console.error('Failed to load project:', error);
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
      console.log('No project loaded to reload');
      return false;
    }

    try {
      const category = projectState.openedNodePath.startsWith('complex/') ? 'Complex' : 'Atomic';
      const pathParts = projectState.openedNodePath.split('/');
      if (pathParts.length < 2) {
        console.error('Invalid project path for reload');
        return false;
      }

      const groupId = pathParts[1];
      const nodeId = projectState.openedNodeId;

      console.log(`Reloading project from filesystem: ${category}/${groupId}/${nodeId}`);

      // Read the updated node data from filesystem
      const nodeData = await nodeFileSystem.readNode(groupId, nodeId, category as 'Complex' | 'Atomic');
      if (!nodeData || typeof nodeData !== 'object' || !('data' in nodeData)) {
        console.error('Failed to read updated node data for reload');
        return false;
      }

      const metadata = nodeData as unknown as NodeMetadata;
      if (!metadata.data) {
        console.error('No canvas data found in node metadata');
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
        console.log('Successfully reloaded project with updated dependencies');
      }
      return success;
    } catch (error) {
      console.error('Failed to reload current project:', error);
      return false;
    }
  }, [projectState, loadProject]);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    saveProject,
    loadProject,
    getProjectState,
    setProjectState: setProjectStateMethod,
    reloadCurrentProject,
  }), [saveProject, loadProject, getProjectState, setProjectStateMethod, reloadCurrentProject]);

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
        console.log(`Removed ${currentEdges.length - validatedEdges.length} invalid connection(s) from canvas`);
        return validatedEdges;
      }
      return currentEdges;
    });
  }, [propNodes, setEdges]);

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
          // Only allow connections between exact same types
          const sourceType = sourceHandle.type ?? IOType.None;
          const targetType = targetHandle.type ?? IOType.None;
          
          if (sourceType !== targetType) {
            console.warn(`Cannot connect ${IOType[sourceType]} output to ${IOType[targetType]} input - type mismatch`);
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
    <div className={styles.canvas}>
      <div className={styles.reactFlowWrapper} ref={canvasDrop.reactFlowWrapper}>
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