import { useCallback, useRef, useState } from 'react';
import { Node, ReactFlowInstance } from '@xyflow/react';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';

let nodeId = 1;
const getNodeId = () => `node_${nodeId++}`;

export const useCanvasDrop = (nodes: Node[], onNodesChange: (nodes: Node[]) => void, onNodeAdd?: (node: Node) => void) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const nodeData = event.dataTransfer.getData('application/reactflow');

      if (!nodeData) return;

      const { nodeId, label, inputs, outputs, variadicInputs, variadicOutputs, solo } = JSON.parse(nodeData);
      
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
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

      if (solo) {
        const existingSoloNode = nodes.find(node => {
          const nodeData = node.data as ScriptingNodeData;
          return nodeData.solo && nodeData.nodeId === nodeId;
        });
        
        if (existingSoloNode) {
          console.warn(`Solo node "${label}" already exists on the canvas`);
          return;
        }
      }

      const newNodes = nodes.concat(newNode);
      onNodesChange(newNodes);
      onNodeAdd?.(newNode);
    },
    [reactFlowInstance, nodes, onNodesChange, onNodeAdd]
  );

  return {
    reactFlowWrapper,
    reactFlowInstance,
    setReactFlowInstance,
    onDragOver,
    onDrop
  };
};