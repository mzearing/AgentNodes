import React, { useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from '../NodeGroups.module.css';
import { NodeSummary, Category } from "../../../../../types/project"
import { ScriptingNodeData } from '../../../../ScriptingNodes/ScriptingNode';
import { useNodeCompilationStatus } from '../../../../../hooks/useNodeCompilationStatus';

interface NodeItemEditingState {
  isEditing: boolean;
  editingNodeName: string;
}

interface NodeItemHandlers {
  onNodeClick: (node: NodeSummary, groupId: string) => void;
  onDragStart: (event: React.DragEvent, node: NodeSummary, groupId: string) => void;
  onStartNodeEditing: (groupId: string, nodeId: string, nodeName: string) => void;
  onNodeNameSubmit: () => void;
  onNodeNameKeyDown: (e: React.KeyboardEvent) => void;
  onNodeNameChange: (value: string) => void;
  onConfirmDeleteNode: (groupId: string, nodeId: string) => void;
}

interface NodeItemProps {
  node: NodeSummary;
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
  const { isCompiled, isLoading } = useNodeCompilationStatus(node, activeCategory);

  useEffect(() => {
    if (editingState.isEditing && editNodeInputRef.current) {
      editNodeInputRef.current.focus();
      editNodeInputRef.current.select();
    }
  }, [editingState.isEditing]);

  const isNodeAlreadyOnCanvas = (sidebarNode: NodeSummary): boolean => {
    if (!sidebarNode.solo) return false;
    
    return nodes.some(canvasNode => {
      const nodeData = canvasNode.data as ScriptingNodeData;
      return nodeData.solo && nodeData.nodeId === sidebarNode.id;
    });
  };

  // A node is disabled if:
  // 1. It's already on canvas and is solo, OR
  // 2. It's a complex node that hasn't been compiled
  const isOnCanvas = isNodeAlreadyOnCanvas(node);
  const isUncompiled = activeCategory === 'Complex' && !isCompiled && !isLoading;
  const isDisabled = isOnCanvas || isUncompiled;

  return (
    <div
      key={node.id}
      className={`${styles.node} ${isDisabled ? styles.disabled : ''}`}
      draggable={!isDisabled && !editingState.isEditing}
      onDragStart={(event) => {
        console.log('Node drag start:', node.name);
        !editingState.isEditing && handlers.onDragStart(event, node, groupId);
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
      {!isDisabled && !editingState.isEditing && (
        <div className={styles.nodeDragIndicator} title="Drag to canvas">
          ⋮
        </div>
      )}
      {activeCategory === 'Complex' && !isOnCanvas && (
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
              handlers.onNodeClick(node, groupId);
            }}
            title="Load node"
          >
            ✎
          </button>
        </div>
      )}
    </div>
  );
};

export default NodeItem;