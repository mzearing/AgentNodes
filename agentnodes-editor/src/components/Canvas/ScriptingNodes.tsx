import React from 'react';
import { Handle as XYHandle, Position, NodeProps, NodeTypes } from '@xyflow/react';
import styles from './ScriptingNodes.module.css';

export interface ScriptingNodeData extends Record<string, unknown> {
  label: string;
}

const ScriptingNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`${styles.scriptingNode} ${selected ? styles.selected : ''}`}>
      <div className={styles.nodeHeader}>
        <span className={styles.nodeTitle}>{(data as unknown as ScriptingNodeData).label}</span>
      </div>
      <XYHandle
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <XYHandle
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
    </div>
  );
};

export const nodeTypes: NodeTypes = {
  'scripting-node': ScriptingNode,
};