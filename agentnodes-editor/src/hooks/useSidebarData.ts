import { useState, useEffect, useCallback, useRef } from 'react';
import { NodeGroup, Category } from "../types/project";
import { nodeFileSystem } from '../services/nodeFileSystem';

// Simple event emitter for forcing sidebar refresh
class SidebarRefreshEmitter {
  private listeners: (() => void)[] = [];
  
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  emit() {
    this.listeners.forEach(listener => listener());
  }
}

export const sidebarRefreshEmitter = new SidebarRefreshEmitter();

// Simple event emitter for forcing canvas refresh when dependencies change
class CanvasRefreshEmitter {
  private listeners: (() => void)[] = [];
  
  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
  
  emit() {
    this.listeners.forEach(listener => listener());
  }
}

export const canvasRefreshEmitter = new CanvasRefreshEmitter();

export const useSidebarData = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  const [complexGroups, setComplexGroups] = useState<NodeGroup[]>([]);
  const [atomicGroups, setAtomicGroups] = useState<NodeGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs for debouncing filesystem operations
  const complexSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const atomicSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const loadNodeGroups = useCallback(async () => {
    console.log('Sidebar refreshing - loading node groups...');
    try {
      const { complex, atomic } = await nodeFileSystem.loadNodeGroups();
      console.log('Loaded groups:', { complex, atomic });
      setComplexGroups(complex);
      setAtomicGroups(atomic);
    } catch (error) {
      console.error('Error loading node groups:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadNodeGroups();
  }, [loadNodeGroups]);

  // Subscribe to refresh events
  useEffect(() => {
    const unsubscribe = sidebarRefreshEmitter.subscribe(() => {
      console.log('Sidebar refresh event received, reloading groups...');
      loadNodeGroups();
    });
    return unsubscribe;
  }, [loadNodeGroups]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (complexSaveTimeoutRef.current) {
        clearTimeout(complexSaveTimeoutRef.current);
      }
      if (atomicSaveTimeoutRef.current) {
        clearTimeout(atomicSaveTimeoutRef.current);
      }
    };
  }, []);
  
  const handleComplexGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    // Update UI immediately (optimistic update)
    setComplexGroups(groups);
    
    // Debounce filesystem operations to prevent flicker
    if (complexSaveTimeoutRef.current) {
      clearTimeout(complexSaveTimeoutRef.current);
    }
    
    complexSaveTimeoutRef.current = setTimeout(async () => {
      try {
        for (const group of groups) {
          await nodeFileSystem.saveNodeGroup(group, 'Complex');
        }
      } catch (error) {
        console.error('Error saving complex groups:', error);
      }
    }, 300); // 300ms debounce
  }, []);

  const handleAtomicGroupsChange = useCallback(async (groups: NodeGroup[]) => {
    // Update UI immediately (optimistic update)
    setAtomicGroups(groups);
    
    // Debounce filesystem operations to prevent flicker
    if (atomicSaveTimeoutRef.current) {
      clearTimeout(atomicSaveTimeoutRef.current);
    }
    
    atomicSaveTimeoutRef.current = setTimeout(async () => {
      try {
        for (const group of groups) {
          await nodeFileSystem.saveNodeGroup(group, 'Atomic');
        }
      } catch (error) {
        console.error('Error saving atomic groups:', error);
      }
    }, 300); // 300ms debounce
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
    refreshGroups: loadNodeGroups,
  };
};

export default useSidebarData;