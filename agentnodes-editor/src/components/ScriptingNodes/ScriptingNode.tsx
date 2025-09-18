import React, { useCallback } from 'react';
import { type NodeProps, type NodeTypes, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import styles from './ScriptingNode.module.css';
import NodeHeader from './NodeHeader/NodeHeader';
import NodeTargets from './NodeTargets/NodeTargets';
import NodeSources from './NodeSources/NodeSources';

export interface InputHandle {
  id: string;
  name: string;
}

export interface OutputHandle {
  id: string;
  name: string;
}

export interface ScriptingNodeData extends Record<string, unknown> {
  nodeId?: string;
  label: string;
  inputs: InputHandle[];
  outputs: OutputHandle[];
  properties?: Record<string, unknown>;
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
  solo?: boolean;
}

const ScriptingNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const scriptNodeData = data as unknown as ScriptingNodeData;
  const { setNodes, setEdges } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  const handleInputsChange = useCallback((newInputs: InputHandle[]) => {
    const currentInputs = scriptNodeData.inputs;
    
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                inputs: newInputs,
              },
            }
          : node
      )
    );
    if (newInputs.length < currentInputs.length) {
      const validInputIds = new Set(newInputs.map(input => input.id));
      
      setEdges((edges) =>
        edges.filter((edge) => {
          if (edge.target === id && edge.targetHandle) {
            return validInputIds.has(edge.targetHandle);
          }
          return true;
        })
      );
    }
    updateNodeInternals(id);
  }, [setNodes, setEdges, updateNodeInternals, id, scriptNodeData.inputs]);

  const handleOutputsChange = useCallback((newOutputs: OutputHandle[]) => {
    const currentOutputs = scriptNodeData.outputs;
    
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                outputs: newOutputs,
              },
            }
          : node
      )
    );

    // Remove edges connected to deleted output handles
    if (newOutputs.length < currentOutputs.length) {
      const validOutputIds = new Set(newOutputs.map(output => output.id));
      
      setEdges((edges) =>
        edges.filter((edge) => {
          if (edge.source === id && edge.sourceHandle) {
            return validOutputIds.has(edge.sourceHandle);
          }
          return true;
        })
      );
    }

    // Update React Flow's internal node data after handles change
    updateNodeInternals(id);
  }, [setNodes, setEdges, updateNodeInternals, id, scriptNodeData.outputs]);

  return (
    <div className={`${styles.scriptingNode} ${selected ? styles.selected : ''}`}>
      <NodeHeader 
        label={scriptNodeData.label}
      />
      <NodeTargets 
        inputs={scriptNodeData.inputs} 
        variadic={scriptNodeData.variadicInputs || false}
        onInputsChange={handleInputsChange}
      />
      <NodeSources 
        outputs={scriptNodeData.outputs}
        variadic={scriptNodeData.variadicOutputs || false}
        onOutputsChange={handleOutputsChange}
      />
    </div>
  );
};

export const nodeTypes: NodeTypes = {
  'scripting-node': ScriptingNode,
};