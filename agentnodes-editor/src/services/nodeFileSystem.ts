import { NodeGroup, Category } from '../components/Sidebar/types';

declare global {
  interface Window {
    electronAPI: {
      readFile: (filePath: string) => Promise<string>;
      getStats: (filePath: string) => Promise<{ size: number; mtime: Date }>;
      nodeFileSystem: {
        readNodeGroups: (nodesPath: string) => Promise<{ complex: NodeGroup[]; atomic: NodeGroup[] }>;
        readNodeGroup: (groupPath: string) => Promise<NodeGroup | null>;
        writeNodeGroup: (groupPath: string, group: NodeGroup) => Promise<void>;
        deleteNodeGroup: (groupPath: string) => Promise<void>;
        createNodesDirectory: (nodesPath: string) => Promise<void>;
        deleteNode: (groupPath: string, nodeId: string) => Promise<void>;
      };
    };
  }
}

export class NodeFileSystemService {
  private nodesPath: string;
  private nodeFileTimestamps: Map<string, number> = new Map();

  constructor(nodesPath = './node-definitions') {
    this.nodesPath = nodesPath;
  }
  
  async loadNodeGroups(): Promise<{ complex: NodeGroup[]; atomic: NodeGroup[] }> {
    console.log('loadNodeGroups called');
    console.log('window.electronAPI available:', !!window.electronAPI);
    console.log('window.electronAPI.nodeFileSystem available:', !!window.electronAPI?.nodeFileSystem);
    
    try {
      if (window.electronAPI?.nodeFileSystem) {
        console.log('Loading node groups from path:', this.nodesPath);
        await window.electronAPI.nodeFileSystem.createNodesDirectory(this.nodesPath);
        const result = await window.electronAPI.nodeFileSystem.readNodeGroups(this.nodesPath);
        console.log('Loaded node groups:', result);
        return result;
      } else {
        console.log('electronAPI.nodeFileSystem not available');
      }
    } catch (error) {
      console.warn('Failed to load from file system.', error);
    }
    
    console.log('Returning empty node groups');
    return { complex: [], atomic: [] };
  }

  async saveNodeGroup(group: NodeGroup, category: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.nodeFileSystem) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${group.id}`;
        
        await window.electronAPI.nodeFileSystem.createNodesDirectory(this.nodesPath);
        await window.electronAPI.nodeFileSystem.writeNodeGroup(groupPath, group);
        
        return true;
      }
    } catch (error) {
      console.error('Failed to save node group to file system:', error);
    }
    
    console.log('Saving node group:', group.name, 'Category:', category);
    return false;
  }

  async deleteNodeGroup(groupId: string, category?: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.nodeFileSystem && category) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${groupId}`;
        
        await window.electronAPI.nodeFileSystem.deleteNodeGroup(groupPath);
        return true;
      }
    } catch (error) {
      console.error('Failed to delete node group from file system:', error);
    }
    
    console.log('Deleting node group:', groupId);
    return false;
  }

  async deleteNode(groupId: string, nodeId: string, category: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.nodeFileSystem) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${groupId}`;
        
        await window.electronAPI.nodeFileSystem.deleteNode(groupPath, nodeId);
        return true;
      }
    } catch (error) {
      console.error('Failed to delete node from file system:', error);
    }
    
    console.log('Deleting node:', nodeId, 'from group:', groupId);
    return false;
  }

  async checkNodeFileChanged(nodeId: string, groupId: string, category: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.getStats) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const nodeFilePath = `${this.nodesPath}/${categoryPath}/${groupId}/${nodeId}/node.json`;
        
        const stats = await window.electronAPI.getStats(nodeFilePath);
        const lastModified = new Date(stats.mtime).getTime();
        
        const nodeKey = `${category}/${groupId}/${nodeId}`;
        const cachedTimestamp = this.nodeFileTimestamps.get(nodeKey);
        
        if (!cachedTimestamp || lastModified !== cachedTimestamp) {
          this.nodeFileTimestamps.set(nodeKey, lastModified);
          return true;
        }
        
        return false;
      }
    } catch (error) {
      console.warn('Failed to check node file timestamp:', error);
    }
    
    return false;
  }

  async getFreshNodeData(nodeId: string, groupId: string, category: Category): Promise<{ inputs: string[]; outputs: string[]; variadicInputs?: boolean; variadicOutputs?: boolean; solo?: boolean } | null> {
    try {
      if (window.electronAPI?.readFile) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const nodeFilePath = `${this.nodesPath}/${categoryPath}/${groupId}/${nodeId}/node.json`;
        
        const nodeData = await window.electronAPI.readFile(nodeFilePath);
        const node = JSON.parse(nodeData);
        
        return {
          inputs: node.inputs || [],
          outputs: node.outputs || [],
          variadicInputs: node.variadicInputs,
          variadicOutputs: node.variadicOutputs,
          solo: node.solo
        };
      }
    } catch (error) {
      console.warn('Failed to get fresh node data:', error);
    }
    
    return null;
  }
}

export const nodeFileSystem = new NodeFileSystemService();