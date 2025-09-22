import React, { useCallback } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import styles from './Canvas.module.css';
import { nodeTypes } from '../ScriptingNodes/ScriptingNode';
import { useCanvasDrop } from '../../hooks';

interface CanvasProps {
  nodes: Node[];
  onNodesChange: (nodes: Node[]) => void;
  onNodeAdd?: (node: Node) => void;
}

const initialEdges: Edge[] = [];

const CanvasComponent: React.FC<CanvasProps> = ({ nodes: propNodes, onNodesChange: propOnNodesChange, onNodeAdd }) => {
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const canvasDrop = useCanvasDrop(propNodes, propOnNodesChange, onNodeAdd);

  // Use the nodes from props directly and create a wrapped onChange
  const wrappedOnNodesChange = React.useCallback((changes: Parameters<typeof applyNodeChanges>[0]) => {
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