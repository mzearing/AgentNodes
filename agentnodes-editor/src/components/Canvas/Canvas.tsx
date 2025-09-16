import React, { useCallback, useState, useRef, DragEvent } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  BackgroundVariant,
  ReactFlowProvider,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes, ScriptingNodeData } from '../ScriptingNodes/ScriptingNode';

interface CanvasProps {
  onNodeAdd?: (node: Node) => void;
}

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

// temporary global node naming
let nodeId = 1;
const getNodeId = () => `node_${nodeId++}`;

const CanvasComponent: React.FC<CanvasProps> = ({ onNodeAdd }) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
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

      const { label, inputs, outputs, variadicInputs, variadicOutputs } = JSON.parse(nodeData);
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
        label,
        inputs: inputHandles,
        outputs: outputHandles,
        variadicInputs,
        variadicOutputs
      };


      const newNode: Node = {
        id: getNodeId(),
        type: 'scripting-node',
        position,
        data: scriptingNodeData,
      };
      

      setNodes((nds) => nds.concat(newNode));
      onNodeAdd?.(newNode);
    },
    [reactFlowInstance, setNodes, onNodeAdd]
  );

  return (
    <div className={styles.canvas}>
      <div className={styles.reactFlowWrapper} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
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