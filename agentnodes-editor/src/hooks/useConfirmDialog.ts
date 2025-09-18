import { useState, useCallback } from 'react';

interface ConfirmDialogState {
  type: 'group' | 'node';
  groupId: string;
  nodeId?: string;
}

export const useConfirmDialog = () => {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const showConfirmDialog = useCallback((type: 'group' | 'node', groupId: string, nodeId?: string) => {
    setConfirmDialog({ type, groupId, nodeId });
  }, []);

  const hideConfirmDialog = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  return {
    confirmDialog,
    showConfirmDialog,
    hideConfirmDialog
  };
};