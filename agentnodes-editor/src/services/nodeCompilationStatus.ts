import { NodeSummary, Category } from '../types/project';

/**
 * Service to check compilation status of complex nodes
 */
export class NodeCompilationStatusService {
  private compilationCache = new Map<string, boolean>();

  /**
   * Check if a complex node has been compiled by verifying the presence of compiled.json
   */
  async isNodeCompiled(node: NodeSummary, activeCategory: Category): Promise<boolean> {
    // Only complex nodes need compilation checking
    if (activeCategory !== 'Complex') {
      return true; // Atomic nodes are always considered "compiled"
    }

    // Check cache first
    const cacheKey = `${node.path}/${node.id}`;
    if (this.compilationCache.has(cacheKey)) {
      const cached = this.compilationCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      // Check if compiled.json exists
      const compiledFilePath = `./node-definitions/${node.path}/compiled.json`;
      console.log("testing ", compiledFilePath);
      if (window.electronAPI?.getStats) {
        try {
          await window.electronAPI.getStats(compiledFilePath);
          this.compilationCache.set(cacheKey, true);
          return true;
        } catch {
          // File doesn't exist
          this.compilationCache.set(cacheKey, false);
          return false;
        }
      } else {
        // Fallback: assume compiled if we can't check file system
        // In a real implementation, you might want to make an HTTP request
        console.warn('Cannot check compilation status: Electron API not available');
        this.compilationCache.set(cacheKey, true);
        return true;
      }
    } catch (error) {
      console.error(`Failed to check compilation status for node ${node.id}:`, error);
      // Default to not compiled on error
      this.compilationCache.set(cacheKey, false);
      return false;
    }
  }

  /**
   * Clear the compilation cache (useful when nodes are compiled/recompiled)
   */
  clearCache(): void {
    this.compilationCache.clear();
  }

  /**
   * Clear cache for a specific node
   */
  clearNodeCache(node: NodeSummary): void {
    const cacheKey = `${node.path}/${node.id}`;
    this.compilationCache.delete(cacheKey);
  }

  /**
   * Mark a node as compiled and update cache
   */
  markNodeAsCompiled(node: NodeSummary): void {
    const cacheKey = `${node.path}/${node.id}`;
    this.compilationCache.set(cacheKey, true);
  }
}

export const nodeCompilationStatusService = new NodeCompilationStatusService();