import { 
  useClickOutside, 
  useGroupManagement, 
  useNodeManagement, 
  useContextMenu, 
  useConfirmDialog, 
  useDragAndDrop 
} from '.';
import { useSidebarHandlers } from './useSidebarHandlers';
import { useSidebarNodeHandlers } from './useSidebarNodeHandlers';
import { useSidebarDragHandlers } from './useSidebarDragHandlers';
import { Category, NodeGroup } from '../components/Sidebar/types';
import { ProjectState } from '../types/project';

interface UseSidebarHooksProps {
  activeCategory: Category;
  getCurrentGroups: () => NodeGroup[];
  handleComplexGroupsChange: (groups: NodeGroup[]) => Promise<void>;
  handleAtomicGroupsChange: (groups: NodeGroup[]) => Promise<void>;
  refreshGroups: () => Promise<void>;
  onLoadProject: (projectState: ProjectState) => void;
}

export const useSidebarHooks = ({
  activeCategory,
  getCurrentGroups,
  handleComplexGroupsChange,
  handleAtomicGroupsChange,
  refreshGroups,
  onLoadProject,
}: UseSidebarHooksProps) => {
  const groupManagement = useGroupManagement(
    getCurrentGroups(),
    {
      onGroupsChange: activeCategory === 'Complex' ? handleComplexGroupsChange : handleAtomicGroupsChange,
      category: activeCategory,
      refreshGroups
    }
  );
  const nodeManagement = useNodeManagement();
  const contextMenuState = useContextMenu();
  const confirmDialogState = useConfirmDialog();
  const dragAndDrop = useDragAndDrop();

  const sidebarHandlers = useSidebarHandlers({
    activeCategory,
    groupManagement,
    nodeManagement,
    contextMenuState,
    confirmDialogState,
    onLoadProject,
  });

  const nodeHandlers = useSidebarNodeHandlers({
    activeCategory,
    nodeManagement,
    groupManagement,
    confirmDialogState,
  });

  const dragHandlers = useSidebarDragHandlers({
    activeCategory,
    dragAndDrop,
    groupManagement,
    refreshGroups,
  });

  useClickOutside(() => {
    contextMenuState.hideContextMenu();
    confirmDialogState.hideConfirmDialog();
  });

  return {
    groupManagement,
    nodeManagement,
    contextMenuState,
    confirmDialogState,
    dragAndDrop,
    sidebarHandlers,
    nodeHandlers,
    dragHandlers,
  };
};

export default useSidebarHooks;