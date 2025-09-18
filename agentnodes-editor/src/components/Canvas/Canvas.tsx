import React, { useCallback, useState, useRef, DragEvent } from 'react';
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
  ReactFlowInstance,
  applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes, ScriptingNodeData } from '../ScriptingNodes/ScriptingNode';

interface CanvasProps {
  nodes: Node[];
  onNodesChange: (nodes: Node[]) => void;
  onNodeAdd?: (node: Node) => void;
}

const initialEdges: Edge[] = [];

// temporary global node naming
let nodeId = 1;
const getNodeId = () => `node_${nodeId++}`;

const CanvasComponent: React.FC<CanvasProps> = ({ nodes: propNodes, onNodesChange: propOnNodesChange, onNodeAdd }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Use the nodes from props directly and create a wrapped onChange
  const wrappedOnNodesChange = React.useCallback((changes: any) => {
    // Apply the changes to get the new nodes
    const newNodes = applyNodeChanges(changes, propNodes);
    propOnNodesChange(newNodes);
  }, [propOnNodesChange, propNodes]);
  
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

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const nodeData = event.dataTransfer.getData('application/reactflow');

      if (!nodeData) return;

      const { nodeId, label, inputs, outputs, variadicInputs, variadicOutputs, solo } = JSON.parse(nodeData);
      
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      
      // Convert string arrays to handle objects with unique IDs
      const inputHandles = inputs.map((name: string, index: number) => ({
        id: `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name
      }));
      
      const outputHandles = outputs.map((name: string, index: number) => ({
        id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name
      }));

      const scriptingNodeData: ScriptingNodeData = {
        nodeId,
        label,
        inputs: inputHandles,
        outputs: outputHandles,
        variadicInputs,
        variadicOutputs,
        solo
      };

      const newNode: Node = {
        id: getNodeId(),
        type: 'scripting-node',
        position,
        data: scriptingNodeData,
      };
      
      // Check if this is a solo node and if one already exists
      if (solo) {
        const existingSoloNode = propNodes.find(node => {
          const nodeData = node.data as ScriptingNodeData;
          return nodeData.solo && nodeData.nodeId === nodeId;
        });
        
        if (existingSoloNode) {
          console.warn(`Solo node "${label}" already exists on the canvas`);
          return;
        }
      }
      
      // Add the new node
      const newNodes = propNodes.concat(newNode);
      propOnNodesChange(newNodes);
      onNodeAdd?.(newNode);
    },
    [reactFlowInstance, propNodes, propOnNodesChange, onNodeAdd]
  );

  return (
    <div className={styles.canvas}>
      <div className={styles.reactFlowWrapper} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={propNodes}
          edges={edges}
          onNodesChange={wrappedOnNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          className={styles.reactFlow}
          proOptions={{hideAttribution: true}}
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
};

const Canvas: React.FC<CanvasProps> = (props) => (
  <ReactFlowProvider>
    <CanvasComponent {...props} />
  </ReactFlowProvider>
);

export default Canvas;