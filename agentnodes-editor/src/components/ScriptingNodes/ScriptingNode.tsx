import React, { useCallback } from 'react';
import { type NodeProps, type NodeTypes } from '@xyflow/react';
import styles from './ScriptingNode.module.css';
import NodeHeader from './NodeHeader/NodeHeader';
import NodeTargets from './NodeTargets/NodeTargets';
import NodeSources from './NodeSources/NodeSources';
import NodeData from './NodeData/NodeData';
import { useNodeHandles } from '../../hooks';
import { IOType } from '../../types/project';

export interface InputHandle {
  id: string;
  name: string;
  type: IOType;
}

export interface OutputHandle {
  id: string;
  name: string;
  type: IOType;
}

export interface ConstantDataValue {
  type: IOType;
  value: string | number | boolean;
}

export interface ScriptingNodeData extends Record<string, unknown> {
  nodeId?: string;
  label: string;
  inputs: InputHandle[];
  outputs: OutputHandle[];
  properties?: Record<string, unknown>;
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
  multitypeInputs?: boolean;
  multitypeOutputs?: boolean;
  availableInputTypes?: (IOType[] | undefined)[];
  availableOutputTypes?: (IOType[] | undefined)[];
  solo?: boolean;
  metadataPath?: string;
  constantData?: IOType[];
  constantValues?: ConstantDataValue[];
  // Variable-specific properties
  variableId?: string;
  variableName?: string;
  isVariableNode?: boolean;
  isGetter?: boolean;
}

const ScriptingNode: React.FC<NodeProps> = ({ data, selected, id }) => {
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

  const handleConstantValuesChange = useCallback((newValues: ConstantDataValue[]) => {
    nodeHandles.updateConstantValues(newValues);
  }, [nodeHandles]);

  const hasConstants = scriptNodeData.constantData && scriptNodeData.constantData.length > 0 && scriptNodeData.constantData.some(type => type !== IOType.None);

  return (
    <div className={`${styles.scriptingNode} ${selected ? styles.selected : ''} ${!hasConstants ? styles.noConstants : ''}`}>
      <NodeHeader 
        label={scriptNodeData.label}
      />
      <NodeTargets 
        inputs={scriptNodeData.inputs} 
        variadic={scriptNodeData.variadicInputs || false}
        multitype={scriptNodeData.multitypeInputs || false}
        availableTypes={scriptNodeData.availableInputTypes}
        onInputsChange={handleInputsChange}
      />
      {hasConstants && (
        <NodeData 
          constantData={scriptNodeData.constantData}
          constantValues={scriptNodeData.constantValues}
          onConstantValuesChange={handleConstantValuesChange}
        />
      )}
      <NodeSources 
        outputs={scriptNodeData.outputs}
        variadic={scriptNodeData.variadicOutputs || false}
        multitype={scriptNodeData.multitypeOutputs || false}
        availableTypes={scriptNodeData.availableOutputTypes}
        onOutputsChange={handleOutputsChange}
      />
      
    </div>
  );
};

export const nodeTypes: NodeTypes = {
  'scripting-node': ScriptingNode,
};