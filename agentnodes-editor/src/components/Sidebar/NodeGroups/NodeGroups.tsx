import React, { useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from './NodeGroups.module.css';
import { SidebarNode, NodeGroup, Category } from '../types';
import { ScriptingNodeData } from '../../ScriptingNodes/ScriptingNode';

interface NodeGroupsProps {
  groups: NodeGroup[];
  nodes: Node[];
  activeCategory: Category;
  expandedGroups: Set<string>;
  editingGroup: string | null;
  editingGroupName: string;
  editingNode: { groupId: string; nodeId: string } | null;
  editingNodeName: string;
  draggedGroupIndex: number | null;
  dragOverGroupIndex: number | null;
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

const NodeGroups: React.FC<NodeGroupsProps> = ({
  groups,
  nodes,
  activeCategory,
  expandedGroups,
  editingGroup,
  editingGroupName,
  editingNode,
  editingNodeName,
  draggedGroupIndex,
  dragOverGroupIndex,
  onToggleGroup,
  onGroupDoubleClick,
  onGroupRightClick,
  onGroupNameSubmit,
  onGroupNameCancel: _onGroupNameCancel,
  onGroupNameKeyDown,
  onGroupNameChange,
  onNodeClick,
  onDragStart,
  onStartNodeEditing,
  onNodeNameSubmit,
  onNodeNameCancel: _onNodeNameCancel,
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
}) => {
  const editInputRef = useRef<HTMLInputElement>(null);
  const editNodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingGroup && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingGroup]);

  useEffect(() => {
    if (editingNode && editNodeInputRef.current) {
      editNodeInputRef.current.focus();
      editNodeInputRef.current.select();
    }
  }, [editingNode]);

  const isNodeAlreadyOnCanvas = (sidebarNode: SidebarNode): boolean => {
    if (!sidebarNode.solo) return false;
    
    return nodes.some(canvasNode => {
      const nodeData = canvasNode.data as ScriptingNodeData;
      return nodeData.solo && nodeData.nodeId === sidebarNode.id;
    });
  };

  return (
    <div className={styles.nodeList}>
      {groups.map((group, index) => (
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
          <div 
            className={styles.groupHeader}
            onClick={() => onToggleGroup(group.id)}
            onDoubleClick={() => onGroupDoubleClick(group.id, group.name)}
            onContextMenu={(e) => onGroupRightClick(e, group.id)}
            style={{ '--group-color': group.color } as React.CSSProperties}
          >
            <div className={styles.groupIndicator}></div>
            <div className={styles.groupName}>
              {editingGroup === group.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingGroupName}
                  onChange={(e) => onGroupNameChange(e.target.value)}
                  onBlur={onGroupNameSubmit}
                  onKeyDown={onGroupNameKeyDown}
                  className={styles.groupNameInput}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span>{group.name}</span>
              )}
              <div className={`${styles.expandIcon} ${expandedGroups.has(group.id) ? styles.expanded : ''}`}>
                ▼
              </div>
            </div>
          </div>
          {expandedGroups.has(group.id) && (
            <div className={styles.groupNodes}>
              {group.nodes.map(node => {
                const isDisabled = isNodeAlreadyOnCanvas(node);
                const isEditingThisNode = editingNode?.groupId === group.id && editingNode?.nodeId === node.id;
                return (
                  <div
                    key={node.id}
                    className={`${styles.node} ${isDisabled ? styles.disabled : ''}`}
                    onClick={() => !isDisabled && !isEditingThisNode && onNodeClick(node)}
                    role="button"
                    tabIndex={isDisabled ? -1 : 0}
                    draggable={!isDisabled && !isEditingThisNode}
                    onDragStart={(event) => !isEditingThisNode && onDragStart(event, node)}
                    onKeyDown={(e) => {
                      if (!isDisabled && !isEditingThisNode && (e.key === 'Enter' || e.key === ' ')) {
                        onNodeClick(node);
                      }
                    }}
                  >
                    <div className={styles.nodeContent}>
                      {isEditingThisNode ? (
                        <input
                          ref={editNodeInputRef}
                          type="text"
                          value={editingNodeName}
                          onChange={(e) => onNodeNameChange(e.target.value)}
                          onBlur={onNodeNameSubmit}
                          onKeyDown={onNodeNameKeyDown}
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
                            onConfirmDeleteNode(group.id, node.id);
                          }}
                          title="Delete node"
                        >
                          ×
                        </button>
                        <button
                          className={styles.nodeEditButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartNodeEditing(group.id, node.id, node.name);
                          }}
                          title="Edit node"
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {activeCategory === 'Complex' && (
                <div className={styles.addNodeBox}>
                  <button
                    className={styles.addNodeButton}
                    onClick={() => onAddNewNode(group.id)}
                    title="Add new node"
                  >
                    <span className={styles.addNodeIcon}>+</span>
                    Add Node
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {activeCategory === 'Complex' && (
        <button
          className={styles.addGroupButton}
          onClick={onCreateNewGroup}
        >
          <span className={styles.addNodeIcon}>+</span>
          Add Group
        </button>
      )}
    </div>
  );
};

export default NodeGroups;