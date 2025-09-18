import { useState, useCallback } from 'react';

export const useDragAndDrop = () => {
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [dragOverGroupIndex, setDragOverGroupIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedGroupIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.setData('application/sidebar-group-reorder', 'true');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('application/sidebar-group-reorder')) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverGroupIndex(index);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverGroupIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number, onReorder: (dragIndex: number, dropIndex: number) => void) => {
    e.preventDefault();
    
    if (!e.dataTransfer.types.includes('application/sidebar-group-reorder')) {
      return;
    }
    
    const dragIndex = draggedGroupIndex;
    
    if (dragIndex !== null && dragIndex !== dropIndex) {
      onReorder(dragIndex, dropIndex);
    }
    
    setDraggedGroupIndex(null);
    setDragOverGroupIndex(null);
  }, [draggedGroupIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedGroupIndex(null);
    setDragOverGroupIndex(null);
  }, []);

  return {
    draggedGroupIndex,
    dragOverGroupIndex,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd
  };
};