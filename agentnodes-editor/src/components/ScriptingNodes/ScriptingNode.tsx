import React from 'react';
import { type NodeProps, type NodeTypes, useReactFlow } from '@xyflow/react';
import styles from './ScriptingNode.module.css';
import NodeHeader from './NodeHeader/NodeHeader';
import NodeTargets from './NodeTargets/NodeTargets';
import NodeSources from './NodeSources/NodeSources';
import NodeProperties from './NodeProperties/NodeProperties';

export interface ScriptingNodeData extends Record<string, unknown> {
  label: string;
  inputs: string[];
  outputs: string[];
  properties?: Record<string, unknown>;
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
}

const ScriptingNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const scriptNodeData = data as unknown as ScriptingNodeData;
  const { setNodes } = useReactFlow();

  const handleInputsChange = (newInputs: string[]) => {
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
  };

  const handleOutputsChange = (newOutputs: string[]) => {
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
  };

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
      <NodeProperties properties={scriptNodeData.properties} />
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