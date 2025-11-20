import { useState, useEffect } from 'react';
import { NodeSummary, Category } from '../types/project';
import { nodeCompilationStatusService } from '../services/nodeCompilationStatus';

export const useNodeCompilationStatus = (node: NodeSummary, activeCategory: Category) => {
  const [isCompiled, setIsCompiled] = useState(true); // Default to compiled to avoid flickering
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkCompilationStatus = async () => {
      if (activeCategory !== 'Complex') {
        setIsCompiled(true);
        return;
      }

      setIsLoading(true);
      try {
        const compiled = await nodeCompilationStatusService.isNodeCompiled(node, activeCategory);
        setIsCompiled(compiled);
      } catch (error) {
        console.error('Error checking compilation status:', error);
        setIsCompiled(false); // Default to not compiled on error
      } finally {
        setIsLoading(false);
      }
    };

    checkCompilationStatus();
  }, [node.id, node.path, activeCategory]);

  return { isCompiled, isLoading };
};