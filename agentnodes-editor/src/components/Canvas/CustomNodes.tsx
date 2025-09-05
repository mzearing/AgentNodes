import React from 'react';
import { Handle, Position, NodeProps, NodeTypes } from '@xyflow/react';
import styles from './CustomNodes.module.css';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  description?: string;
  nodeType: string;
  icon?: string;
}

const InputNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`${styles.customNode} ${styles.inputNode} ${selected ? styles.selected : ''}`}>
      <div className={styles.nodeHeader}>
        {(data as unknown as CustomNodeData).icon && <span className={styles.nodeIcon}>{(data as unknown as CustomNodeData).icon}</span>}
        <span className={styles.nodeTitle}>{(data as unknown as CustomNodeData).label}</span>
      </div>
      {data.description && (
        <div className={styles.nodeDescription}>{(data as unknown as CustomNodeData).description}</div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
    </div>
  );
};

const ProcessingNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`${styles.customNode} ${styles.processingNode} ${selected ? styles.selected : ''}`}>
      <div className={styles.nodeHeader}>
        {(data as unknown as CustomNodeData).icon && <span className={styles.nodeIcon}>{(data as unknown as CustomNodeData).icon}</span>}
        <span className={styles.nodeTitle}>{(data as unknown as CustomNodeData).label}</span>
      </div>
      {data.description && (
        <div className={styles.nodeDescription}>{(data as unknown as CustomNodeData).description}</div>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
    </div>
  );
};

const OutputNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`${styles.customNode} ${styles.outputNode} ${selected ? styles.selected : ''}`}>
      <div className={styles.nodeHeader}>
        {(data as unknown as CustomNodeData).icon && <span className={styles.nodeIcon}>{(data as unknown as CustomNodeData).icon}</span>}
        <span className={styles.nodeTitle}>{(data as unknown as CustomNodeData).label}</span>
      </div>
      {data.description && (
        <div className={styles.nodeDescription}>{(data as unknown as CustomNodeData).description}</div>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
    </div>
  );
};

const ToolNode: React.FC<NodeProps> = ({ data, selected }) => {
  return (
    <div className={`${styles.customNode} ${styles.toolNode} ${selected ? styles.selected : ''}`}>
      <div className={styles.nodeHeader}>
        {(data as unknown as CustomNodeData).icon && <span className={styles.nodeIcon}>{(data as unknown as CustomNodeData).icon}</span>}
        <span className={styles.nodeTitle}>{(data as unknown as CustomNodeData).label}</span>
      </div>
      {data.description && (
        <div className={styles.nodeDescription}>{(data as unknown as CustomNodeData).description}</div>
      )}
      <Handle
        type="target"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
    </div>
  );
};

export const nodeTypes: NodeTypes = {
  'input-node': InputNode,
  'processing-node': ProcessingNode,
  'output-node': OutputNode,
  'tool-node': ToolNode,
};

export const getNodeTypeByCategory = (categoryId: string): string => {
  switch (categoryId) {
    case 'input-nodes':
      return 'input-node';
    case 'processing-nodes':
      return 'processing-node';
    case 'output-nodes':
      return 'output-node';
    case 'tools':
      return 'tool-node';
    default:
      return 'default';
  }
};