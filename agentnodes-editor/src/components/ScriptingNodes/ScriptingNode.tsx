import React, { useCallback, memo } from 'react';
import { type NodeProps, type NodeTypes } from '@xyflow/react';
import styles from './ScriptingNode.module.css';
import NodeHeader from './NodeHeader/NodeHeader';
import NodeTargets from './NodeTargets/NodeTargets';
import NodeSources from './NodeSources/NodeSources';
import { useNodeHandles } from '../../hooks';

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
  metadataPath?: string;
}

const ScriptingNode: React.FC<NodeProps> = memo(({ data, selected, id }) => {
  const scriptNodeData = data as unknown as ScriptingNodeData;
  const nodeHandles = useNodeHandles(id);

  const handleInputsChange = useCallback((newInputs: InputHandle[]) => {
    const currentInputs = scriptNodeData.inputs;
    nodeHandles.updateInputs(newInputs, currentInputs);
  }, [nodeHandles, scriptNodeData.inputs]);

  const handleOutputsChange = useCallback((newOutputs: OutputHandle[]) => {
    const currentOutputs = scriptNodeData.outputs;
    nodeHandles.updateOutputs(newOutputs, currentOutputs);
  }, [nodeHandles, scriptNodeData.outputs]);

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
});

export const nodeTypes: NodeTypes = {
  'scripting-node': ScriptingNode,
};