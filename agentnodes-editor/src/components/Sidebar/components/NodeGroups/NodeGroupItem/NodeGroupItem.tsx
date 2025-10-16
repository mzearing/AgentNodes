import React from 'react';
import { Node } from '@xyflow/react';
import styles from '../NodeGroups.module.css';
import { SidebarNode, NodeGroup, Category } from '../../../types';
import GroupHeader from '../GroupHeader/GroupHeader';
import GroupNodesList from '../GroupNodesList/GroupNodesList';

interface NodeGroupItemProps {
  group: NodeGroup;
  index: number;
  nodes: Node[];
  activeCategory: Category;
  isExpanded: boolean;
  isEditing: boolean;
  editingGroupName: string;
  editingNode: { groupId: string; nodeId: string } | null;
  editingNodeName: string;
  draggedGroupIndex: number | null;
  dragOverGroupIndex: number | null;
  onToggleGroup: (groupId: string) => void;
  onGroupDoubleClick: (groupId: string, groupName: string) => void;
  onGroupRightClick: (e: React.MouseEvent, groupId: string) => void;
  onGroupNameSubmit: () => void;
  onGroupNameKeyDown: (e: React.KeyboardEvent) => void;
  onGroupNameChange: (value: string) => void;
  onNodeClick: (node: SidebarNode, groupId: string) => void;
  onDragStart: (event: React.DragEvent, node: SidebarNode, groupId: string) => void;
  onStartNodeEditing: (groupId: string, nodeId: string, nodeName: string) => void;
  onNodeNameSubmit: () => void;
  onNodeNameKeyDown: (e: React.KeyboardEvent) => void;
  onNodeNameChange: (value: string) => void;
  onAddNewNode: (groupId: string) => void;
  onConfirmDeleteNode: (groupId: string, nodeId: string) => void;
  onGroupDragStart: (e: React.DragEvent, index: number) => void;
  onGroupDragEnd: () => void;
  onGroupDragOver: (e: React.DragEvent, index: number) => void;
  onGroupDragLeave: () => void;
  onGroupDrop: (e: React.DragEvent, index: number) => void;
}

const NodeGroupItem: React.FC<NodeGroupItemProps> = ({
  group,
  index,
  nodes,
  activeCategory,
  isExpanded,
  isEditing,
  editingGroupName,
  editingNode,
  editingNodeName,
  draggedGroupIndex,
  dragOverGroupIndex,
  onToggleGroup,
  onGroupDoubleClick,
  onGroupRightClick,
  onGroupNameSubmit,
  onGroupNameKeyDown,
  onGroupNameChange,
  onNodeClick,
  onDragStart,
  onStartNodeEditing,
  onNodeNameSubmit,
  onNodeNameKeyDown,
  onNodeNameChange,
  onAddNewNode,
  onConfirmDeleteNode,
  onGroupDragStart,
  onGroupDragEnd,
  onGroupDragOver,
  onGroupDragLeave,
  onGroupDrop,
}) => {
  return (
    <div 
      key={group.id} 
      className={`${styles.group} ${draggedGroupIndex === index ? styles.groupDragging : ''} ${dragOverGroupIndex === index ? styles.groupDragOver : ''}`}
      draggable={activeCategory === 'Complex'}
      onDragStart={(e) => onGroupDragStart(e, index)}
      onDragEnd={onGroupDragEnd}
      onDragOver={(e) => onGroupDragOver(e, index)}
      onDragLeave={onGroupDragLeave}
      onDrop={(e) => onGroupDrop(e, index)}
    >
      <GroupHeader
        group={group}
        isExpanded={isExpanded}
        isEditing={isEditing}
        editingGroupName={editingGroupName}
        onToggleGroup={onToggleGroup}
        onGroupDoubleClick={onGroupDoubleClick}
        onGroupRightClick={onGroupRightClick}
        onGroupNameSubmit={onGroupNameSubmit}
        onGroupNameKeyDown={onGroupNameKeyDown}
        onGroupNameChange={onGroupNameChange}
      />
      {isExpanded && (
        <GroupNodesList
          groupId={group.id}
          nodes={group.nodes}
          canvasNodes={nodes}
          activeCategory={activeCategory}
          editingConfig={{
            editingNode,
            editingNodeName
          }}
          handlers={{
            onNodeClick,
            onDragStart,
            onStartNodeEditing,
            onNodeNameSubmit,
            onNodeNameKeyDown,
            onNodeNameChange,
            onConfirmDeleteNode,
            onAddNewNode
          }}
        />
      )}
    </div>
  );
};

export default NodeGroupItem;