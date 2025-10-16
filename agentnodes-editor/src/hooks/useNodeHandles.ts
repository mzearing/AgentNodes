import { useCallback } from 'react';
import { useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { InputHandle, OutputHandle } from '../components/ScriptingNodes/ScriptingNode';

export const useNodeHandles = (nodeId: string) => {
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const updateInputs = useCallback((newInputs: InputHandle[], currentInputs: InputHandle[]) => {
    setNodes((nodes) => {
      const targetNode = nodes.find(node => node.id === nodeId);
      if (!targetNode) return nodes;
      
      const updatedNode = {
        ...targetNode,
        data: {
          ...targetNode.data,
          inputs: newInputs,
        },
      };
      
      // Only create new array if node actually changed
      const nodeIndex = nodes.indexOf(targetNode);
      const newNodes = [...nodes];
      newNodes[nodeIndex] = updatedNode;
      return newNodes;
    });

    if (newInputs.length < currentInputs.length) {
      const validInputIds = new Set(newInputs.map(input => input.id));
      
      setEdges((edges) =>
        edges.filter((edge) => {
          if (edge.target === nodeId && edge.targetHandle) {
            return validInputIds.has(edge.targetHandle);
          }
          return true;
        })
      );
    }
    updateNodeInternals(nodeId);
  }, [setNodes, setEdges, updateNodeInternals, nodeId]);

  const updateOutputs = useCallback((newOutputs: OutputHandle[], currentOutputs: OutputHandle[]) => {
    setNodes((nodes) => {
      const targetNode = nodes.find(node => node.id === nodeId);
      if (!targetNode) return nodes;
      
      const updatedNode = {
        ...targetNode,
        data: {
          ...targetNode.data,
          outputs: newOutputs,
        },
      };
      
      // Only create new array if node actually changed
      const nodeIndex = nodes.indexOf(targetNode);
      const newNodes = [...nodes];
      newNodes[nodeIndex] = updatedNode;
      return newNodes;
    });

    if (newOutputs.length < currentOutputs.length) {
      const validOutputIds = new Set(newOutputs.map(output => output.id));
      
      setEdges((edges) =>
        edges.filter((edge) => {
          if (edge.source === nodeId && edge.sourceHandle) {
            return validOutputIds.has(edge.sourceHandle);
          }
          return true;
        })
      );
    }

    updateNodeInternals(nodeId);
  }, [setNodes, setEdges, updateNodeInternals, nodeId]);

  return {
    updateInputs,
    updateOutputs
  };
};