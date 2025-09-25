import React from 'react';
import ContextMenu from '../../../shared/ContextMenu';

interface SidebarContextMenuProps {
  contextMenuState: ReturnType<typeof import('../../../../hooks').useContextMenu>;
  onRenameGroup: (groupId: string) => void;
  onConfirmDeleteGroup: (groupId: string) => void;
}

const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  contextMenuState,
  onRenameGroup,
  onConfirmDeleteGroup,
}) => {
  return (
    <ContextMenu
      position={{ 
        x: contextMenuState.contextMenu?.x || 0, 
        y: contextMenuState.contextMenu?.y || 0 
      }}
      isOpen={!!contextMenuState.contextMenu}
      onClose={contextMenuState.hideContextMenu}
      actions={contextMenuState.contextMenu ? [
        {
          label: 'Rename',
          onClick: () => onRenameGroup(contextMenuState.contextMenu?.groupId || '')
        },
        {
          label: 'Delete',
          onClick: () => onConfirmDeleteGroup(contextMenuState.contextMenu?.groupId || ''),
          variant: 'danger' as const,
          separator: true
        }
      ] : []}
    />
  );
};

export default SidebarContextMenu;