import { useState, useCallback } from 'react';

export const useNodeManagement = () => {
  const [editingNode, setEditingNode] = useState<{ groupId: string; nodeId: string } | null>(null);
  const [editingNodeName, setEditingNodeName] = useState('');

  const startNodeEditing = useCallback((groupId: string, nodeId: string, nodeName: string) => {
    setEditingNode({ groupId, nodeId });
    setEditingNodeName(nodeName);
  }, []);

  const cancelNodeEditing = useCallback(() => {
    setEditingNode(null);
    setEditingNodeName('');
  }, []);

  return {
    editingNode,
    editingNodeName,
    setEditingNodeName,
    startNodeEditing,
    cancelNodeEditing
  };
};