import React from 'react';
import { Node } from '@xyflow/react';
import styles from './NodeGroups.module.css';
import { NodeGroup, Category, SidebarNode } from '../../types';
import NodeGroupItem from './NodeGroupItem/NodeGroupItem';
import AddGroupButton from './AddGroupButton/AddGroupButton';

interface NodeGroupsData {
  groups: NodeGroup[];
  nodes: Node[];
  activeCategory: Category;
  expandedGroups: Set<string>;
  editingGroup: string | null;
  editingGroupName: string;
}

interface NodeEditingData {
  editingNode: { groupId: string; nodeId: string } | null;
  editingNodeName: string;
}

interface DragData {
  draggedGroupIndex: number | null;
  dragOverGroupIndex: number | null;
}

interface NodeGroupsHandlers {
  onToggleGroup: (groupId: string) => void;
  onGroupDoubleClick: (groupId: string, groupName: string) => void;
  onGroupRightClick: (e: React.MouseEvent, groupId: string) => void;
  onGroupNameSubmit: () => void;
  onGroupNameCancel: () => void;
  onGroupNameKeyDown: (e: React.KeyboardEvent) => void;
  onGroupNameChange: (value: string) => void;
  onNodeClick: (node: SidebarNode) => void;
  onDragStart: (event: React.DragEvent, node: SidebarNode) => void;
  onStartNodeEditing: (groupId: string, nodeId: string, nodeName: string) => void;
  onNodeNameSubmit: () => void;
  onNodeNameCancel: () => void;
  onNodeNameKeyDown: (e: React.KeyboardEvent) => void;
  onNodeNameChange: (value: string) => void;
  onAddNewNode: (groupId: string) => void;
  onConfirmDeleteNode: (groupId: string, nodeId: string) => void;
  onGroupDragStart: (e: React.DragEvent, index: number) => void;
  onGroupDragEnd: () => void;
  onGroupDragOver: (e: React.DragEvent, index: number) => void;
  onGroupDragLeave: () => void;
  onGroupDrop: (e: React.DragEvent, index: number) => void;
  onCreateNewGroup: () => void;
}

interface NodeGroupsProps {
  groupsData: NodeGroupsData;
  nodeEditingData: NodeEditingData;
  dragData: DragData;
  handlers: NodeGroupsHandlers;
}

const NodeGroups: React.FC<NodeGroupsProps> = ({
  groupsData,
  nodeEditingData,
  dragData,
  handlers,
}) => {
  const { groups, nodes, activeCategory, expandedGroups, editingGroup, editingGroupName } = groupsData;
  const { editingNode, editingNodeName } = nodeEditingData;
  const { draggedGroupIndex, dragOverGroupIndex } = dragData;
  const {
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
    onCreateNewGroup,
  } = handlers;

  return (
    <div className={styles.nodeList}>
      {groups.map((group, index) => (
        <NodeGroupItem
          key={group.id}
          group={group}
          index={index}
          nodes={nodes}
          activeCategory={activeCategory}
          isExpanded={expandedGroups.has(group.id)}
          isEditing={editingGroup === group.id}
          editingGroupName={editingGroupName}
          editingNode={editingNode}
          editingNodeName={editingNodeName}
          draggedGroupIndex={draggedGroupIndex}
          dragOverGroupIndex={dragOverGroupIndex}
          onToggleGroup={onToggleGroup}
          onGroupDoubleClick={onGroupDoubleClick}
          onGroupRightClick={onGroupRightClick}
          onGroupNameSubmit={onGroupNameSubmit}
          onGroupNameKeyDown={onGroupNameKeyDown}
          onGroupNameChange={onGroupNameChange}
          onNodeClick={onNodeClick}
          onDragStart={onDragStart}
          onStartNodeEditing={onStartNodeEditing}
          onNodeNameSubmit={onNodeNameSubmit}
          onNodeNameKeyDown={onNodeNameKeyDown}
          onNodeNameChange={onNodeNameChange}
          onAddNewNode={onAddNewNode}
          onConfirmDeleteNode={onConfirmDeleteNode}
          onGroupDragStart={onGroupDragStart}
          onGroupDragEnd={onGroupDragEnd}
          onGroupDragOver={onGroupDragOver}
          onGroupDragLeave={onGroupDragLeave}
          onGroupDrop={onGroupDrop}
        />
      ))}
      {activeCategory === 'Complex' && (
        <AddGroupButton onClick={onCreateNewGroup} />
      )}
    </div>
  );
};

export default NodeGroups;