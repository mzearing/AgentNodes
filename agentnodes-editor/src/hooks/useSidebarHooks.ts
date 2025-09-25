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

interface UseSidebarHooksProps {
  activeCategory: Category;
  getCurrentGroups: () => NodeGroup[];
  handleComplexGroupsChange: (groups: NodeGroup[]) => Promise<void>;
  handleAtomicGroupsChange: (groups: NodeGroup[]) => Promise<void>;
}

export const useSidebarHooks = ({
  activeCategory,
  getCurrentGroups,
  handleComplexGroupsChange,
  handleAtomicGroupsChange,
}: UseSidebarHooksProps) => {
  const groupManagement = useGroupManagement(
    getCurrentGroups(),
    {
      onGroupsChange: activeCategory === 'Complex' ? handleComplexGroupsChange : handleAtomicGroupsChange,
      category: activeCategory
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