import { NodeGroup, Category } from '../components/Sidebar/types';

declare global {
  interface Window {
    electronAPI: {
      nodeFileSystem: {
        readNodeGroups: (nodesPath: string) => Promise<{ complex: NodeGroup[]; atomic: NodeGroup[] }>;
        readNodeGroup: (groupPath: string) => Promise<NodeGroup | null>;
        writeNodeGroup: (groupPath: string, group: NodeGroup) => Promise<void>;
        deleteNodeGroup: (groupPath: string) => Promise<void>;
        createNodesDirectory: (nodesPath: string) => Promise<void>;
      };
    };
  }
}

export class NodeFileSystemService {
  private nodesPath: string;

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

  
}

export const nodeFileSystem = new NodeFileSystemService();