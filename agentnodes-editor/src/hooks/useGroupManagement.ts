import { useState, useCallback, useEffect } from 'react';
import { NodeGroup, SidebarNode, Category } from '../components/Sidebar/types';

interface GroupManagementOptions {
  onGroupsChange?: (groups: NodeGroup[]) => void;
  category?: Category;
}

export const useGroupManagement = (initialGroups: NodeGroup[], options: GroupManagementOptions = {}) => {
  const [groups, setGroups] = useState<NodeGroup[]>(initialGroups);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const { onGroupsChange } = options;

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const updateGroups = useCallback((newGroups: NodeGroup[]) => {
    setGroups(newGroups);
    onGroupsChange?.(newGroups);
  }, [onGroupsChange]);

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
      const newGroups = groups.map(group => 
        group.id === editingGroup 
          ? { ...group, name: editingGroupName.trim() }
          : group
      );
      updateGroups(newGroups);
    }
    setEditingGroup(null);
    setEditingGroupName('');
  }, [editingGroup, editingGroupName, groups, updateGroups]);

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
    const newGroups = [...groups, newGroup];
    updateGroups(newGroups);
    startGroupEditing(newGroup.id, newGroup.name);
  }, [groups, updateGroups, startGroupEditing]);

  const deleteGroup = useCallback((groupId: string) => {
    const newGroups = groups.filter(group => group.id !== groupId);
    updateGroups(newGroups);
  }, [groups, updateGroups]);

  const reorderGroups = useCallback((dragIndex: number, dropIndex: number) => {
    if (dragIndex !== dropIndex) {
      const newGroups = [...groups];
      const draggedItem = newGroups[dragIndex];
      
      newGroups.splice(dragIndex, 1);
      newGroups.splice(dropIndex, 0, draggedItem);
      
      updateGroups(newGroups);
    }
  }, [groups, updateGroups]);

  const addNode = useCallback((groupId: string) => {
    const newNode: SidebarNode = {
      id: `node-${Date.now()}`,
      name: 'New Node',
      inputs: ['Input'],
      outputs: ['Output']
    };
    
    const newGroups = groups.map(group =>
      group.id === groupId
        ? { ...group, nodes: [...group.nodes, newNode] }
        : group
    );
    updateGroups(newGroups);
    
    return newNode;
  }, [groups, updateGroups]);

  const updateNodeName = useCallback((groupId: string, nodeId: string, newName: string) => {
    const newGroups = groups.map(group => 
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
    );
    updateGroups(newGroups);
  }, [groups, updateGroups]);

  const deleteNode = useCallback((groupId: string, nodeId: string) => {
    const newGroups = groups.map(group =>
      group.id === groupId
        ? { ...group, nodes: group.nodes.filter(node => node.id !== nodeId) }
        : group
    );
    updateGroups(newGroups);
  }, [groups, updateGroups]);

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