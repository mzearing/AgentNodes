import { useCallback, useMemo, useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { Variable } from '../types/project';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';

export const useVariableNodeSync = (
  nodes: Node[],
  onNodesChange: (nodes: Node[]) => void
) => {
  // Use refs to avoid stale closure issues
  const nodesRef = useRef(nodes);
  const onNodesChangeRef = useRef(onNodesChange);
  
  // Update refs when props change
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  
  useEffect(() => {
    onNodesChangeRef.current = onNodesChange;
  }, [onNodesChange]);
  
  const updateVariableNodes = useCallback((variable: Variable) => {
    console.log('[useVariableNodeSync] updateVariableNodes called with:', variable);
    console.log('[useVariableNodeSync] Current nodes count:', nodesRef.current.length);
    
    const updatedNodes = nodesRef.current.map(node => {
      const data = node.data as ScriptingNodeData;
      
      // Only update variable nodes that match this variable
      if (data.isVariableNode && data.variableId === variable.id) {
        console.log('[useVariableNodeSync] Found matching node:', node.id, 'isGetter:', data.isGetter);
        const isGetter = data.isGetter;
        
        return {
          ...node,
          data: {
            ...data,
            nodeId: `variable_${isGetter ? 'get' : 'set'}_${variable.id}`,
            label: `${isGetter ? 'Get' : 'Set'} ${variable.name}`,
            variableName: variable.name,
            inputs: isGetter ? [] : [{
              id: (data.inputs && data.inputs.length > 0) ? data.inputs[0].id : `input-${Date.now()}-${Math.random()}`,
              name: 'value',
              type: variable.type
            }],
            outputs: isGetter ? [{
              id: (data.outputs && data.outputs.length > 0) ? data.outputs[0].id : `output-${Date.now()}-${Math.random()}`,
              name: variable.name,
              type: variable.type
            }] : []
          }
        };
      }
      
      return node;
    });
    
    onNodesChangeRef.current(updatedNodes);
  }, []);

  const removeVariableNodes = useCallback((variableId: string) => {
    const filteredNodes = nodesRef.current.filter(node => {
      const data = node.data as ScriptingNodeData;
      return !(data.isVariableNode && data.variableId === variableId);
    });
    
    onNodesChangeRef.current(filteredNodes);
  }, []);

  return useMemo(() => ({
    updateVariableNodes,
    removeVariableNodes
  }), [updateVariableNodes, removeVariableNodes]);
};