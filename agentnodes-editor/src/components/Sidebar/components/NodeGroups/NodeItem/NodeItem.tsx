import React, { useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from '../NodeGroups.module.css';
import { SidebarNode, Category } from '../../../types';
import { ScriptingNodeData } from '../../../../ScriptingNodes/ScriptingNode';

interface NodeItemEditingState {
  isEditing: boolean;
  editingNodeName: string;
}

interface NodeItemHandlers {
  onNodeClick: (node: SidebarNode) => void;
  onDragStart: (event: React.DragEvent, node: SidebarNode) => void;
  onStartNodeEditing: (groupId: string, nodeId: string, nodeName: string) => void;
  onNodeNameSubmit: () => void;
  onNodeNameKeyDown: (e: React.KeyboardEvent) => void;
  onNodeNameChange: (value: string) => void;
  onConfirmDeleteNode: (groupId: string, nodeId: string) => void;
}

interface NodeItemProps {
  node: SidebarNode;
  groupId: string;
  nodes: Node[];
  activeCategory: Category;
  editingState: NodeItemEditingState;
  handlers: NodeItemHandlers;
}

const NodeItem: React.FC<NodeItemProps> = ({
  node,
  groupId,
  nodes,
  activeCategory,
  editingState,
  handlers,
}) => {
  const editNodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingState.isEditing && editNodeInputRef.current) {
      editNodeInputRef.current.focus();
      editNodeInputRef.current.select();
    }
  }, [editingState.isEditing]);

  const isNodeAlreadyOnCanvas = (sidebarNode: SidebarNode): boolean => {
    if (!sidebarNode.solo) return false;
    
    return nodes.some(canvasNode => {
      const nodeData = canvasNode.data as ScriptingNodeData;
      return nodeData.solo && nodeData.nodeId === sidebarNode.id;
    });
  };

  const isDisabled = isNodeAlreadyOnCanvas(node);

  return (
    <div
      key={node.id}
      className={`${styles.node} ${isDisabled ? styles.disabled : ''}`}
      onClick={() => !isDisabled && !editingState.isEditing && handlers.onNodeClick(node)}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      draggable={!isDisabled && !editingState.isEditing}
      onDragStart={(event) => !editingState.isEditing && handlers.onDragStart(event, node)}
      onKeyDown={(e) => {
        if (!isDisabled && !editingState.isEditing && (e.key === 'Enter' || e.key === ' ')) {
          handlers.onNodeClick(node);
        }
      }}
    >
      <div className={styles.nodeContent}>
        {editingState.isEditing ? (
          <input
            ref={editNodeInputRef}
            type="text"
            value={editingState.editingNodeName}
            onChange={(e) => handlers.onNodeNameChange(e.target.value)}
            onBlur={handlers.onNodeNameSubmit}
            onKeyDown={handlers.onNodeNameKeyDown}
            className={styles.nodeNameInput}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div className={styles.nodeName}>{node.name}</div>
        )}
      </div>
      {activeCategory === 'Complex' && !isDisabled && (
        <div className={styles.nodeActions}>
          <button
            className={styles.nodeDeleteButton}
            onClick={(e) => {
              e.stopPropagation();
              handlers.onConfirmDeleteNode(groupId, node.id);
            }}
            title="Delete node"
          >
            ×
          </button>
          <button
            className={styles.nodeEditButton}
            onClick={(e) => {
              e.stopPropagation();
              handlers.onStartNodeEditing(groupId, node.id, node.name);
            }}
            title="Edit node"
          >
            ✎
          </button>
        </div>
      )}
    </div>
  );
};

export default NodeItem;