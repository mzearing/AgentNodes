import { useCallback, useMemo } from 'react';
import { Node } from '@xyflow/react';
import { Variable } from '../types/project';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';

export const useVariableNodeSync = (
  nodes: Node[],
  onNodesChange: (nodes: Node[]) => void
) => {
  
  const updateVariableNodes = useCallback((variable: Variable) => {
    const updatedNodes = nodes.map(node => {
      const data = node.data as ScriptingNodeData;
      
      // Only update variable nodes that match this variable
      if (data.isVariableNode && data.variableId === variable.id) {
        const isGetter = data.isGetter;
        
        return {
          ...node,
          data: {
            ...data,
            label: `${isGetter ? 'Get' : 'Set'} ${variable.name}`,
            variableName: variable.name,
            inputs: isGetter ? [] : [{
              id: data.inputs[0]?.id || `input-${Date.now()}`,
              name: 'value',
              type: variable.type
            }],
            outputs: isGetter ? [{
              id: data.outputs[0]?.id || `output-${Date.now()}`,
              name: variable.name,
              type: variable.type
            }] : []
          }
        };
      }
      
      return node;
    });
    
    onNodesChange(updatedNodes);
  }, [nodes, onNodesChange]);

  const removeVariableNodes = useCallback((variableId: string) => {
    const filteredNodes = nodes.filter(node => {
      const data = node.data as ScriptingNodeData;
      return !(data.isVariableNode && data.variableId === variableId);
    });
    
    onNodesChange(filteredNodes);
  }, [nodes, onNodesChange]);

  return useMemo(() => ({
    updateVariableNodes,
    removeVariableNodes
  }), [updateVariableNodes, removeVariableNodes]);
};