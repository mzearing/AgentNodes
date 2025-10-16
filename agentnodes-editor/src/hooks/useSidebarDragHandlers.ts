import { useCallback } from 'react';
import { Category } from '../components/Sidebar/types';

interface SidebarDragHandlersProps {
  activeCategory: Category;
  dragAndDrop: ReturnType<typeof import('../hooks').useDragAndDrop>;
  groupManagement: ReturnType<typeof import('../hooks').useGroupManagement>;
  refreshGroups: () => Promise<void>;
}

export const useSidebarDragHandlers = ({
  activeCategory,
  dragAndDrop,
  groupManagement,
  refreshGroups,
}: SidebarDragHandlersProps) => {
  const handleGroupDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (activeCategory === 'Complex') {
      dragAndDrop.handleDragStart(e, index);
    }
  }, [activeCategory, dragAndDrop]);

  const handleGroupDragOver = useCallback((e: React.DragEvent, index: number) => {
    dragAndDrop.handleDragOver(e, index);
  }, [dragAndDrop]);

  const handleGroupDragLeave = useCallback(() => {
    dragAndDrop.handleDragLeave();
  }, [dragAndDrop]);

  const handleNodeMove = useCallback(async (nodeData: { nodeId: string; groupId: string }, targetGroupIndex: number) => {
    if (activeCategory !== 'Complex') {
      return;
    }

    const { nodeId, groupId: sourceGroupId } = nodeData;
    const targetGroup = groupManagement.groups[targetGroupIndex];
    
    if (!targetGroup || !sourceGroupId || !nodeId) {
      return;
    }

    // Move the node in the UI and sync filesystem
    await groupManagement.moveNodeBetweenGroups(sourceGroupId, nodeId, targetGroupIndex);
    
    // Refresh groups from filesystem to reflect the true state
    await refreshGroups();
    
    console.log(`Moved node ${nodeId} from group ${sourceGroupId} to group ${targetGroup.id}`);
  }, [activeCategory, groupManagement, refreshGroups]);

  const handleGroupDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    dragAndDrop.handleDrop(e, dropIndex, groupManagement.reorderGroups, handleNodeMove);
  }, [dragAndDrop, groupManagement, handleNodeMove]);

  const handleGroupDragEnd = useCallback(() => {
    dragAndDrop.handleDragEnd();
  }, [dragAndDrop]);

  return {
    handleGroupDragStart,
    handleGroupDragOver,
    handleGroupDragLeave,
    handleGroupDrop,
    handleGroupDragEnd,
  };
};

export default useSidebarDragHandlers;