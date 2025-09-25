import React from 'react';
import ConfirmationDialog from '../../../shared/ConfirmationDialog';

interface SidebarConfirmDialogProps {
  confirmDialogState: ReturnType<typeof import('../../../../hooks').useConfirmDialog>;
  onDeleteGroup: (groupId: string) => void;
  onDeleteNode: (groupId: string, nodeId: string) => void;
}

const SidebarConfirmDialog: React.FC<SidebarConfirmDialogProps> = ({
  confirmDialogState,
  onDeleteGroup,
  onDeleteNode,
}) => {
  return (
    <ConfirmationDialog
      isOpen={!!confirmDialogState.confirmDialog}
      config={{
        title: "Confirm Delete",
        message: confirmDialogState.confirmDialog?.type === 'group' 
          ? 'Are you sure you want to delete this group? All nodes in this group will also be deleted.'
          : 'Are you sure you want to delete this node?',
        confirmText: "Delete",
        cancelText: "Cancel",
        variant: "danger"
      }}
      onConfirm={() => {
        if (confirmDialogState.confirmDialog?.type === 'group') {
          onDeleteGroup(confirmDialogState.confirmDialog.groupId);
        } else if (confirmDialogState.confirmDialog?.nodeId) {
          onDeleteNode(confirmDialogState.confirmDialog.groupId, confirmDialogState.confirmDialog.nodeId);
        }
      }}
      onCancel={confirmDialogState.hideConfirmDialog}
    />
  );
};

export default SidebarConfirmDialog;