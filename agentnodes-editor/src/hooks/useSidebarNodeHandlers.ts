import { useCallback } from 'react';
import { Category } from '../components/Sidebar/types';
import { nodeFileSystem } from '../services/nodeFileSystem';

interface SidebarNodeHandlersProps {
  activeCategory: Category;
  nodeManagement: ReturnType<typeof import('../hooks').useNodeManagement>;
  groupManagement: ReturnType<typeof import('../hooks').useGroupManagement>;
  confirmDialogState: ReturnType<typeof import('../hooks').useConfirmDialog>;
}

export const useSidebarNodeHandlers = ({
  activeCategory,
  nodeManagement,
  groupManagement,
  confirmDialogState,
}: SidebarNodeHandlersProps) => {
  const startNodeEditing = useCallback((groupId: string, nodeId: string, nodeName: string) => {
    nodeManagement.startNodeEditing(groupId, nodeId, nodeName);
  }, [nodeManagement]);

  const handleNodeNameSubmit = useCallback(() => {
    if (nodeManagement.editingNode && nodeManagement.editingNodeName.trim()) {
      groupManagement.updateNodeName(
        nodeManagement.editingNode.groupId,
        nodeManagement.editingNode.nodeId,
        nodeManagement.editingNodeName
      );
    }
    nodeManagement.cancelNodeEditing();
  }, [nodeManagement, groupManagement]);

  const handleNodeNameCancel = useCallback(() => {
    nodeManagement.cancelNodeEditing();
  }, [nodeManagement]);

  const handleNodeNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNodeNameSubmit();
    } else if (e.key === 'Escape') {
      handleNodeNameCancel();
    }
  }, [handleNodeNameSubmit, handleNodeNameCancel]);

  const addNewNode = useCallback((groupId: string) => {
    const newNode = groupManagement.addNode(groupId);
    nodeManagement.startNodeEditing(groupId, newNode.id, newNode.name);
  }, [groupManagement, nodeManagement]);

  const deleteNode = useCallback(async (groupId: string, nodeId: string) => {
    groupManagement.deleteNode(groupId, nodeId);
    await nodeFileSystem.deleteNode(groupId, nodeId, activeCategory);
    confirmDialogState.hideConfirmDialog();
  }, [groupManagement, activeCategory, confirmDialogState]);

  const confirmDeleteNode = useCallback((groupId: string, nodeId: string) => {
    confirmDialogState.showConfirmDialog('node', groupId, nodeId);
  }, [confirmDialogState]);

  return {
    startNodeEditing,
    handleNodeNameSubmit,
    handleNodeNameCancel,
    handleNodeNameKeyDown,
    addNewNode,
    deleteNode,
    confirmDeleteNode,
  };
};

export default useSidebarNodeHandlers;