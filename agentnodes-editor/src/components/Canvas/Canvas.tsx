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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes } from '../ScriptingNodes/ScriptingNode';
import { useCanvasDrop } from '../../hooks';
import { ProjectState, NodeMetadata, NodeSummary } from '../../types/project';
import { nodeFileSystem } from '../../services/nodeFileSystem';

// Helper function to compare arrays
const arraysEqual = (arr1: string[], arr2: string[]): boolean => {
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
}

const initialEdges: Edge[] = [];

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
  const { toObject } = useReactFlow();

  // Save project functionality
  const saveProject = useCallback(async (): Promise<boolean> => {
    if (!projectState.hasNodeLoaded) {
      alert('Cannot save: No node loaded!');
      return false;
    }
    
    try {
      const currentState = toObject();
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
          
          // Check if inputs differ
          const inputsChanged = !arraysEqual(previousDep.inputs, currentDep.inputs);
          if (inputsChanged) {
            changes.push('inputs');
          }
          
          // Check if outputs differ  
          const outputsChanged = !arraysEqual(previousDep.outputs, currentDep.outputs);
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
                      name
                    }));
                    nodeData.inputs = newInputs;
                  }
                  
                  // Update outputs if changed
                  if (changedDep.changes.includes('outputs')) {
                    const newOutputs = currentDep.outputs.map((name, index) => ({
                      id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
                      name
                    }));
                    nodeData.outputs = newOutputs;
                  }
                }
              }
            }
          }
          
          // Don't save - just update the canvas
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
      currentState.nodes.forEach((node: Node) => {
        console.log(node.data)
        if (node.data?.["nodeId"] === "start") {
          console.log(node.data);
          (node.data?.["outputs"] as IDName[]).forEach(element => {
            console.log(element);
            inputArray.push(element.name);
          });
          inputNode = node;
        } else if (node.data?.["nodeId"] === "finish") {
          (node.data?.["inputs"] as IDName[]).forEach(element => {
            outputArray.push(element.name);
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
        outputs: outputArray || [],
        variadicOutputs: false,
        variadicInputs: false,
        solo: false
      }

      // Update canvas nodes to reflect any dependency changes before saving
      const updatedCanvasState = await updateCanvasForDependencyChanges(currentState, dependencies);

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
  const updateCanvasForDependencyChanges = useCallback(async (canvasState: any, dependencies: NodeSummary[]) => {
    console.log('Updating canvas for dependency changes...');
    
    // Create a deep copy of the canvas state to avoid mutating the original
    const updatedState = JSON.parse(JSON.stringify(canvasState));
    
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
        
        // Update the canvas node's label and inputs/outputs
        canvasNode.data.label = matchingDependency.name;
        
        // Generate new inputs based on dependency data, preserving existing IDs where possible
        const newInputs = matchingDependency.inputs.map((inputName: string, index: number) => ({
          id: canvasNode.data.inputs?.[index]?.id || `input-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
          name: inputName
        }));
        
        // Generate new outputs based on dependency data, preserving existing IDs where possible
        const newOutputs = matchingDependency.outputs.map((outputName: string, index: number) => ({
          id: canvasNode.data.outputs?.[index]?.id || `output-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
          name: outputName
        }));
        
        // Update the canvas node data
        canvasNode.data.inputs = newInputs;
        canvasNode.data.outputs = newOutputs;
        canvasNode.data.variadicInputs = matchingDependency.variadicInputs;
        canvasNode.data.variadicOutputs = matchingDependency.variadicOutputs;
        canvasNode.data.solo = matchingDependency.solo;
        
        console.log(`Updated canvas node with ${newInputs.length} inputs and ${newOutputs.length} outputs`);
      }
    }
    
    return updatedState;
  }, []);

  // Load project functionality
  const loadProject = useCallback(async (newProjectState: ProjectState): Promise<boolean> => {
    try {
      if (newProjectState.hasNodeLoaded && newProjectState.canvasStateCache) {
        // Load the canvas state from the saved data
        propOnNodesChange(newProjectState.canvasStateCache.nodes);
        setEdges(newProjectState.canvasStateCache.edges);
        setProjectState(newProjectState);
        
        // Sync the node ID counter to prevent ID conflicts when adding new nodes
        canvasDrop.syncNodeIdCounter(newProjectState.canvasStateCache.nodes);
        
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
  }, [propOnNodesChange, setEdges, canvasDrop]);

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
  
  const onConnect = useCallback(
    (params: Edge | Connection) => {
      // Prevent self-connections
      if (params.source === params.target) {
        return;
      }
      
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