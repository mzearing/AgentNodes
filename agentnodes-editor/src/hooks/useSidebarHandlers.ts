import React, { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Category, ProjectState, NodeMetadata, NodeSummary } from "../types/project";
import { nodeFileSystem } from '../services/nodeFileSystem';

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
  const handleNodeClick = useCallback(async (node: NodeSummary, groupId: string) => {
    console.log('Node clicked:', node);
    
    const nodeId = node.id
    
    if (!node || !nodeId) {
      console.error('handleNodeClick called with invalid node:', node);
      return;
    }
    
    if (!groupId) {
      console.error('handleNodeClick called with invalid groupId:', groupId);
      return;
    }
    
    if (activeCategory === 'Complex') {
      try {
        // Create default canvas state if no data exists
        const defaultCanvasState = {
          nodes: [] as Node[],
          edges: [] as Edge[],
          viewport: { x: 0, y: 0, zoom: 1 }
        };
        
        let canvasState = defaultCanvasState;
        let nodeName = node.name;
        let nodeMetadata: NodeMetadata | null = null;
        
        // Use the NodeSummary's path to load the actual node file
        if (node.path && node.path.trim() !== '') {
          const nodeFilePath = `node-definitions/${node.path}/node.json`;
          console.log('Loading node from path:', nodeFilePath);
          try {
            // Read the actual node file using the path from NodeSummary
            const nodeFileData = await window.electronAPI.readFile(nodeFilePath);
            console.log('Node file content:', nodeFileData);
            
            if (nodeFileData && nodeFileData.trim() !== '') {
              const parsedData = JSON.parse(nodeFileData);
              console.log('Parsed node data:', parsedData);
              
              // Check if this is the new NodeMetadata format or old summary format
              if (parsedData.summary && parsedData.data) {
                // New NodeMetadata format
                nodeMetadata = parsedData as NodeMetadata;
                console.log('Found NodeMetadata format');
                
                // Update node name from metadata if available
                nodeName = nodeMetadata.summary?.name || nodeName;
                
                // Use the canvas state from the node file
                if (nodeMetadata.data && Array.isArray(nodeMetadata.data.nodes) && Array.isArray(nodeMetadata.data.edges)) {
                  console.log('Using canvas state with', nodeMetadata.data.nodes.length, 'nodes and', nodeMetadata.data.edges.length, 'edges');
                  canvasState = nodeMetadata.data;
                } else {
                  console.log('No valid canvas state in NodeMetadata, using default');
                }
              } else {
                // Old summary format - just the node summary data
                console.log('Found old summary format, using default canvas state');
                nodeName = parsedData.name || nodeName;
                // Keep default canvas state since old format doesn't have canvas data
              }
            } else {
              console.log('Node file is empty, using default canvas state');
            }
          } catch (fileError) {
            console.error('Failed to read node file:', fileError);
            console.log('Using default canvas state due to file read error');
          }
        } else {
          console.log('No path in NodeSummary, using default canvas state');
        }
        
        const projectState: ProjectState = {
          hasNodeLoaded: true,
          openedNodeName: nodeName,
          openedNodeId: nodeId,
          openedNodePath: `${activeCategory.toLowerCase()}/${groupId}`,
          canvasStateCache: canvasState,
          variables: nodeMetadata?.variables || []
        };
        onLoadProject(projectState);
      } catch (error) {
        console.error('Failed to load node:', error);
      }
    }
  }, [activeCategory, onLoadProject]);

  const onDragStart = useCallback((event: React.DragEvent, node: NodeSummary, groupId: string) => {
    console.log('Sidebar drag start handler called:', node.name);
    const dragData = {
      nodeId: node.id,
      groupId: groupId,
      category: activeCategory,
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      inputTypes: node.inputTypes,
      outputTypes: node.outputTypes,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs,
      multitypeInputs: node.multitypeInputs,
      multitypeOutputs: node.multitypeOutputs,
      solo: node.solo,
      constantData: node.constantData
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'copy';
    console.log('Drag data set:', dragData);
  }, [activeCategory]);

  const handleGroupDoubleClick = useCallback(async (groupId: string, groupName: string) => {
    if (activeCategory === 'Complex') {
      try {
        const group = groupManagement.groups.find(g => g.id === groupId);
        if (group && group.nodes.length > 0) {
          const canvasNode = group.nodes.find((node: any) => 'canvasState' in node);
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