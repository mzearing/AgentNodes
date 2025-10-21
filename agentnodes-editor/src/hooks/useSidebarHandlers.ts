import React, { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { SidebarNode, Category } from '../components/Sidebar/types';
import { nodeFileSystem } from '../services/nodeFileSystem';
import { ProjectState, NodeMetadata } from '../types/project';

interface SidebarHandlersProps {
  activeCategory: Category;
  groupManagement: ReturnType<typeof import('../hooks').useGroupManagement>;
  nodeManagement: ReturnType<typeof import('../hooks').useNodeManagement>;
  contextMenuState: ReturnType<typeof import('../hooks').useContextMenu>;
  confirmDialogState: ReturnType<typeof import('../hooks').useConfirmDialog>;
  onLoadProject: (projectState: ProjectState) => void;
}

export const useSidebarHandlers = ({
  activeCategory,
  groupManagement,
  nodeManagement: _nodeManagement,
  contextMenuState,
  confirmDialogState,
  onLoadProject,
}: SidebarHandlersProps) => {
  const handleNodeClick = useCallback(async (node: SidebarNode, groupId: string) => {
    console.log('Node clicked:', node);
    
    if (activeCategory === 'Complex') {
      try {
        const nodeData = await nodeFileSystem.readNode(groupId, node.id, activeCategory);
        
        // Create default canvas state if no data exists
        const defaultCanvasState = {
          nodes: [] as Node[],
          edges: [] as Edge[],
          viewport: { x: 0, y: 0, zoom: 1 }
        };
        
        let canvasState = defaultCanvasState;
        let nodeName = node.name;
        
        if (nodeData) {
          const metadata = nodeData as unknown as NodeMetadata;
          nodeName = metadata.name || node.name;
          
          // Use existing canvas state if it exists and is valid
          if (metadata.data && metadata.data.nodes && metadata.data.edges) {
            canvasState = metadata.data;
          }
        }
        
        const projectState: ProjectState = {
          hasNodeLoaded: true,
          openedNodeName: nodeName,
          openedNodeId: node.id,
          openedNodePath: `${activeCategory.toLowerCase()}/${groupId}`,
          canvasStateCache: canvasState
        };
        onLoadProject(projectState);
      } catch (error) {
        console.error('Failed to load node:', error);
      }
    }
  }, [activeCategory, onLoadProject]);

  const onDragStart = useCallback((event: React.DragEvent, node: SidebarNode, groupId: string) => {
    const dragData = {
      nodeId: node.id,
      groupId: groupId,
      category: activeCategory,
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs,
      solo: node.solo
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  }, [activeCategory]);

  const handleGroupDoubleClick = useCallback(async (groupId: string, groupName: string) => {
    if (activeCategory === 'Complex') {
      try {
        const group = groupManagement.groups.find(g => g.id === groupId);
        if (group && group.nodes.length > 0) {
          const canvasNode = group.nodes.find(node => 'canvasState' in node);
          if (canvasNode && 'canvasState' in canvasNode) {
            const projectState = (canvasNode as any).canvasState as ProjectState;
            onLoadProject(projectState);
            return;
          }
        }
      } catch (error) {
        console.error('Failed to load project from group:', error);
      }
      
      groupManagement.startGroupEditing(groupId, groupName);
    }
  }, [activeCategory, groupManagement, onLoadProject]);

  const handleGroupRightClick = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    if (activeCategory === 'Complex') {
      contextMenuState.showContextMenu(e.clientX, e.clientY, groupId);
    }
  }, [activeCategory, contextMenuState]);

  const handleGroupNameSubmit = useCallback(async () => {
    await groupManagement.submitGroupName();
  }, [groupManagement]);

  const handleGroupNameCancel = useCallback(() => {
    groupManagement.cancelGroupEditing();
  }, [groupManagement]);

  const handleGroupNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGroupNameSubmit();
    } else if (e.key === 'Escape') {
      handleGroupNameCancel();
    }
  }, [handleGroupNameSubmit, handleGroupNameCancel]);

  const createNewGroup = useCallback(async () => {
    await groupManagement.createGroup();
    contextMenuState.hideContextMenu();
  }, [groupManagement, contextMenuState]);

  const deleteGroup = useCallback(async (groupId: string) => {
    await groupManagement.deleteGroup(groupId);
    await nodeFileSystem.deleteNodeGroup(groupId, activeCategory);
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  }, [groupManagement, activeCategory, contextMenuState, confirmDialogState]);

  const confirmDeleteGroup = useCallback((groupId: string) => {
    confirmDialogState.showConfirmDialog('group', groupId);
    contextMenuState.hideContextMenu();
  }, [confirmDialogState, contextMenuState]);

  const renameGroup = useCallback((groupId: string) => {
    const group = groupManagement.groups.find(g => g.id === groupId);
    if (group) {
      groupManagement.startGroupEditing(groupId, group.name);
    }
    contextMenuState.hideContextMenu();
  }, [groupManagement, contextMenuState]);

  return {
    handleNodeClick,
    onDragStart,
    handleGroupDoubleClick,
    handleGroupRightClick,
    handleGroupNameSubmit,
    handleGroupNameCancel,
    handleGroupNameKeyDown,
    createNewGroup,
    deleteGroup,
    confirmDeleteGroup,
    renameGroup,
  };
};

// This is not a component, just a hook, so we don't need a default export
export default useSidebarHandlers;