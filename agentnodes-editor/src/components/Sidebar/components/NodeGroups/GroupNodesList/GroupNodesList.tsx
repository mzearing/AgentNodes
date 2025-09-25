import React from 'react';
import { Node } from '@xyflow/react';
import styles from '../NodeGroups.module.css';
import { SidebarNode, Category } from '../../../types';
import NodeItem from '../NodeItem/NodeItem';

interface NodeEditingConfig {
  editingNode: { groupId: string; nodeId: string } | null;
  editingNodeName: string;
}

interface NodeHandlers {
  onNodeClick: (node: SidebarNode) => void;
  onDragStart: (event: React.DragEvent, node: SidebarNode) => void;
  onStartNodeEditing: (groupId: string, nodeId: string, nodeName: string) => void;
  onNodeNameSubmit: () => void;
  onNodeNameKeyDown: (e: React.KeyboardEvent) => void;
  onNodeNameChange: (value: string) => void;
  onConfirmDeleteNode: (groupId: string, nodeId: string) => void;
  onAddNewNode: (groupId: string) => void;
}

interface GroupNodesListProps {
  groupId: string;
  nodes: SidebarNode[];
  canvasNodes: Node[];
  activeCategory: Category;
  editingConfig: NodeEditingConfig;
  handlers: NodeHandlers;
}

const GroupNodesList: React.FC<GroupNodesListProps> = ({
  groupId,
  nodes,
  canvasNodes,
  activeCategory,
  editingConfig,
  handlers,
}) => {
  return (
    <div className={styles.groupNodes}>
      {nodes.map(node => {
        const isEditingThisNode = editingConfig.editingNode?.groupId === groupId && editingConfig.editingNode?.nodeId === node.id;
        return (
          <NodeItem
            key={node.id}
            node={node}
            groupId={groupId}
            nodes={canvasNodes}
            activeCategory={activeCategory}
            editingState={{
              isEditing: isEditingThisNode,
              editingNodeName: editingConfig.editingNodeName
            }}
            handlers={{
              onNodeClick: handlers.onNodeClick,
              onDragStart: handlers.onDragStart,
              onStartNodeEditing: handlers.onStartNodeEditing,
              onNodeNameSubmit: handlers.onNodeNameSubmit,
              onNodeNameKeyDown: handlers.onNodeNameKeyDown,
              onNodeNameChange: handlers.onNodeNameChange,
              onConfirmDeleteNode: handlers.onConfirmDeleteNode
            }}
          />
        );
      })}
      {activeCategory === 'Complex' && (
        <div className={styles.addNodeBox}>
          <button
            className={styles.addNodeButton}
            onClick={() => handlers.onAddNewNode(groupId)}
            title="Add new node"
          >
            <span className={styles.addNodeIcon}>+</span>
            Add Node
          </button>
        </div>
      )}
    </div>
  );
};

export default GroupNodesList;