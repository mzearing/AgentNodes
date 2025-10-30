import { useCallback, useRef, useState } from 'react';
import { Node, ReactFlowInstance } from '@xyflow/react';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';
import { nodeFileSystem } from '../services/nodeFileSystem';
import { Category, IOType } from "../types/project";

let nodeId = 1;
const getNodeId = () => `node_${nodeId++}`;

// Function to sync nodeId counter with existing nodes
const syncNodeIdCounter = (existingNodes: Node[]) => {
  let maxId = 0;
  existingNodes.forEach(node => {
    if (node.id.startsWith('node_')) {
      const idNumber = parseInt(node.id.replace('node_', ''), 10);
      if (!isNaN(idNumber) && idNumber > maxId) {
        maxId = idNumber;
      }
    }
  });
  nodeId = maxId + 1;
};

export const useCanvasDrop = (nodes: Node[], onNodesChange: (nodes: Node[]) => void, onNodeAdd?: (node: Node) => void) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const nodeData = event.dataTransfer.getData('application/reactflow');

      if (!nodeData) return;

      const { nodeId, groupId, category, label, inputs, outputs, variadicInputs, variadicOutputs, solo } = JSON.parse(nodeData);
      
      let finalInputs = inputs;
      let finalOutputs = outputs;
      let finalVariadicInputs = variadicInputs;
      let finalVariadicOutputs = variadicOutputs;
      let finalSolo = solo;

      if (groupId && category) {
        try {
          const hasChanged = await nodeFileSystem.checkNodeFileChanged(nodeId, groupId, category as Category);
          
          if (hasChanged) {
            console.log(`Node file for "${label}" has been updated, refreshing inputs/outputs...`);
            const freshNodeData = await nodeFileSystem.getFreshNodeData(nodeId, groupId, category as Category);
            
            if (freshNodeData) {
              finalInputs = freshNodeData.inputs;
              finalOutputs = freshNodeData.outputs;
              finalVariadicInputs = freshNodeData.variadicInputs;
              finalVariadicOutputs = freshNodeData.variadicOutputs;
              finalSolo = freshNodeData.solo;
              
              console.log(`Updated node "${label}" with fresh data:`, {
                inputs: finalInputs,
                outputs: finalOutputs,
                variadicInputs: finalVariadicInputs,
                variadicOutputs: finalVariadicOutputs,
                solo: finalSolo
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to check for file changes for node "${label}":`, error);
        }
      }
      
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const inputHandles = finalInputs.map((name: string, index: number) => ({
        id: `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name,
        type: IOType.None
      }));
      
      const outputHandles = finalOutputs.map((name: string, index: number) => ({
        id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name,
        type: IOType.None
      }));

      const scriptingNodeData: ScriptingNodeData = {
        nodeId,
        label,
        inputs: inputHandles,
        outputs: outputHandles,
        variadicInputs: finalVariadicInputs,
        variadicOutputs: finalVariadicOutputs,
        solo: finalSolo,
        metadataPath: groupId && category ? `${category.toLowerCase()}/${groupId}` : undefined
      };

      const newNode: Node = {
        id: getNodeId(),
        type: 'scripting-node',
        position,
        data: scriptingNodeData,
      };

      if (finalSolo) {
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
    onDrop,
    syncNodeIdCounter
  };
};