import React, { useState } from 'react';
import { Node } from '@xyflow/react';
import styles from './Sidebar.module.css';
import { SidebarNode, NodeGroup, Category } from './types';
import CategoryTabs from './CategoryTabs/CategoryTabs';
import NodeGroups from './NodeGroups/NodeGroups';
import ContextMenu from '../shared/ContextMenu';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import { 
  useClickOutside, 
  useGroupManagement, 
  useNodeManagement, 
  useContextMenu, 
  useConfirmDialog, 
  useDragAndDrop 
} from '../../hooks';

const complexGroups: NodeGroup[] = [
  {
    id: 'automation',
    name: 'Automation',
    color: '#63b3ed',
    nodes: [
      { id: 'script', name: 'Script', inputs:['A','B','C','D','E','F','G'], outputs:['A','B']},
      { id: 'workflow', name: 'Workflow', inputs:['Input','Config'], outputs:['Result','Status']},
    ]
  },
  {
    id: 'ai-models',
    name: 'AI Models',
    color: '#68d391',
    nodes: [
      { id: 'llm', name: 'Language Model', inputs:['Prompt','Context'], outputs:['Response']},
      { id: 'vision', name: 'Vision Model', inputs:['Image','Query'], outputs:['Analysis']},
    ]
  }
];

const atomicGroups: NodeGroup[] = [
  {
    id: 'control',
    name: 'Control Flow',
    color: '#f6ad55',
    nodes: [
      { id: 'start', name: 'Start', inputs:[], outputs:['Output'], variadicInputs: false, variadicOutputs: true, solo: true},
      { id: 'finish', name: 'Finish', inputs:['Input'], outputs:[], variadicInputs: true, variadicOutputs: false, solo: true},
    ]
  },
  {
    id: 'processing',
    name: 'Data Processing',
    color: '#fc8181',
    nodes: [
      { id: 'script2', name: 'Other Script', inputs:['A','B'], outputs:['A','B','C']},
      { id: 'transform', name: 'Transform', inputs:['Data'], outputs:['Output']},
    ]
  },
  {
    id: 'utilities',
    name: 'Utilities',
    color: '#a78bfa',
    nodes: [
      { id: 'logger', name: 'Logger', inputs:['Message','Level'], outputs:['Log']},
      { id: 'delay', name: 'Delay', inputs:['Input','Duration'], outputs:['Output']},
    ]
  }
];

interface SidebarProps {
  nodes: Node[];
}

const Sidebar: React.FC<SidebarProps> = ({ nodes }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  
  const groupManagement = useGroupManagement(complexGroups);
  const nodeManagement = useNodeManagement();
  const contextMenuState = useContextMenu();
  const confirmDialogState = useConfirmDialog();
  const dragAndDrop = useDragAndDrop();

  const handleNodeClick = (node: SidebarNode) => {
    console.log('Node clicked:', node);
  };


  const onDragStart = (event: React.DragEvent, node: SidebarNode) => {
    const dragData = {
      nodeId: node.id,
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs,
      solo: node.solo
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };


  useClickOutside(() => {
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  });

  const getCurrentGroups = (): NodeGroup[] => {
    return activeCategory === 'Complex' ? groupManagement.groups : atomicGroups;
  };

  const handleGroupDoubleClick = (groupId: string, groupName: string) => {
    if (activeCategory === 'Complex') {
      groupManagement.startGroupEditing(groupId, groupName);
    }
  };

  const handleGroupRightClick = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    if (activeCategory === 'Complex') {
      contextMenuState.showContextMenu(e.clientX, e.clientY, groupId);
    }
  };

  const handleGroupNameSubmit = () => {
    groupManagement.submitGroupName();
  };

  const handleGroupNameCancel = () => {
    groupManagement.cancelGroupEditing();
  };

  const handleGroupNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGroupNameSubmit();
    } else if (e.key === 'Escape') {
      handleGroupNameCancel();
    }
  };

  const createNewGroup = () => {
    groupManagement.createGroup();
    contextMenuState.hideContextMenu();
  };

  const deleteGroup = (groupId: string) => {
    groupManagement.deleteGroup(groupId);
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  };

  const confirmDeleteGroup = (groupId: string) => {
    confirmDialogState.showConfirmDialog('group', groupId);
    contextMenuState.hideContextMenu();
  };

  const renameGroup = (groupId: string) => {
    const group = groupManagement.groups.find(g => g.id === groupId);
    if (group) {
      groupManagement.startGroupEditing(groupId, group.name);
    }
    contextMenuState.hideContextMenu();
  };

  // Group drag and drop handlers
  const handleGroupDragStart = (e: React.DragEvent, index: number) => {
    if (activeCategory === 'Complex') {
      dragAndDrop.handleDragStart(e, index);
    }
  };

  const handleGroupDragOver = (e: React.DragEvent, index: number) => {
    dragAndDrop.handleDragOver(e, index);
  };

  const handleGroupDragLeave = () => {
    dragAndDrop.handleDragLeave();
  };

  const handleGroupDrop = (e: React.DragEvent, dropIndex: number) => {
    dragAndDrop.handleDrop(e, dropIndex, groupManagement.reorderGroups);
  };

  const handleGroupDragEnd = () => {
    dragAndDrop.handleDragEnd();
  };

  // Node editing handlers
  const startNodeEditing = (groupId: string, nodeId: string, nodeName: string) => {
    nodeManagement.startNodeEditing(groupId, nodeId, nodeName);
  };

  const handleNodeNameSubmit = () => {
    if (nodeManagement.editingNode && nodeManagement.editingNodeName.trim()) {
      groupManagement.updateNodeName(
        nodeManagement.editingNode.groupId,
        nodeManagement.editingNode.nodeId,
        nodeManagement.editingNodeName
      );
    }
    nodeManagement.cancelNodeEditing();
  };

  const handleNodeNameCancel = () => {
    nodeManagement.cancelNodeEditing();
  };

  const handleNodeNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNodeNameSubmit();
    } else if (e.key === 'Escape') {
      handleNodeNameCancel();
    }
  };

  const addNewNode = (groupId: string) => {
    const newNode = groupManagement.addNode(groupId);
    nodeManagement.startNodeEditing(groupId, newNode.id, newNode.name);
  };

  const deleteNode = (groupId: string, nodeId: string) => {
    groupManagement.deleteNode(groupId, nodeId);
    confirmDialogState.hideConfirmDialog();
  };

  const confirmDeleteNode = (groupId: string, nodeId: string) => {
    confirmDialogState.showConfirmDialog('node', groupId, nodeId);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <CategoryTabs 
          activeCategory={activeCategory} 
          onCategoryChange={setActiveCategory}
        />
        <NodeGroups
          groups={getCurrentGroups()}
          nodes={nodes}
          activeCategory={activeCategory}
          expandedGroups={groupManagement.expandedGroups}
          editingGroup={groupManagement.editingGroup}
          editingGroupName={groupManagement.editingGroupName}
          editingNode={nodeManagement.editingNode}
          editingNodeName={nodeManagement.editingNodeName}
          draggedGroupIndex={dragAndDrop.draggedGroupIndex}
          dragOverGroupIndex={dragAndDrop.dragOverGroupIndex}
          onToggleGroup={groupManagement.toggleGroup}
          onGroupDoubleClick={handleGroupDoubleClick}
          onGroupRightClick={handleGroupRightClick}
          onGroupNameSubmit={handleGroupNameSubmit}
          onGroupNameCancel={handleGroupNameCancel}
          onGroupNameKeyDown={handleGroupNameKeyDown}
          onGroupNameChange={groupManagement.setEditingGroupName}
          onNodeClick={handleNodeClick}
          onDragStart={onDragStart}
          onStartNodeEditing={startNodeEditing}
          onNodeNameSubmit={handleNodeNameSubmit}
          onNodeNameCancel={handleNodeNameCancel}
          onNodeNameKeyDown={handleNodeNameKeyDown}
          onNodeNameChange={nodeManagement.setEditingNodeName}
          onAddNewNode={addNewNode}
          onConfirmDeleteNode={confirmDeleteNode}
          onGroupDragStart={handleGroupDragStart}
          onGroupDragEnd={handleGroupDragEnd}
          onGroupDragOver={handleGroupDragOver}
          onGroupDragLeave={handleGroupDragLeave}
          onGroupDrop={handleGroupDrop}
          onCreateNewGroup={createNewGroup}
        />
      </div>
      <ContextMenu
        x={contextMenuState.contextMenu?.x || 0}
        y={contextMenuState.contextMenu?.y || 0}
        isOpen={!!contextMenuState.contextMenu}
        onClose={contextMenuState.hideContextMenu}
        actions={contextMenuState.contextMenu ? [
          {
            label: 'Rename',
            onClick: () => renameGroup(contextMenuState.contextMenu?.groupId || '')
          },
          {
            label: 'Delete',
            onClick: () => confirmDeleteGroup(contextMenuState.contextMenu?.groupId || ''),
            variant: 'danger' as const,
            separator: true
          }
        ] : []}
      />
      <ConfirmationDialog
        isOpen={!!confirmDialogState.confirmDialog}
        title="Confirm Delete"
        message={confirmDialogState.confirmDialog?.type === 'group' 
          ? 'Are you sure you want to delete this group? All nodes in this group will also be deleted.'
          : 'Are you sure you want to delete this node?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (confirmDialogState.confirmDialog?.type === 'group') {
            deleteGroup(confirmDialogState.confirmDialog.groupId);
          } else if (confirmDialogState.confirmDialog?.nodeId) {
            deleteNode(confirmDialogState.confirmDialog.groupId, confirmDialogState.confirmDialog.nodeId);
          }
        }}
        onCancel={confirmDialogState.hideConfirmDialog}
      />
    </div>
  );
};

export default Sidebar;