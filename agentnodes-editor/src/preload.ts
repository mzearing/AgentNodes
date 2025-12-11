import { contextBridge, ipcRenderer } from 'electron';
import * as path from 'path';
import { NodeGroup } from './types/project';

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

const readFileWithRetry = async (filePath: string, maxRetries = 3, delay = 10): Promise<string> => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await fsAsync.readFile(filePath, 'utf-8');
      
      // If we got data, return it
      if (data && data.trim() !== '') {
        return data;
      }
      
      // If file appears empty, retry unless it's the last attempt
      if (attempt < maxRetries - 1) {
        console.warn(`File ${filePath} appears empty on attempt ${attempt + 1}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Last attempt and still empty
      return data;
    } catch (error) {
      if (attempt < maxRetries - 1) {
        console.warn(`Failed to read ${filePath} on attempt ${attempt + 1}:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Failed to read ${filePath} after ${maxRetries} attempts`);
};

const readNodeGroupInternal = async (groupPath: string): Promise<NodeGroup | null> => {
  try {
    const groupJsonPath = path.join(groupPath, 'group.json');
    
    try {
      const groupData = await readFileWithRetry(groupJsonPath);
      
      // Handle empty or invalid JSON gracefully
      if (!groupData || groupData.trim() === '') {
        console.warn(`Empty group file at ${groupJsonPath}, skipping`);
        return null;
      }
      
      let group;
      try {
        group = JSON.parse(groupData);
      } catch (parseError) {
        console.warn(`Failed to parse JSON at ${groupJsonPath}:`, parseError);
        console.warn(`File content: ${JSON.stringify(groupData)}`);
        return null;
      }
      
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
          const nodeData = await readFileWithRetry(nodeJsonPath);
          
          // Handle empty or invalid JSON gracefully
          if (!nodeData || nodeData.trim() === '') {
            console.warn(`Empty node file at ${nodeJsonPath}, skipping`);
            continue;
          }
          
          try {
            const nodeMetadata = JSON.parse(nodeData);
            // Extract summary from NodeMetadata for complex nodes, or use the node directly for atomic nodes
            const nodeSummary = nodeMetadata.summary || nodeMetadata;
            group.nodes.push(nodeSummary);
          } catch (parseError) {
            console.warn(`Failed to parse node JSON at ${nodeJsonPath}:`, parseError);
            console.warn(`File content: ${JSON.stringify(nodeData)}`);
          }
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

// Process output event listeners
interface ProcessOutput {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data: string | number;
  timestamp: Date;
}

let processOutputListeners: Array<(output: ProcessOutput) => void> = [];

// Listen for process output events from main process
ipcRenderer.on('process:output', (_event, output: ProcessOutput) => {
  processOutputListeners.forEach(listener => {
    try {
      listener(output);
    } catch (error) {
      console.error('Error in process output listener:', error);
    }
  });
});

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

  openDirectoryDialog: async (defaultPath?: string): Promise<string | null> => {
    try {
      const result = await ipcRenderer.invoke('dialog:openDirectory', defaultPath);
      return result;
    } catch (error) {
      throw new Error(`Failed to open directory dialog: ${error}`);
    }
  },

  getAppDirectory: async (): Promise<string> => {
    try {
      const result = await ipcRenderer.invoke('app:getDirectory');
      return result;
    } catch (error) {
      throw new Error(`Failed to get app directory: ${error}`);
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
            
            // Check if node file already exists and contains NodeMetadata structure
            try {
              const existingContent = await fsAsync.readFile(nodeJsonPath, 'utf-8');
              const existingData = JSON.parse(existingContent);
              
              // If the existing file has the NodeMetadata structure (summary, dependencies, data),
              // don't overwrite it with just the summary
              if (existingData.summary && existingData.dependencies !== undefined && existingData.data) {
                console.log(`Preserving existing NodeMetadata for ${node.id}`);
                continue;
              }
            } catch (error) {
              // File doesn't exist or is invalid, proceed with writing
            }
            
            // Write the node summary (for new nodes or nodes that don't have full metadata)
            await fsAsync.writeFile(nodeJsonPath, JSON.stringify(node, null, 2), 'utf-8');
          }
        }
        
        // Small delay to ensure filesystem operations are fully complete
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        throw new Error(`Failed to write node group: ${error}`);
      }
    },

    deleteNodeGroup: async (groupPath: string): Promise<void> => {
      try {
        await fsAsync.rm(groupPath, { recursive: true, force: true });
        
        // Small delay to ensure filesystem operations are fully complete
        await new Promise(resolve => setTimeout(resolve, 10));
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
        
        // Small delay to ensure filesystem operations are fully complete
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        throw new Error(`Failed to delete node: ${error}`);
      }
    },

    readNode: async (groupPath: string, nodeId: string): Promise<JSON> => {
      try {
        const nodePath = path.join(groupPath, nodeId);
        const nodeJsonPath = path.join(nodePath, 'node.json');
        const nodeData = await readFileWithRetry(nodeJsonPath);
        
        // Handle empty or invalid JSON gracefully
        if (!nodeData || nodeData.trim() === '') {
          throw new Error(`Empty node file at ${nodeJsonPath}`);
        }
        
        try {
          return JSON.parse(nodeData);
        } catch (parseError) {
          throw new Error(`Failed to parse node JSON at ${nodeJsonPath}: ${parseError}. Content: ${JSON.stringify(nodeData)}`);
        }
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
        
        // Small delay to ensure filesystem operations are fully complete
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        throw new Error(`Failed to write node: ${error}`);
      }
    }
  },

  process: {
    spawn: async (command: string, args: string[] = []): Promise<{
      success: boolean;
      pid?: number;
      command?: string;
      args?: string[];
      error?: string;
    }> => {
      try {
        return await ipcRenderer.invoke('process:spawn', command, args);
      } catch (error) {
        return {
          success: false,
          error: `Failed to spawn process: ${error}`
        };
      }
    },

    kill: async (pid: number): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        return await ipcRenderer.invoke('process:kill', pid);
      } catch (error) {
        return {
          success: false,
          error: `Failed to kill process: ${error}`
        };
      }
    },

    sendInput: async (pid: number, input: string): Promise<{
      success: boolean;
      error?: string;
    }> => {
      try {
        return await ipcRenderer.invoke('process:sendInput', pid, input);
      } catch (error) {
        return {
          success: false,
          error: `Failed to send input: ${error}`
        };
      }
    },

    onOutput: (listener: (output: ProcessOutput) => void): (() => void) => {
      processOutputListeners.push(listener);
      
      return () => {
        const index = processOutputListeners.indexOf(listener);
        if (index > -1) {
          processOutputListeners.splice(index, 1);
        }
      };
    }
  }
});
