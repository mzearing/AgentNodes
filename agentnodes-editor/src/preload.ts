import { contextBridge, ipcRenderer } from 'electron';
import * as path from 'path';

interface NodeGroup {
  id: string;
  name: string;
  color: string;
  nodes: SidebarNode[];
}

interface SidebarNode {
  id: string;
  name: string;
  inputs?: string[];
  outputs?: string[];
  solo?: boolean;
}

// File system wrapper using IPC
const fsAsync = {
  readFile: (filePath: string, encoding: BufferEncoding) => 
    ipcRenderer.invoke('fs:readFile', filePath, encoding),
  writeFile: (filePath: string, data: string, encoding: BufferEncoding) => 
    ipcRenderer.invoke('fs:writeFile', filePath, data, encoding),
  readdir: (dirPath: string) => 
    ipcRenderer.invoke('fs:readdir', dirPath),
  access: (filePath: string) => 
    ipcRenderer.invoke('fs:access', filePath),
  stat: (filePath: string) => 
    ipcRenderer.invoke('fs:stat', filePath),
  mkdir: (dirPath: string, options: { recursive: boolean }) => 
    ipcRenderer.invoke('fs:mkdir', dirPath, options),
  rm: (filePath: string, options: { recursive: boolean; force: boolean }) => 
    ipcRenderer.invoke('fs:rm', filePath, options)
};

const readNodeGroupInternal = async (groupPath: string): Promise<NodeGroup | null> => {
  try {
    const groupJsonPath = path.join(groupPath, 'group.json');
    
    try {
      const groupData = await fsAsync.readFile(groupJsonPath, 'utf-8');
      const group = JSON.parse(groupData);
      
      const items = await fsAsync.readdir(groupPath);
      const nodeDirs = [];
      
      for (const item of items) {
        if (item === 'group.json') continue;
        nodeDirs.push(item);
      }
      
      group.nodes = [];
      
      for (const nodeDir of nodeDirs) {
        const nodeDirPath = path.join(groupPath, nodeDir);
        const nodeJsonPath = path.join(nodeDirPath, 'node.json');
        
        try {
          const nodeData = await fsAsync.readFile(nodeJsonPath, 'utf-8');
          const node = JSON.parse(nodeData);
          group.nodes.push(node);
        } catch (error) {
          console.warn(`Failed to read node at ${nodeJsonPath}:`, error);
        }
      }
      
      return group;
    } catch (error) {
      console.warn(`Failed to read group at ${groupPath}:`, error);
      return null;
    }
  } catch (error) {
    throw new Error(`Failed to read node group: ${error}`);
  }
};

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: async (filePath: string): Promise<string> => {
    try {
      const data = await fsAsync.readFile(filePath, 'utf-8');
      return data;
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }
  },

  writeFile: async (filePath: string, content: string): Promise<void> => {
    try {
      await fsAsync.writeFile(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file: ${error}`);
    }
  },

  mkdir: async (dirPath: string): Promise<void> => {
    try {
      await fsAsync.mkdir(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create directory: ${error}`);
    }
  },

  readDir: async (dirPath: string): Promise<string[]> => {
    try {
      const files = await fsAsync.readdir(dirPath);
      return files;
    } catch (error) {
      throw new Error(`Failed to read directory: ${error}`);
    }
  },

  exists: async (filePath: string): Promise<boolean> => {
    return await fsAsync.access(filePath);
  },

  getStats: async (filePath: string): Promise<{ size: number; mtime: Date }> => {
    try {
      const stats = await fsAsync.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime
      };
    } catch (error) {
      throw new Error(`Failed to get file stats: ${error}`);
    }
  },

  nodeFileSystem: {
    readNodeGroups: async (nodesPath: string): Promise<{ complex: NodeGroup[]; atomic: NodeGroup[] }> => {
      try {
        const result: { complex: NodeGroup[]; atomic: NodeGroup[] } = { complex: [], atomic: [] };
        
        for (const category of ['complex', 'atomic'] as const) {
          const categoryPath = path.join(nodesPath, category);
          
          try {
            const groupDirs = await fsAsync.readdir(categoryPath);
            
            for (const groupDir of groupDirs) {
              const groupPath = path.join(categoryPath, groupDir);
              const group = await readNodeGroupInternal(groupPath);
              if (group) {
                result[category].push(group);
              }
            }
          } catch (error) {
            console.warn(`Failed to read ${category} directory:`, error);
          }
        }
        
        return result;
      } catch (error) {
        throw new Error(`Failed to read node groups: ${error}`);
      }
    },

    readNodeGroup: async (groupPath: string): Promise<NodeGroup | null> => {
      return readNodeGroupInternal(groupPath);
    },

    writeNodeGroup: async (groupPath: string, group: NodeGroup): Promise<void> => {
      try {
        await fsAsync.mkdir(groupPath, { recursive: true });
        
        const { nodes, ...groupMeta } = group;
        const groupJsonPath = path.join(groupPath, 'group.json');
        await fsAsync.writeFile(groupJsonPath, JSON.stringify(groupMeta, null, 2), 'utf-8');
        
        if (nodes && Array.isArray(nodes)) {
          for (const node of nodes) {
            const nodeDirPath = path.join(groupPath, node.id);
            await fsAsync.mkdir(nodeDirPath, { recursive: true });
            
            const nodeJsonPath = path.join(nodeDirPath, 'node.json');
            await fsAsync.writeFile(nodeJsonPath, JSON.stringify(node, null, 2), 'utf-8');
          }
        }
      } catch (error) {
        throw new Error(`Failed to write node group: ${error}`);
      }
    },

    deleteNodeGroup: async (groupPath: string): Promise<void> => {
      try {
        await fsAsync.rm(groupPath, { recursive: true, force: true });
      } catch (error) {
        throw new Error(`Failed to delete node group: ${error}`);
      }
    },

    createNodesDirectory: async (nodesPath: string): Promise<void> => {
      try {
        await fsAsync.mkdir(path.join(nodesPath, 'complex'), { recursive: true });
        await fsAsync.mkdir(path.join(nodesPath, 'atomic'), { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create nodes directory: ${error}`);
      }
    },

    deleteNode: async (groupPath: string, nodeId: string): Promise<void> => {
      try {
        const nodePath = path.join(groupPath, nodeId);
        await fsAsync.rm(nodePath, { recursive: true, force: true });
      } catch (error) {
        throw new Error(`Failed to delete node: ${error}`);
      }
    },

    readNode: async (groupPath: string, nodeId: string): Promise<JSON> => {
      try {
        const nodePath = path.join(groupPath, nodeId);
        const nodeJsonPath = path.join(nodePath, 'node.json');
        const nodeData = await fsAsync.readFile(nodeJsonPath, 'utf-8');
        return JSON.parse(nodeData);
      } catch (error) {
        throw new Error(`Failed to read node: ${error}`);
      }
    },

    writeNode: async (groupPath: string, nodeId: string, nodeData: JSON): Promise<void> => {
      try {
        const nodePath = path.join(groupPath, nodeId);
        await fsAsync.mkdir(nodePath, { recursive: true });
        
        const nodeJsonPath = path.join(nodePath, 'node.json');
        await fsAsync.writeFile(nodeJsonPath, JSON.stringify(nodeData, null, 2), 'utf-8');
      } catch (error) {
        throw new Error(`Failed to write node: ${error}`);
      }
    }
  }
});
