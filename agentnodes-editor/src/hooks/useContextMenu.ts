import { useState, useCallback } from 'react';

interface ContextMenuState {
  x: number;
  y: number;
  groupId: string;
}

export const useContextMenu = () => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const showContextMenu = useCallback((x: number, y: number, groupId: string) => {
    setContextMenu({ x, y, groupId });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu
  };
};