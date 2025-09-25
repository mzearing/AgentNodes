import React, { useState, useEffect, useCallback } from 'react';
import { Node } from '@xyflow/react';
import styles from './Sidebar.module.css';
import { SidebarNode, NodeGroup, Category } from './types';
import CategoryTabs from './CategoryTabs/CategoryTabs';
import NodeGroups from './NodeGroups/NodeGroups';
import ContextMenu from '../shared/ContextMenu';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import { 
  useClickOutside, 
  useGroupManagement, 
  useNodeManagement, 
  useContextMenu, 
  useConfirmDialog, 
  useDragAndDrop 
} from '../../hooks';
import { nodeFileSystem } from '../../services/nodeFileSystem';


interface SidebarProps {
  nodes: Node[];
}

const Sidebar: React.FC<SidebarProps> = ({ nodes }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  const [complexGroups, setComplexGroups] = useState<NodeGroup[]>([]);
  const [atomicGroups, setAtomicGroups] = useState<NodeGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const loadNodeGroups = async () => {
      try {
        const { complex, atomic } = await nodeFileSystem.loadNodeGroups();
        setComplexGroups(complex);
        setAtomicGroups(atomic);
      } catch (error) {
        console.error('Error loading node groups:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNodeGroups();
  }, []);
  
  const handleComplexGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    setComplexGroups(groups);
    // Persist changes to file system
    for (const group of groups) {
      await nodeFileSystem.saveNodeGroup(group, 'Complex');
    }
  }, []);

  const handleAtomicGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    setAtomicGroups(groups);
    // Persist changes to file system
    for (const group of groups) {
      await nodeFileSystem.saveNodeGroup(group, 'Atomic');
    }
  }, []);

  const groupManagement = useGroupManagement(
    activeCategory === 'Complex' ? complexGroups : atomicGroups,
    {
      onGroupsChange: activeCategory === 'Complex' ? handleComplexGroupsChange : handleAtomicGroupsChange,
      category: activeCategory
    }
  );
  const nodeManagement = useNodeManagement();
  const contextMenuState = useContextMenu();
  const confirmDialogState = useConfirmDialog();
  const dragAndDrop = useDragAndDrop();

  const handleNodeClick = (node: SidebarNode) => {
    console.log('Node clicked:', node);
  };


  const onDragStart = (event: React.DragEvent, node: SidebarNode) => {
    const dragData = {
      nodeId: node.id,
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs,
      solo: node.solo
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };


  useClickOutside(() => {
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  });

  const getCurrentGroups = (): NodeGroup[] => {
    return activeCategory === 'Complex' ? groupManagement.groups : atomicGroups;
  };

  const handleGroupDoubleClick = (groupId: string, groupName: string) => {
    if (activeCategory === 'Complex') {
      groupManagement.startGroupEditing(groupId, groupName);
    }
  };

  const handleGroupRightClick = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    if (activeCategory === 'Complex') {
      contextMenuState.showContextMenu(e.clientX, e.clientY, groupId);
    }
  };

  const handleGroupNameSubmit = () => {
    groupManagement.submitGroupName();
  };

  const handleGroupNameCancel = () => {
    groupManagement.cancelGroupEditing();
  };

  const handleGroupNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGroupNameSubmit();
    } else if (e.key === 'Escape') {
      handleGroupNameCancel();
    }
  };

  const createNewGroup = () => {
    groupManagement.createGroup();
    contextMenuState.hideContextMenu();
  };

  const deleteGroup = async (groupId: string) => {
    groupManagement.deleteGroup(groupId);
    await nodeFileSystem.deleteNodeGroup(groupId, activeCategory);
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  };

  const confirmDeleteGroup = (groupId: string) => {
    confirmDialogState.showConfirmDialog('group', groupId);
    contextMenuState.hideContextMenu();
  };

  const renameGroup = (groupId: string) => {
    const group = groupManagement.groups.find(g => g.id === groupId);
    if (group) {
      groupManagement.startGroupEditing(groupId, group.name);
    }
    contextMenuState.hideContextMenu();
  };

  // Group drag and drop handlers
  const handleGroupDragStart = (e: React.DragEvent, index: number) => {
    if (activeCategory === 'Complex') {
      dragAndDrop.handleDragStart(e, index);
    }
  };

  const handleGroupDragOver = (e: React.DragEvent, index: number) => {
    dragAndDrop.handleDragOver(e, index);
  };

  const handleGroupDragLeave = () => {
    dragAndDrop.handleDragLeave();
  };

  const handleGroupDrop = (e: React.DragEvent, dropIndex: number) => {
    dragAndDrop.handleDrop(e, dropIndex, groupManagement.reorderGroups);
  };

  const handleGroupDragEnd = () => {
    dragAndDrop.handleDragEnd();
  };

  // Node editing handlers
  const startNodeEditing = (groupId: string, nodeId: string, nodeName: string) => {
    nodeManagement.startNodeEditing(groupId, nodeId, nodeName);
  };

  const handleNodeNameSubmit = () => {
    if (nodeManagement.editingNode && nodeManagement.editingNodeName.trim()) {
      groupManagement.updateNodeName(
        nodeManagement.editingNode.groupId,
        nodeManagement.editingNode.nodeId,
        nodeManagement.editingNodeName
      );
    }
    nodeManagement.cancelNodeEditing();
  };

  const handleNodeNameCancel = () => {
    nodeManagement.cancelNodeEditing();
  };

  const handleNodeNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNodeNameSubmit();
    } else if (e.key === 'Escape') {
      handleNodeNameCancel();
    }
  };

  const addNewNode = (groupId: string) => {
    const newNode = groupManagement.addNode(groupId);
    nodeManagement.startNodeEditing(groupId, newNode.id, newNode.name);
  };

  const deleteNode = async (groupId: string, nodeId: string) => {
    groupManagement.deleteNode(groupId, nodeId);
    await nodeFileSystem.deleteNode(groupId, nodeId, activeCategory);
    confirmDialogState.hideConfirmDialog();
  };

  const confirmDeleteNode = (groupId: string, nodeId: string) => {
    confirmDialogState.showConfirmDialog('node', groupId, nodeId);
  };

  if (isLoading) {
    return (
      <div className={styles.sidebar}>
        <div className={styles.sidebarContent}>
          <div style={{ padding: '20px', textAlign: 'center' }}>
            Loading nodes...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <CategoryTabs 
          activeCategory={activeCategory} 
          onCategoryChange={setActiveCategory}
        />
        <NodeGroups
          groups={getCurrentGroups()}
          nodes={nodes}
          activeCategory={activeCategory}
          expandedGroups={groupManagement.expandedGroups}
          editingGroup={groupManagement.editingGroup}
          editingGroupName={groupManagement.editingGroupName}
          editingNode={nodeManagement.editingNode}
          editingNodeName={nodeManagement.editingNodeName}
          draggedGroupIndex={dragAndDrop.draggedGroupIndex}
          dragOverGroupIndex={dragAndDrop.dragOverGroupIndex}
          onToggleGroup={groupManagement.toggleGroup}
          onGroupDoubleClick={handleGroupDoubleClick}
          onGroupRightClick={handleGroupRightClick}
          onGroupNameSubmit={handleGroupNameSubmit}
          onGroupNameCancel={handleGroupNameCancel}
          onGroupNameKeyDown={handleGroupNameKeyDown}
          onGroupNameChange={groupManagement.setEditingGroupName}
          onNodeClick={handleNodeClick}
          onDragStart={onDragStart}
          onStartNodeEditing={startNodeEditing}
          onNodeNameSubmit={handleNodeNameSubmit}
          onNodeNameCancel={handleNodeNameCancel}
          onNodeNameKeyDown={handleNodeNameKeyDown}
          onNodeNameChange={nodeManagement.setEditingNodeName}
          onAddNewNode={addNewNode}
          onConfirmDeleteNode={confirmDeleteNode}
          onGroupDragStart={handleGroupDragStart}
          onGroupDragEnd={handleGroupDragEnd}
          onGroupDragOver={handleGroupDragOver}
          onGroupDragLeave={handleGroupDragLeave}
          onGroupDrop={handleGroupDrop}
          onCreateNewGroup={createNewGroup}
        />
      </div>
      <ContextMenu
        x={contextMenuState.contextMenu?.x || 0}
        y={contextMenuState.contextMenu?.y || 0}
        isOpen={!!contextMenuState.contextMenu}
        onClose={contextMenuState.hideContextMenu}
        actions={contextMenuState.contextMenu ? [
          {
            label: 'Rename',
            onClick: () => renameGroup(contextMenuState.contextMenu?.groupId || '')
          },
          {
            label: 'Delete',
            onClick: () => confirmDeleteGroup(contextMenuState.contextMenu?.groupId || ''),
            variant: 'danger' as const,
            separator: true
          }
        ] : []}
      />
      <ConfirmationDialog
        isOpen={!!confirmDialogState.confirmDialog}
        title="Confirm Delete"
        message={confirmDialogState.confirmDialog?.type === 'group' 
          ? 'Are you sure you want to delete this group? All nodes in this group will also be deleted.'
          : 'Are you sure you want to delete this node?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmDialogState.confirmDialog?.type === 'group') {
            deleteGroup(confirmDialogState.confirmDialog.groupId);
          } else if (confirmDialogState.confirmDialog?.nodeId) {
            deleteNode(confirmDialogState.confirmDialog.groupId, confirmDialogState.confirmDialog.nodeId);
          }
        }}
        onCancel={confirmDialogState.hideConfirmDialog}
      />
    </div>
  );
};

export default Sidebar;