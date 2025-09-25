import { useState, useEffect, useCallback } from 'react';
import { NodeGroup, Category } from '../components/Sidebar/types';
import { nodeFileSystem } from '../services/nodeFileSystem';

export const useSidebarData = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  const [complexGroups, setComplexGroups] = useState<NodeGroup[]>([]);
  const [atomicGroups, setAtomicGroups] = useState<NodeGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    const loadNodeGroups = async () => {
      try {
        const { complex, atomic } = await nodeFileSystem.loadNodeGroups();
        setComplexGroups(complex);
        setAtomicGroups(atomic);
      } catch (error) {
        console.error('Error loading node groups:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadNodeGroups();
  }, []);
  
  const handleComplexGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    setComplexGroups(groups);
    // Persist changes to file system
    for (const group of groups) {
      await nodeFileSystem.saveNodeGroup(group, 'Complex');
    }
  }, []);

  const handleAtomicGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    setAtomicGroups(groups);
    // Persist changes to file system
    for (const group of groups) {
      await nodeFileSystem.saveNodeGroup(group, 'Atomic');
    }
  }, []);

  const getCurrentGroups = useCallback((): NodeGroup[] => {
    return activeCategory === 'Complex' ? complexGroups : atomicGroups;
  }, [activeCategory, complexGroups, atomicGroups]);

  return {
    activeCategory,
    setActiveCategory,
    complexGroups,
    atomicGroups,
    isLoading,
    handleComplexGroupsChange,
    handleAtomicGroupsChange,
    getCurrentGroups,
  };
};

export default useSidebarData;