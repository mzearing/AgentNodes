import { useState, useCallback, useEffect } from 'react';
import { NodeGroup, NodeSummary, Category } from '../types/project';
import { nodeFileSystem } from '../services/nodeFileSystem';

interface GroupManagementOptions {
  onGroupsChange?: (groups: NodeGroup[]) => void;
  category?: Category;
  refreshGroups?: () => Promise<void>;
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

  const submitGroupName = useCallback(async () => {
    if (editingGroup && editingGroupName.trim()) {
      const newGroups = groups.map(group => 
        group.id === editingGroup 
          ? { ...group, name: editingGroupName.trim() }
          : group
      );
      updateGroups(newGroups);
      // Refresh sidebar to show updated group name
      if (options.refreshGroups) {
        await options.refreshGroups();
      }
    }
    setEditingGroup(null);
    setEditingGroupName('');
  }, [editingGroup, editingGroupName, groups, updateGroups, options.refreshGroups]);

  const cancelGroupEditing = useCallback(() => {
    setEditingGroup(null);
    setEditingGroupName('');
  }, []);

  const createGroup = useCallback(async () => {
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

  const deleteGroup = useCallback(async (groupId: string) => {
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

  const addNode = useCallback(async (groupId: string) => {
    const newNode: NodeSummary = {
      id: `node-${Date.now()}`,
      name: 'New Node',
      inputs: ['Input'],
      outputs: ['Output'],
      variadicOutputs: false,
      variadicInputs: false,
      solo: false,
      path: ''
    };
    
    const newGroups = groups.map(group =>
      group.id === groupId
        ? { ...group, nodes: [...group.nodes, newNode] }
        : group
    );
    updateGroups(newGroups);
    
    return newNode;
  }, [groups, updateGroups]);

  const updateNodeName = useCallback(async (groupId: string, nodeId: string, newName: string) => {
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
    // Refresh sidebar to show updated node name
    if (options.refreshGroups) {
      await options.refreshGroups();
    }
  }, [groups, updateGroups, options.refreshGroups]);

  const deleteNode = useCallback(async (groupId: string, nodeId: string) => {
    const newGroups = groups.map(group =>
      group.id === groupId
        ? { ...group, nodes: group.nodes.filter(node => node.id !== nodeId) }
        : group
    );
    updateGroups(newGroups);
  }, [groups, updateGroups]);

  const moveNodeBetweenGroups = useCallback(async (sourceGroupId: string, nodeId: string, targetGroupIndex: number) => {
    if (targetGroupIndex < 0 || targetGroupIndex >= groups.length) {
      return;
    }

    const targetGroup = groups[targetGroupIndex];
    if (!targetGroup || targetGroup.id === sourceGroupId) {
      return;
    }

    let nodeToMove: NodeSummary | null = null;
    
    const newGroups = groups.map((group, index) => {
      if (group.id === sourceGroupId) {
        // Remove node from source group
        const filteredNodes = group.nodes.filter(node => {
          if (node.id === nodeId) {
            nodeToMove = node;
            return false;
          }
          return true;
        });
        return { ...group, nodes: filteredNodes };
      } else if (index === targetGroupIndex && nodeToMove) {
        // Add node to target group
        return { ...group, nodes: [...group.nodes, nodeToMove] };
      }
      return group;
    });

    if (nodeToMove) {
      // Update in-memory state first
      updateGroups(newGroups);
      
      // Sync filesystem if category is available
      if (options.category) {
        try {
          await nodeFileSystem.moveNodeBetweenGroups(nodeId, sourceGroupId, targetGroup.id, options.category);
        } catch (error) {
          console.error('Failed to sync node move to filesystem:', error);
          // Note: We could revert the in-memory state here if desired
        }
      }
    }
  }, [groups, updateGroups, options.category]);

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
    deleteNode,
    moveNodeBetweenGroups
  };
};