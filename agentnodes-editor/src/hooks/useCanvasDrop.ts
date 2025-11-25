import { useCallback, useRef, useState } from 'react';
import { Node, ReactFlowInstance } from '@xyflow/react';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';
import { nodeFileSystem } from '../services/nodeFileSystem';
import { Category, IOType } from "../types/project";

// Helper function to extract available types from type arrays
const extractAvailableTypes = (types: IOType[] | IOType[][] | undefined): (IOType[] | undefined)[] | undefined => {
  if (!types || types.length === 0) return undefined;
  
  // Check if it's IOType[][] (array of arrays)
  if (Array.isArray(types[0])) {
    return types as IOType[][];
  }
  
  // Convert IOType[] to IOType[][] format (each type becomes a single-element array)
  return (types as IOType[]).map(type => [type]);
};

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

      const { nodeId, groupId, category, label, inputs, outputs, inputTypes, outputTypes, variadicInputs, variadicOutputs, multitypeInputs, multitypeOutputs, solo, constantData } = JSON.parse(nodeData);
      
      let finalInputs = inputs;
      let finalOutputs = outputs;
      let finalInputTypes = inputTypes;
      let finalOutputTypes = outputTypes;
      let finalVariadicInputs = variadicInputs;
      let finalVariadicOutputs = variadicOutputs;
      let finalMultitypeInputs = multitypeInputs;
      let finalMultitypeOutputs = multitypeOutputs;
      let finalSolo = solo;
      let finalConstantData = constantData || [];

      if (groupId && category) {
        try {
          const hasChanged = await nodeFileSystem.checkNodeFileChanged(nodeId, groupId, category as Category);
          
          if (hasChanged) {
            console.log(`Node file for "${label}" has been updated, refreshing inputs/outputs...`);
            const freshNodeData = await nodeFileSystem.getFreshNodeData(nodeId, groupId, category as Category);
            
            if (freshNodeData) {
              finalInputs = freshNodeData.inputs;
              finalOutputs = freshNodeData.outputs;
              finalInputTypes = freshNodeData.inputTypes;
              finalOutputTypes = freshNodeData.outputTypes;
              finalVariadicInputs = freshNodeData.variadicInputs;
              finalVariadicOutputs = freshNodeData.variadicOutputs;
              finalMultitypeInputs = freshNodeData.multitypeInputs;
              finalMultitypeOutputs = freshNodeData.multitypeOutputs;
              finalSolo = freshNodeData.solo;
              finalConstantData = freshNodeData.constantData || [];
              
              console.log(`Updated node "${label}" with fresh data:`, {
                inputs: finalInputs,
                outputs: finalOutputs,
                inputTypes: finalInputTypes,
                outputTypes: finalOutputTypes,
                variadicInputs: finalVariadicInputs,
                variadicOutputs: finalVariadicOutputs,
                solo: finalSolo,
                constantData: finalConstantData
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
      // Helper to get first type from IOType | IOType[] for handle creation
      const getFirstType = (typeOrArray: IOType | IOType[] | undefined): IOType => {
        if (typeOrArray === undefined) return IOType.None;
        if (Array.isArray(typeOrArray)) return typeOrArray[0] || IOType.None;
        return typeOrArray;
      };

      const inputHandles = finalInputs.map((name: string, index: number) => ({
        id: `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name,
        type: getFirstType(finalInputTypes?.[index])
      }));
      
      const outputHandles = finalOutputs.map((name: string, index: number) => ({
        id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`,
        name,
        type: getFirstType(finalOutputTypes?.[index])
      }));

      // Initialize constant values based on constantData
      const initializeConstantValues = (constantData: IOType[]) => {
        return constantData.map((type) => {
          switch (type) {
            case IOType.Integer:
              return { type, value: 0 };
            case IOType.Float:
              return { type, value: 0.0 };
            case IOType.String:
              return { type, value: '' };
            case IOType.Boolean:
              return { type, value: false };
            default:
              return { type, value: '' };
          }
        });
      };

      const scriptingNodeData: ScriptingNodeData = {
        nodeId,
        label,
        inputs: inputHandles,
        outputs: outputHandles,
        variadicInputs: finalVariadicInputs,
        variadicOutputs: finalVariadicOutputs,
        multitypeInputs: finalMultitypeInputs,
        multitypeOutputs: finalMultitypeOutputs,
        availableInputTypes: extractAvailableTypes(finalInputTypes),
        availableOutputTypes: extractAvailableTypes(finalOutputTypes),
        solo: finalSolo,
        metadataPath: groupId && category ? `${category.toLowerCase()}/${groupId}` : undefined,
        constantData: finalConstantData,
        constantValues: finalConstantData && finalConstantData.length > 0 ? initializeConstantValues(finalConstantData) : undefined
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