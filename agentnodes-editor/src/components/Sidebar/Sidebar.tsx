import React from 'react';
import { Node } from '@xyflow/react';
import styles from './Sidebar.module.css';
import SidebarContent from './components/SidebarContent/SidebarContent';
import SidebarContextMenu from './components/SidebarContextMenu/SidebarContextMenu';
import SidebarConfirmDialog from './components/SidebarConfirmDialog/SidebarConfirmDialog';
import { useSidebarData } from '../../hooks/useSidebarData';
import { useSidebarHooks } from '../../hooks/useSidebarHooks';
import { ProjectState } from '../../types/project';

interface SidebarProps {
  nodes: Node[];
  onLoadProject: (projectState: ProjectState) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ nodes, onLoadProject }) => {
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




  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <SidebarContent
          data={{
            isLoading,
            activeCategory,
            getCurrentGroups,
            nodes
          }}
          management={{
            groupManagement,
            nodeManagement,
            dragAndDrop
          }}
          handlers={{
            onCategoryChange: setActiveCategory,
            sidebarHandlers,
            nodeHandlers,
            dragHandlers
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