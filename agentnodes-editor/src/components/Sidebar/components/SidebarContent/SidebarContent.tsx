import React from 'react';
import { Node } from '@xyflow/react';
import { Category, NodeGroup, Variable, IOType } from '../../../../types/project';
import CategoryTabs from '../CategoryTabs/CategoryTabs';
import NodeGroups from '../NodeGroups/NodeGroups';
import VariableTabs from '../VariableTabs/VariableTabs';

interface SidebarContentData {
  isLoading: boolean;
  activeCategory: Category;
  getCurrentGroups: () => NodeGroup[];
  nodes: Node[];
  variables: Variable[];
}

interface SidebarContentManagement {
  groupManagement: ReturnType<typeof import('../../../../hooks').useGroupManagement>;
  nodeManagement: ReturnType<typeof import('../../../../hooks').useNodeManagement>;
  variableManagement: ReturnType<typeof import('../../../../hooks/useVariableManagement').useVariableManagement>;
  dragAndDrop: ReturnType<typeof import('../../../../hooks').useDragAndDrop>;
}

interface SidebarContentHandlers {
  onCategoryChange: (category: Category) => void;
  sidebarHandlers: ReturnType<typeof import('../../../../hooks/useSidebarHandlers').useSidebarHandlers>;
  nodeHandlers: ReturnType<typeof import('../../../../hooks/useSidebarNodeHandlers').useSidebarNodeHandlers>;
  dragHandlers: ReturnType<typeof import('../../../../hooks/useSidebarDragHandlers').useSidebarDragHandlers>;
  onVariableDragStart: (e: React.DragEvent, variable: Variable, nodeType: 'get' | 'set') => void;
}

interface SidebarContentProps {
  data: SidebarContentData;
  management: SidebarContentManagement;
  handlers: SidebarContentHandlers;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  data,
  management,
  handlers,
}) => {
  if (data.isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        Loading nodes...
      </div>
    );
  }

  return (
    <>
      <CategoryTabs 
        activeCategory={data.activeCategory} 
        onCategoryChange={handlers.onCategoryChange}
      />
      <NodeGroups
        groupsData={{
          groups: data.getCurrentGroups(),
          nodes: data.nodes,
          activeCategory: data.activeCategory,
          expandedGroups: management.groupManagement.expandedGroups,
          editingGroup: management.groupManagement.editingGroup,
          editingGroupName: management.groupManagement.editingGroupName
        }}
        nodeEditingData={{
          editingNode: management.nodeManagement.editingNode,
          editingNodeName: management.nodeManagement.editingNodeName
        }}
        dragData={{
          draggedGroupIndex: management.dragAndDrop.draggedGroupIndex,
          dragOverGroupIndex: management.dragAndDrop.dragOverGroupIndex
        }}
        handlers={{
          onToggleGroup: management.groupManagement.toggleGroup,
          onGroupDoubleClick: handlers.sidebarHandlers.handleGroupDoubleClick,
          onGroupRightClick: handlers.sidebarHandlers.handleGroupRightClick,
          onGroupNameSubmit: handlers.sidebarHandlers.handleGroupNameSubmit,
          onGroupNameCancel: handlers.sidebarHandlers.handleGroupNameCancel,
          onGroupNameKeyDown: handlers.sidebarHandlers.handleGroupNameKeyDown,
          onGroupNameChange: management.groupManagement.setEditingGroupName,
          onNodeClick: handlers.sidebarHandlers.handleNodeClick,
          onDragStart: handlers.sidebarHandlers.onDragStart,
          onStartNodeEditing: handlers.nodeHandlers.startNodeEditing,
          onNodeNameSubmit: handlers.nodeHandlers.handleNodeNameSubmit,
          onNodeNameCancel: handlers.nodeHandlers.handleNodeNameCancel,
          onNodeNameKeyDown: handlers.nodeHandlers.handleNodeNameKeyDown,
          onNodeNameChange: management.nodeManagement.setEditingNodeName,
          onAddNewNode: handlers.nodeHandlers.addNewNode,
          onConfirmDeleteNode: handlers.nodeHandlers.confirmDeleteNode,
          onGroupDragStart: handlers.dragHandlers.handleGroupDragStart,
          onGroupDragEnd: handlers.dragHandlers.handleGroupDragEnd,
          onGroupDragOver: handlers.dragHandlers.handleGroupDragOver,
          onGroupDragLeave: handlers.dragHandlers.handleGroupDragLeave,
          onGroupDrop: handlers.dragHandlers.handleGroupDrop,
          onCreateNewGroup: handlers.sidebarHandlers.createNewGroup
        }}
      />
      <VariableTabs
        variables={data.variables}
        editingVariable={management.variableManagement.editingVariable}
        editingVariableName={management.variableManagement.editingVariableName}
        onStartEditing={management.variableManagement.startEditingVariable}
        onFinishEditing={management.variableManagement.finishEditingVariable}
        onCancelEditing={management.variableManagement.cancelEditingVariable}
        onNameChange={management.variableManagement.setEditingVariableName}
        onNameKeyDown={() => {
          // Key handling is done in VariablesList component
        }}
        onTypeChange={(id: string, type: IOType) => management.variableManagement.updateVariable(id, { type })}
        onDelete={management.variableManagement.deleteVariable}
        onAddVariable={management.variableManagement.addVariable}
        onDragStart={handlers.onVariableDragStart}
      />
    </>
  );
};

export default SidebarContent;