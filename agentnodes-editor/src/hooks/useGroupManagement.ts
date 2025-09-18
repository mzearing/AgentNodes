import { useState, useCallback } from 'react';
import { NodeGroup, SidebarNode } from '../components/Sidebar/types';

export const useGroupManagement = (initialGroups: NodeGroup[]) => {
  const [groups, setGroups] = useState<NodeGroup[]>(initialGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const toggleGroup = useCallback((groupId: string) => {
    const newExpandedGroups = new Set(expandedGroups);
    if (newExpandedGroups.has(groupId)) {
      newExpandedGroups.delete(groupId);
    } else {
      newExpandedGroups.add(groupId);
    }
    setExpandedGroups(newExpandedGroups);
  }, [expandedGroups]);

  const startGroupEditing = useCallback((groupId: string, groupName: string) => {
    setEditingGroup(groupId);
    setEditingGroupName(groupName);
  }, []);

  const submitGroupName = useCallback(() => {
    if (editingGroup && editingGroupName.trim()) {
      setGroups(prev => 
        prev.map(group => 
          group.id === editingGroup 
            ? { ...group, name: editingGroupName.trim() }
            : group
        )
      );
    }
    setEditingGroup(null);
    setEditingGroupName('');
  }, [editingGroup, editingGroupName]);

  const cancelGroupEditing = useCallback(() => {
    setEditingGroup(null);
    setEditingGroupName('');
  }, []);

  const createGroup = useCallback(() => {
    const newGroup: NodeGroup = {
      id: `group-${Date.now()}`,
      name: 'New Group',
      color: '#9ca3af',
      nodes: []
    };
    setGroups(prev => [...prev, newGroup]);
    startGroupEditing(newGroup.id, newGroup.name);
  }, [startGroupEditing]);

  const deleteGroup = useCallback((groupId: string) => {
    setGroups(prev => prev.filter(group => group.id !== groupId));
  }, []);

  const reorderGroups = useCallback((dragIndex: number, dropIndex: number) => {
    if (dragIndex !== dropIndex) {
      const newGroups = [...groups];
      const draggedItem = newGroups[dragIndex];
      
      newGroups.splice(dragIndex, 1);
      newGroups.splice(dropIndex, 0, draggedItem);
      
      setGroups(newGroups);
    }
  }, [groups]);

  const addNode = useCallback((groupId: string) => {
    const newNode: SidebarNode = {
      id: `node-${Date.now()}`,
      name: 'New Node',
      inputs: ['Input'],
      outputs: ['Output']
    };
    
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, nodes: [...group.nodes, newNode] }
          : group
      )
    );
    
    return newNode;
  }, []);

  const updateNodeName = useCallback((groupId: string, nodeId: string, newName: string) => {
    setGroups(prev => 
      prev.map(group => 
        group.id === groupId
          ? {
              ...group,
              nodes: group.nodes.map(node =>
                node.id === nodeId
                  ? { ...node, name: newName.trim() }
                  : node
              )
            }
          : group
      )
    );
  }, []);

  const deleteNode = useCallback((groupId: string, nodeId: string) => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, nodes: group.nodes.filter(node => node.id !== nodeId) }
          : group
      )
    );
  }, []);

  return {
    groups,
    expandedGroups,
    editingGroup,
    editingGroupName,
    setEditingGroupName,
    toggleGroup,
    startGroupEditing,
    submitGroupName,
    cancelGroupEditing,
    createGroup,
    deleteGroup,
    reorderGroups,
    addNode,
    updateNodeName,
    deleteNode
  };
};