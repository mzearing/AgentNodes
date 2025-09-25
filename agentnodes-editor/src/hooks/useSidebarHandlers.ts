import React, { useCallback } from 'react';
import { SidebarNode, Category } from '../components/Sidebar/types';
import { nodeFileSystem } from '../services/nodeFileSystem';
interface SidebarHandlersProps {
  activeCategory: Category;
  groupManagement: ReturnType<typeof import('../hooks').useGroupManagement>;
  nodeManagement: ReturnType<typeof import('../hooks').useNodeManagement>;
  contextMenuState: ReturnType<typeof import('../hooks').useContextMenu>;
  confirmDialogState: ReturnType<typeof import('../hooks').useConfirmDialog>;
}

export const useSidebarHandlers = ({
  activeCategory,
  groupManagement,
  nodeManagement: _nodeManagement,
  contextMenuState,
  confirmDialogState,
}: SidebarHandlersProps) => {
  const handleNodeClick = useCallback((node: SidebarNode) => {
    console.log('Node clicked:', node);
  }, []);

  const onDragStart = useCallback((event: React.DragEvent, node: SidebarNode) => {
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
  }, []);

  const handleGroupDoubleClick = useCallback((groupId: string, groupName: string) => {
    if (activeCategory === 'Complex') {
      groupManagement.startGroupEditing(groupId, groupName);
    }
  }, [activeCategory, groupManagement]);

  const handleGroupRightClick = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    if (activeCategory === 'Complex') {
      contextMenuState.showContextMenu(e.clientX, e.clientY, groupId);
    }
  }, [activeCategory, contextMenuState]);

  const handleGroupNameSubmit = useCallback(() => {
    groupManagement.submitGroupName();
  }, [groupManagement]);

  const handleGroupNameCancel = useCallback(() => {
    groupManagement.cancelGroupEditing();
  }, [groupManagement]);

  const handleGroupNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGroupNameSubmit();
    } else if (e.key === 'Escape') {
      handleGroupNameCancel();
    }
  }, [handleGroupNameSubmit, handleGroupNameCancel]);

  const createNewGroup = useCallback(() => {
    groupManagement.createGroup();
    contextMenuState.hideContextMenu();
  }, [groupManagement, contextMenuState]);

  const deleteGroup = useCallback(async (groupId: string) => {
    groupManagement.deleteGroup(groupId);
    await nodeFileSystem.deleteNodeGroup(groupId, activeCategory);
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  }, [groupManagement, activeCategory, contextMenuState, confirmDialogState]);

  const confirmDeleteGroup = useCallback((groupId: string) => {
    confirmDialogState.showConfirmDialog('group', groupId);
    contextMenuState.hideContextMenu();
  }, [confirmDialogState, contextMenuState]);

  const renameGroup = useCallback((groupId: string) => {
    const group = groupManagement.groups.find(g => g.id === groupId);
    if (group) {
      groupManagement.startGroupEditing(groupId, group.name);
    }
    contextMenuState.hideContextMenu();
  }, [groupManagement, contextMenuState]);

  return {
    handleNodeClick,
    onDragStart,
    handleGroupDoubleClick,
    handleGroupRightClick,
    handleGroupNameSubmit,
    handleGroupNameCancel,
    handleGroupNameKeyDown,
    createNewGroup,
    deleteGroup,
    confirmDeleteGroup,
    renameGroup,
  };
};

// This is not a component, just a hook, so we don't need a default export
export default useSidebarHandlers;