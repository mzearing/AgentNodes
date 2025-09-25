import { useCallback } from 'react';
import { Category } from '../components/Sidebar/types';

interface SidebarDragHandlersProps {
  activeCategory: Category;
  dragAndDrop: ReturnType<typeof import('../hooks').useDragAndDrop>;
  groupManagement: ReturnType<typeof import('../hooks').useGroupManagement>;
}

export const useSidebarDragHandlers = ({
  activeCategory,
  dragAndDrop,
  groupManagement,
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

  const handleGroupDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    dragAndDrop.handleDrop(e, dropIndex, groupManagement.reorderGroups);
  }, [dragAndDrop, groupManagement]);

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