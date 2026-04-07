import React, { useCallback } from 'react';
import { type NodeProps, type NodeTypes, Position, Handle as HandleComponent } from '@xyflow/react';
import styles from './ScriptingNode.module.css';
import targetStyles from './NodeTargets/NodeTargets.module.css';
import sourceStyles from './NodeSources/NodeSources.module.css';
import NodeHeader from './NodeHeader/NodeHeader';
import NodeTargets from './NodeTargets/NodeTargets';
import NodeSources from './NodeSources/NodeSources';
import NodeData from './NodeData/NodeData';
import { useNodeHandles } from '../../hooks';
import { IOType } from '../../types/project';
import { allTypeOptions, hexToRgba } from '../../utils/typeColors';

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

export interface ControlFlowHandle {
  id: string;
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
  // Control flow handles (separate from data ports)
  controlFlowInput?: ControlFlowHandle;   // None-typed, present on all nodes except start
  controlFlowOutput?: ControlFlowHandle;  // None-typed, present on all nodes except finish
  // Variable-specific properties
  variableId?: string;
  variableName?: string;
  isVariableNode?: boolean;
  isGetter?: boolean;
  // Starting point indicator
  isStartingPoint?: boolean;
  connectedOutputs?: string[];
}

const cfColor = allTypeOptions[0].color; // '#4A5568' — None type
const cfHandleStyle = {
  backgroundColor: cfColor,
  borderColor: cfColor,
  '--handle-color': cfColor,
  '--handle-shadow': hexToRgba(cfColor, 0.4),
  '--handle-shadow-strong': hexToRgba(cfColor, 0.6),
} as React.CSSProperties;

const ScriptingNode: React.FC<NodeProps> = ({ data, selected, id }) => {
  const scriptNodeData = data as unknown as ScriptingNodeData;
  const nodeHandles = useNodeHandles(id);

  // Check if this node is a starting point
  const isStartingPoint = scriptNodeData.isStartingPoint || false;
  const connectedOutputs = scriptNodeData.connectedOutputs || [];

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

  const handleLabelChange = useCallback((newLabel: string) => {
    nodeHandles.updateLabel(newLabel);
  }, [nodeHandles]);

  const hasConstants = scriptNodeData.constantData && scriptNodeData.constantData.length > 0 && scriptNodeData.constantData.some(type => type !== IOType.None);
  const hasInputs = scriptNodeData.inputs && scriptNodeData.inputs.length > 0;

  return (
    <div className={`${styles.scriptingNodeWrapper} ${selected ? styles.selected : ''}`}>
      {(hasInputs || scriptNodeData.controlFlowInput) && (
        <div className={styles.inputPortRow}>
          {hasInputs && (
            <NodeTargets
              inputs={scriptNodeData.inputs}
              variadic={scriptNodeData.variadicInputs || false}
              multitype={scriptNodeData.multitypeInputs || false}
              availableTypes={scriptNodeData.availableInputTypes}
              onInputsChange={handleInputsChange}
            />
          )}
          {scriptNodeData.controlFlowInput && (
            <div className={styles.cfTile}>
              <HandleComponent
                id={scriptNodeData.controlFlowInput.id}
                type="target"
                position={Position.Top}
                className={targetStyles.inputHandle}
                style={cfHandleStyle}
              />
              <div className={styles.cfChevronBg}>
                <svg className={styles.controlFlowChevron} viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0,0 L10,12 L20,0 L15,0 L10,7 L5,0 Z" />
                </svg>
              </div>
            </div>
          )}
        </div>
      )}
      <div className={styles.scriptingNode}>
        <NodeHeader
          label={scriptNodeData.label}
          onLabelChange={handleLabelChange}
        >
          {hasConstants && (
            <NodeData
              constantData={scriptNodeData.constantData}
              constantValues={scriptNodeData.constantValues}
              onConstantValuesChange={handleConstantValuesChange}
            />
          )}
        </NodeHeader>
      </div>
      <div className={styles.outputPortRow}>
        <NodeSources
          outputs={scriptNodeData.outputs}
          variadic={scriptNodeData.variadicOutputs || false}
          multitype={scriptNodeData.multitypeOutputs || false}
          availableTypes={scriptNodeData.availableOutputTypes}
          onOutputsChange={handleOutputsChange}
          isStartingPoint={isStartingPoint}
          connectedOutputs={connectedOutputs}
        />
        {scriptNodeData.controlFlowOutput && (
          <div className={styles.cfTile}>
            <div className={styles.cfChevronBg}>
              <svg className={styles.controlFlowChevron} viewBox="0 0 20 12" xmlns="http://www.w3.org/2000/svg">
                <path d="M0,0 L10,12 L20,0 L15,0 L10,7 L5,0 Z" />
              </svg>
            </div>
            <HandleComponent
              id={scriptNodeData.controlFlowOutput.id}
              type="source"
              position={Position.Bottom}
              className={sourceStyles.outputHandle}
              style={cfHandleStyle}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const nodeTypes: NodeTypes = {
  'scripting-node': ScriptingNode,
};