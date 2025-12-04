import React, { useEffect, useCallback, useMemo } from 'react';
import { Node } from '@xyflow/react';
import styles from './Sidebar.module.css';
import SidebarContent from './components/SidebarContent/SidebarContent';
import SidebarContextMenu from './components/SidebarContextMenu/SidebarContextMenu';
import SidebarConfirmDialog from './components/SidebarConfirmDialog/SidebarConfirmDialog';
import { useSidebarData } from '../../hooks/useSidebarData';
import { useSidebarHooks } from '../../hooks/useSidebarHooks';
import { useVariableManagement } from '../../hooks/useVariableManagement';
import { useVariableNodeSync } from '../../hooks/useVariableNodeSync';
import { ProjectState, Variable } from '../../types/project';

interface SidebarProps {
  nodes: Node[];
  onLoadProject: (projectState: ProjectState) => void;
  onRefreshFunctionReady?: (refreshFunction: () => void) => void;
  onNodesChange?: (nodes: Node[]) => void;
  projectState?: ProjectState;
  onProjectStateChange?: (projectState: ProjectState) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ nodes, onLoadProject, onRefreshFunctionReady, onNodesChange, projectState, onProjectStateChange }) => {
  const sidebarData = useSidebarData();
  const { 
    activeCategory, 
    setActiveCategory, 
    isLoading, 
    getCurrentGroups, 
    handleComplexGroupsChange, 
    handleAtomicGroupsChange,
    refreshGroups
  } = sidebarData;

  // Variable sync hook for updating canvas nodes
  const noOpFunction = useCallback(() => {
    // No-op function for when onNodesChange is not provided
  }, []);
  const { updateVariableNodes, removeVariableNodes } = useVariableNodeSync(nodes, onNodesChange || noOpFunction);

  // Variable management with sync callbacks and project state
  const onVariableUpdate = useCallback((variables: Variable[]) => {
    // Update project state with new variables
    if (projectState && onProjectStateChange) {
      onProjectStateChange({
        ...projectState,
        variables
      });
    }
    
    // Find which variable was updated and sync canvas nodes
    variables.forEach(variable => {
      updateVariableNodes(variable);
    });
  }, [updateVariableNodes, projectState, onProjectStateChange]);

  // Stabilize variables array to prevent infinite re-renders
  const stableVariables = useMemo(() => projectState?.variables || [], [projectState?.variables]);
  
  const variableManagement = useVariableManagement(stableVariables, {
    onVariablesChange: onVariableUpdate
  });

  // Override delete to remove canvas nodes
  const handleVariableDelete = useCallback((variableId: string) => {
    removeVariableNodes(variableId);
    variableManagement.deleteVariable(variableId);
  }, [removeVariableNodes, variableManagement]);
  
  const {
    groupManagement,
    nodeManagement,
    contextMenuState,
    confirmDialogState,
    dragAndDrop,
    sidebarHandlers,
    nodeHandlers,
    dragHandlers,
  } = useSidebarHooks({
    activeCategory,
    getCurrentGroups,
    handleComplexGroupsChange,
    handleAtomicGroupsChange,
    refreshGroups,
    onLoadProject,
  });

  // Handler for variable drag to canvas
  const handleVariableDragStart = useCallback((e: React.DragEvent, variable: Variable, nodeType: 'get' | 'set') => {
    console.log(`Variable drag started: ${variable.name} ${nodeType}`);
    const dragData = {
      variableId: variable.id,
      variableName: variable.name,
      variableType: variable.type,
      nodeType
    };
    e.dataTransfer.setData('application/variablenode', JSON.stringify(dragData));
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Memoize the refresh function to prevent unnecessary re-renders
  const memoizedRefreshFunction = useCallback(async () => {
    console.log('Sidebar: Refresh function called!');
    return await refreshGroups();
  }, [refreshGroups]);

  // Provide the refresh function to the parent component
  useEffect(() => {
    if (onRefreshFunctionReady) {
      console.log('Sidebar: Setting refresh function...');
      onRefreshFunctionReady(memoizedRefreshFunction);
    }
  }, [onRefreshFunctionReady, memoizedRefreshFunction]);

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <SidebarContent
          data={{
            isLoading,
            activeCategory,
            getCurrentGroups,
            nodes,
            variables: variableManagement.variables
          }}
          management={{
            groupManagement,
            nodeManagement,
            variableManagement: {
              ...variableManagement,
              deleteVariable: handleVariableDelete
            },
            dragAndDrop
          }}
          handlers={{
            onCategoryChange: setActiveCategory,
            sidebarHandlers,
            nodeHandlers,
            dragHandlers,
            onVariableDragStart: handleVariableDragStart
          }}
        />
      </div>
      <SidebarContextMenu
        contextMenuState={contextMenuState}
        onRenameGroup={sidebarHandlers.renameGroup}
        onConfirmDeleteGroup={sidebarHandlers.confirmDeleteGroup}
      />
      <SidebarConfirmDialog
        confirmDialogState={confirmDialogState}
        onDeleteGroup={sidebarHandlers.deleteGroup}
        onDeleteNode={nodeHandlers.deleteNode}
      />
    </div>
  );
};

export default Sidebar;