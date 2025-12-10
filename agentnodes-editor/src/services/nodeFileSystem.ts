import { Category, NodeGroup, NodeSummary, IOType } from "../types/project";
import { canvasRefreshEmitter } from "../hooks/useSidebarData";
import { configurationService } from "./configurationService";

// Helper function to detect if types indicate multitype capability
const detectMultitype = (types: IOType[] | IOType[][] | undefined): boolean => {
  if (!types || types.length === 0) return false;
  
  // If it's an array of arrays, check if any sub-array has multiple types
  if (Array.isArray(types[0])) {
    return (types as IOType[][]).some(typeArr => typeArr.length > 1);
  }
  
  return false;
};

declare global {
  interface Window {
    electronAPI: {
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<void>;
      mkdir: (dirPath: string) => Promise<void>;
      getStats: (filePath: string) => Promise<{ size: number; mtime: Date }>;
      nodeFileSystem: {
        readNodeGroups: (nodesPath: string) => Promise<{ complex: NodeGroup[]; atomic: NodeGroup[] }>;
        readNodeGroup: (groupPath: string) => Promise<NodeGroup | null>;
        writeNodeGroup: (groupPath: string, group: NodeGroup) => Promise<void>;
        deleteNodeGroup: (groupPath: string) => Promise<void>;
        createNodesDirectory: (nodesPath: string) => Promise<void>;
        deleteNode: (groupPath: string, nodeId: string) => Promise<void>;
        readNode:   (groupPath: string, nodeId: string) => Promise<JSON>;
        writeNode:  (groupPath: string, nodeId: string, nodeData: JSON) => Promise<void>;
      };
    };
  }
}

export class NodeFileSystemService {
  private nodeFileTimestamps: Map<string, number> = new Map();

  constructor() {
    // Path is now managed by configurationService
  }
  
  private get nodesPath(): string {
    return configurationService.getNodeDefinitionsPath();
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
  async readNode(groupId: string, nodeId: string, category: Category): Promise<JSON | null> {
    if (!nodeId) {
      console.error('readNode called with undefined nodeId. GroupId:', groupId, 'Category:', category);
      return null;
    }
    
    if (!groupId) {
      console.error('readNode called with undefined groupId. NodeId:', nodeId, 'Category:', category);
      return null;
    }
    
    try {
      if (window.electronAPI?.nodeFileSystem) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${groupId}`;
        
        const nodeData = await window.electronAPI.nodeFileSystem.readNode(groupPath, nodeId);
        return nodeData;
      }
    } catch (error) {
      console.error('Failed to read node from file system:', error);
    }
    
    console.log('Reading node:', nodeId, 'from group:', groupId);
    return null;
  }

  async writeNode(groupId: string, nodeId: string, nodeData: JSON, category: Category, skipDependencyUpdate = false): Promise<boolean> {
    console.log('NodeFileSystem.writeNode called with:', {
      groupId,
      nodeId,
      category,
      nodesPath: this.nodesPath,
      skipDependencyUpdate
    });
    
    try {
      if (window.electronAPI?.nodeFileSystem) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${groupId}`;
        
        // Check if the node already exists to compare for changes
        let hasChanged = false;
        if (!skipDependencyUpdate) {
          try {
            const existingNodeData = await window.electronAPI.nodeFileSystem.readNode(groupPath, nodeId);
            if (existingNodeData) {
              hasChanged = await this.checkNodeInterfaceChanged(existingNodeData, nodeData, category);
            }
          } catch (error) {
            // Node doesn't exist yet, so it's a new node
            hasChanged = true;
          }
        }
        
        console.log('Writing to groupPath:', groupPath);
        console.log('Node data:', JSON.stringify(nodeData, null, 2));
        
        await window.electronAPI.nodeFileSystem.writeNode(groupPath, nodeId, nodeData);
        console.log('Write operation completed successfully');
        
        // If the node interface changed, update all dependencies
        if (hasChanged && !skipDependencyUpdate) {
          console.log('Node interface changed, updating dependencies...');
          await this.updateAllDependencies(groupId, nodeId, nodeData, category);
          // Emit canvas refresh event to update live canvas with dependency changes
          console.log('Emitting canvas refresh event due to dependency changes...');
          canvasRefreshEmitter.emit();
        }
        
        return true;
      } else {
        console.error('electronAPI.nodeFileSystem not available');
      }
    } catch (error) {
      console.error('Failed to write node to file system:', error);
    }
    
    console.log('Writing node:', nodeId, 'to group:', groupId);
    return false;
  }

  async moveNodeBetweenGroups(nodeId: string, sourceGroupId: string, targetGroupId: string, category: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.nodeFileSystem && window.electronAPI?.readFile && window.electronAPI?.writeFile && window.electronAPI?.mkdir) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const sourceNodePath = `${this.nodesPath}/${categoryPath}/${sourceGroupId}/${nodeId}`;
        const targetNodePath = `${this.nodesPath}/${categoryPath}/${targetGroupId}/${nodeId}`;
        
        // Read the node data from source location
        const nodeData = await window.electronAPI.readFile(`${sourceNodePath}/node.json`);
        
        // Create target node directory
        await window.electronAPI.mkdir(targetNodePath);
        
        // Write node to new location
        await window.electronAPI.writeFile(`${targetNodePath}/node.json`, nodeData);
        
        // Delete from old location
        await window.electronAPI.nodeFileSystem.deleteNode(`${this.nodesPath}/${categoryPath}/${sourceGroupId}`, nodeId);
        
        return true;
      }
    } catch (error) {
      console.error('Failed to move node between groups in file system:', error);
    }
    
    console.log('Moving node:', nodeId, 'from group:', sourceGroupId, 'to group:', targetGroupId);
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

  async getFreshNodeData(nodeId: string, groupId: string, category: Category): Promise<{ inputs: string[]; outputs: string[]; inputTypes?: IOType[]; outputTypes?: IOType[]; variadicInputs?: boolean; variadicOutputs?: boolean; multitypeInputs?: boolean; multitypeOutputs?: boolean; solo?: boolean; constantData?: IOType[] } | null> {
    try {
      if (window.electronAPI?.readFile) {
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const nodeFilePath = `${this.nodesPath}/${categoryPath}/${groupId}/${nodeId}/node.json`;
        
        const nodeData = await window.electronAPI.readFile(nodeFilePath);
        const node = JSON.parse(nodeData);
        
        // Check if this is a complex node (has summary structure) or atomic node (direct properties)
        if (node.summary && typeof node.summary === 'object') {
          // Complex node - get data from summary
          return {
            inputs: node.summary.inputs || [],
            outputs: node.summary.outputs || [],
            inputTypes: node.summary.inputTypes || [],
            outputTypes: node.summary.outputTypes || [],
            variadicInputs: undefined, // Complex nodes don't have variadic settings
            variadicOutputs: undefined,
            multitypeInputs: node.summary.multitypeInputs,
            multitypeOutputs: node.summary.multitypeOutputs,
            solo: undefined, // Complex nodes are not solo nodes
            constantData: node.summary.constantData || []
          };
        } else {
          // Atomic node - get data directly
          return {
            inputs: node.inputs || [],
            outputs: node.outputs || [],
            inputTypes: node.inputTypes || [],
            outputTypes: node.outputTypes || [],
            variadicInputs: node.variadicInputs,
            variadicOutputs: node.variadicOutputs,
            multitypeInputs: node.multitypeInputs,
            multitypeOutputs: node.multitypeOutputs,
            solo: node.solo,
            constantData: node.constantData || []
          };
        }
      }
    } catch (error) {
      console.warn('Failed to get fresh node data:', error);
    }
    
    return null;
  }

  async updateNodeSummaryInGroup(groupId: string, nodeId: string, newSummary: NodeSummary, category: Category): Promise<boolean> {
    try {
      if (window.electronAPI?.nodeFileSystem) {
        // Read the current group
        const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
        const groupPath = `${this.nodesPath}/${categoryPath}/${groupId}`;
        const group = await window.electronAPI.nodeFileSystem.readNodeGroup(groupPath);
        
        if (group) {
          // Find and update the node summary in the group
          const nodeIndex = group.nodes.findIndex(node => node.id === nodeId);
          if (nodeIndex !== -1) {
            group.nodes[nodeIndex] = newSummary;
            
            // Save the updated group
            await window.electronAPI.nodeFileSystem.writeNodeGroup(groupPath, group);
            return true;
          } else {
            console.warn(`Node ${nodeId} not found in group ${groupId}`);
          }
        } else {
          console.warn(`Group ${groupId} not found`);
        }
      }
    } catch (error) {
      console.error('Failed to update node summary in group:', error);
    }
    
    return false;
  }

  private async checkNodeInterfaceChanged(oldNodeData: JSON, newNodeData: JSON, category: Category): Promise<boolean> {
    try {
      const oldNode = oldNodeData as any;
      const newNode = newNodeData as any;
      
      // For complex nodes, check the summary
      if (category === 'Complex') {
        const oldSummary = oldNode.summary;
        const newSummary = newNode.summary;
        
        if (!oldSummary || !newSummary) return true;
        
        return (
          oldSummary.name !== newSummary.name ||
          JSON.stringify(oldSummary.inputs) !== JSON.stringify(newSummary.inputs) ||
          JSON.stringify(oldSummary.outputs) !== JSON.stringify(newSummary.outputs) ||
          JSON.stringify(oldSummary.inputTypes || []) !== JSON.stringify(newSummary.inputTypes || []) ||
          JSON.stringify(oldSummary.outputTypes || []) !== JSON.stringify(newSummary.outputTypes || [])
        );
      } else {
        // For atomic nodes, check direct properties
        return (
          oldNode.name !== newNode.name ||
          JSON.stringify(oldNode.inputs) !== JSON.stringify(newNode.inputs) ||
          JSON.stringify(oldNode.outputs) !== JSON.stringify(newNode.outputs) ||
          JSON.stringify(oldNode.inputTypes || []) !== JSON.stringify(newNode.inputTypes || []) ||
          JSON.stringify(oldNode.outputTypes || []) !== JSON.stringify(newNode.outputTypes || [])
        );
      }
    } catch (error) {
      console.warn('Error checking node interface changes:', error);
      return true; // Assume changed if we can't check
    }
  }

  private async updateAllDependencies(groupId: string, nodeId: string, nodeData: JSON, category: Category): Promise<void> {
    try {
      console.log(`Updating all dependencies for ${category}/${groupId}/${nodeId}`);
      
      // Get the new node summary
      const newSummary = await this.extractNodeSummary(nodeData, groupId, nodeId, category);
      if (!newSummary) {
        console.warn('Could not extract node summary for dependency updates');
        return;
      }

      // Find all nodes that depend on this node
      const dependentNodes = await this.findAllDependentNodes(groupId, nodeId, category);
      
      // Update all dependent nodes, including self-recursive ones
      for (const dependent of dependentNodes) {
        if (dependent.groupId === groupId && dependent.nodeId === nodeId && dependent.category === category) {
          // Handle self-recursive dependency specially
          console.log(`Updating self-recursive dependency for ${category}/${groupId}/${nodeId}`);
          await this.updateSelfRecursiveDependency(groupId, nodeId, newSummary, category, nodeData);
        } else {
          // Handle regular dependency
          await this.updateNodeDependency(dependent, newSummary);
        }
      }
      
      // Also update the node in its own group's node list
      await this.updateNodeSummaryInGroup(groupId, nodeId, newSummary, category);
      
    } catch (error) {
      console.error('Error updating dependencies:', error);
    }
  }

  private async extractNodeSummary(nodeData: JSON, groupId: string, nodeId: string, category: Category): Promise<NodeSummary | null> {
    try {
      const node = nodeData as any;
      const categoryPath = category.toLowerCase() as 'complex' | 'atomic';
      const path = `${categoryPath}/${groupId}/${nodeId}`;
      
      if (category === 'Complex' && node.summary) {
        // Use existing summary for complex nodes
        return {
          ...node.summary,
          path
        };
      } else {
        // Create summary from atomic node properties
        console.log(`Extracting summary for atomic node ${nodeId}:`, {
          inputs: node.inputs,
          inputTypes: node.inputTypes,
          outputs: node.outputs,
          outputTypes: node.outputTypes
        });
        
        return {
          id: nodeId,
          name: node.name || nodeId,
          inputs: node.inputs || [],
          inputTypes: node.inputTypes || (node.inputs || []).map(() => IOType.None),
          outputs: node.outputs || [],
          outputTypes: node.outputTypes || (node.outputs || []).map(() => IOType.None),
          variadicInputs: node.variadicInputs || false,
          variadicOutputs: node.variadicOutputs || false,
          multitypeInputs: node.multitypeInputs ?? detectMultitype(node.inputTypes),
          multitypeOutputs: node.multitypeOutputs ?? detectMultitype(node.outputTypes),
          constantData: node.constantData || [],
          solo: node.solo || false,
          path
        };
      }
    } catch (error) {
      console.warn('Error extracting node summary:', error);
      return null;
    }
  }

  private async findAllDependentNodes(targetGroupId: string, targetNodeId: string, targetCategory: Category): Promise<Array<{groupId: string, nodeId: string, category: Category}>> {
    const dependentNodes: Array<{groupId: string, nodeId: string, category: Category}> = [];
    
    try {
      // Load all node groups to find dependencies
      const nodeGroups = await this.loadNodeGroups();
      
      // Check both complex and atomic categories
      for (const categoryName of ['complex', 'atomic'] as const) {
        const groups = categoryName === 'complex' ? nodeGroups.complex : nodeGroups.atomic;
        const category = categoryName === 'complex' ? 'Complex' : 'Atomic';
        
        for (const group of groups) {
          for (const node of group.nodes) {
            // For complex nodes, check their dependencies
            if (categoryName === 'complex') {
              try {
                const nodeData = await this.readNode(group.id, node.id, 'Complex');
                if (nodeData && typeof nodeData === 'object' && 'dependencies' in nodeData) {
                  const metadata = nodeData as any;
                  if (metadata.dependencies && Array.isArray(metadata.dependencies)) {
                    // Check if this node depends on our target node
                    const hasDependency = metadata.dependencies.some((dep: NodeSummary) => {
                      const depPathParts = dep.path.split('/');
                      return depPathParts.length >= 3 && 
                             depPathParts[1] === targetGroupId && 
                             depPathParts[2] === targetNodeId &&
                             depPathParts[0] === targetCategory.toLowerCase();
                    });
                    
                    if (hasDependency) {
                      dependentNodes.push({
                        groupId: group.id,
                        nodeId: node.id,
                        category: 'Complex'
                      });
                    }
                  }
                }
              } catch (error) {
                console.warn(`Error checking dependencies for ${group.id}/${node.id}:`, error);
              }
            }
          }
        }
      }
      
      console.log(`Found ${dependentNodes.length} dependent nodes for ${targetCategory}/${targetGroupId}/${targetNodeId}`);
      return dependentNodes;
      
    } catch (error) {
      console.error('Error finding dependent nodes:', error);
      return [];
    }
  }

  private async updateSelfRecursiveDependency(groupId: string, nodeId: string, newSummary: NodeSummary, category: Category, currentNodeData?: JSON): Promise<void> {
    try {
      console.log(`Updating self-recursive dependency for ${category}/${groupId}/${nodeId}`);
      
      // For self-recursive dependencies, we need to be careful to update the node's dependencies
      // without causing infinite recursion. Use the current node data being saved instead of
      // reading from disk to avoid using stale data.
      
      let nodeData = currentNodeData;
      if (!nodeData) {
        nodeData = await this.readNode(groupId, nodeId, category);
      }
      
      if (!nodeData || typeof nodeData !== 'object') {
        console.warn(`Could not get node data for self-recursive node ${groupId}/${nodeId}`);
        return;
      }
      
      const metadata = nodeData as any;
      if (!metadata.dependencies || !Array.isArray(metadata.dependencies)) {
        console.log(`No dependencies found in self-recursive node ${groupId}/${nodeId}`);
        return;
      }
      
      // Update any self-references in the dependencies list
      let updated = false;
      for (let i = 0; i < metadata.dependencies.length; i++) {
        const dep = metadata.dependencies[i];
        const depPathParts = dep.path.split('/');
        const newSummaryPathParts = newSummary.path.split('/');
        
        // Check if this dependency is a self-reference
        if (depPathParts.length >= 3 && newSummaryPathParts.length >= 3 &&
            depPathParts[0] === newSummaryPathParts[0] && // category
            depPathParts[1] === newSummaryPathParts[1] && // groupId  
            depPathParts[2] === newSummaryPathParts[2]) { // nodeId
          
          // Update the self-reference with new information from the passed newSummary
          // This ensures we get the latest type changes and other updates
          metadata.dependencies[i] = { ...newSummary };
          updated = true;
          console.log(`Updated self-recursive dependency ${dep.path} with new summary data:`, {
            oldTypes: { inputTypes: dep.inputTypes, outputTypes: dep.outputTypes },
            newTypes: { inputTypes: newSummary.inputTypes, outputTypes: newSummary.outputTypes }
          });
        }
      }
      
      if (updated) {
        // Update canvas nodes to reflect the new dependency information
        await this.updateCanvasNodesFromDependencies(metadata);
        
        // Use the regular writeNode method but skip dependency updates to avoid infinite recursion
        await this.writeNode(groupId, nodeId, metadata as JSON, category, true);
        console.log(`Successfully updated self-recursive dependencies in ${groupId}/${nodeId}`);
      }
      
    } catch (error) {
      console.error(`Error updating self-recursive dependency in ${groupId}/${nodeId}:`, error);
    }
  }

  private async updateNodeDependency(dependent: {groupId: string, nodeId: string, category: Category}, newSummary: NodeSummary): Promise<void> {
    try {
      console.log(`Updating dependency in ${dependent.category}/${dependent.groupId}/${dependent.nodeId}`);
      
      // Read the dependent node's data
      const nodeData = await this.readNode(dependent.groupId, dependent.nodeId, dependent.category);
      if (!nodeData || typeof nodeData !== 'object') {
        console.warn(`Could not read dependent node ${dependent.groupId}/${dependent.nodeId}`);
        return;
      }
      
      const metadata = nodeData as any;
      if (!metadata.dependencies || !Array.isArray(metadata.dependencies)) {
        console.warn(`No dependencies found in ${dependent.groupId}/${dependent.nodeId}`);
        return;
      }
      
      // Update the matching dependency
      let updated = false;
      for (let i = 0; i < metadata.dependencies.length; i++) {
        const dep = metadata.dependencies[i];
        const depPathParts = dep.path.split('/');
        const newSummaryPathParts = newSummary.path.split('/');
        
        // Check if this dependency matches our updated node
        if (depPathParts.length >= 3 && newSummaryPathParts.length >= 3 &&
            depPathParts[0] === newSummaryPathParts[0] && // category
            depPathParts[1] === newSummaryPathParts[1] && // groupId  
            depPathParts[2] === newSummaryPathParts[2]) { // nodeId
          metadata.dependencies[i] = { ...newSummary };
          updated = true;
        }
      }
      
      if (updated) {
        await this.updateCanvasNodesFromDependencies(metadata);
        
        await this.writeNode(dependent.groupId, dependent.nodeId, metadata as JSON, dependent.category, true);
      }
      
    } catch (error) {
      console.error(`Error updating dependency in ${dependent.groupId}/${dependent.nodeId}:`, error);
    }
  }

  private async updateCanvasNodesFromDependencies(metadata: any): Promise<void> {
    try {
      if (!metadata.data || !metadata.data.nodes || !metadata.dependencies) {
        return;
      }
      let updatedNodes = 0;
      
      // Update each canvas node that corresponds to a dependency
      for (const canvasNode of metadata.data.nodes) {
        // Skip start/finish nodes
        if (canvasNode.data?.nodeId === 'start' || canvasNode.data?.nodeId === 'finish') {
          continue;
        }

        // Find the corresponding dependency
        const matchingDependency = metadata.dependencies.find((dep: NodeSummary) => {
          return dep.id === canvasNode.data?.nodeId;
        });

        if (matchingDependency) {
          
          // Update the canvas node's label and inputs/outputs
          canvasNode.data.label = matchingDependency.name;
          
          // Generate new inputs based on dependency data
          // Use dependency types as authoritative source for self-recursive scenarios
          const newInputs = matchingDependency.inputs.map((inputName: string, index: number) => {
            const existingInput = canvasNode.data.inputs?.[index];
            return {
              id: existingInput?.id || `input-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
              name: inputName,
              // Use dependency types as source of truth
              type: matchingDependency.inputTypes?.[index] || IOType.None
            };
          });
          
          // Generate new outputs based on dependency data
          // Use dependency types as authoritative source for self-recursive scenarios
          const newOutputs = matchingDependency.outputs.map((outputName: string, index: number) => {
            const existingOutput = canvasNode.data.outputs?.[index];
            return {
              id: existingOutput?.id || `output-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 11)}`,
              name: outputName,
              // Use dependency types as source of truth
              type: matchingDependency.outputTypes?.[index] || IOType.None
            };
          });
          
          // Update the canvas node data
          canvasNode.data.inputs = newInputs;
          canvasNode.data.outputs = newOutputs;
          canvasNode.data.variadicInputs = matchingDependency.variadicInputs;
          canvasNode.data.variadicOutputs = matchingDependency.variadicOutputs;
          canvasNode.data.multitypeInputs = matchingDependency.multitypeInputs;
          canvasNode.data.multitypeOutputs = matchingDependency.multitypeOutputs;
          canvasNode.data.solo = matchingDependency.solo;
          
          updatedNodes++;
          console.log(`Updated canvas node with ${newInputs.length} inputs and ${newOutputs.length} outputs`);
        } else {
          console.log(`No matching dependency found for canvas node ${canvasNode.id} (nodeId: ${canvasNode.data?.nodeId})`);
        }
      }
      
      console.log(`Updated ${updatedNodes} canvas nodes from dependencies`);
    } catch (error) {
      console.error('Error updating canvas nodes from dependencies:', error);
    }
  }
}

export const nodeFileSystem = new NodeFileSystemService();