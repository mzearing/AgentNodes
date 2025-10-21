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
import { debug } from 'util';

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
      const dependencies : NodeSummary[] = []
      
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
        path: "",
        id: loadedId,
        name: loadedName,
        inputs: inputArray || [],
        outputs: outputArray || [],
      }

      const finalSaveData: NodeMetadata = {
        summary: mySummary,

        data: currentState
      };

      // Save the node data
      const success = await nodeFileSystem.writeNode(
        groupId, 
        loadedId, 
        finalSaveData as unknown as JSON, 
        category as 'Complex' | 'Atomic'
      );
      
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

  // Load project functionality
  const loadProject = useCallback(async (newProjectState: ProjectState): Promise<boolean> => {
    try {
      if (newProjectState.hasNodeLoaded && newProjectState.canvasStateCache) {
        // Load the canvas state from the saved data
        propOnNodesChange(newProjectState.canvasStateCache.nodes);
        setEdges(newProjectState.canvasStateCache.edges);
        setProjectState(newProjectState);
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
  }, [propOnNodesChange, setEdges]);

  // Get current project state
  const getProjectState = useCallback((): ProjectState | null => {
    return projectState;
  }, [projectState]);

  // Set project state (for external updates)
  const setProjectStateMethod = useCallback((newProjectState: ProjectState) => {
    setProjectState(newProjectState);
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    saveProject,
    loadProject,
    getProjectState,
    setProjectState: setProjectStateMethod,
  }), [saveProject, loadProject, getProjectState, setProjectStateMethod]);

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