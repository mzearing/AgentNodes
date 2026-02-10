import { Node, Edge } from '@xyflow/react';
import { ScriptingNodeData } from '../components/ScriptingNodes/ScriptingNode';

interface ClipboardData {
  nodes: Node[];
  edges: Edge[];
  timestamp: number;
}

class NodeClipboard {
  private clipboardData: ClipboardData | null = null;

  /**
   * Copy selected nodes and their internal connections to clipboard
   */
  copy(selectedNodes: Node[], allEdges: Edge[]): boolean {
    if (selectedNodes.length === 0) {
      return false;
    }

    // Get IDs of selected nodes
    const selectedNodeIds = new Set(selectedNodes.map(node => node.id));

    // Find edges that connect selected nodes to each other (internal connections)
    const relevantEdges = allEdges.filter(edge => 
      selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    // Create a deep copy of the data
    this.clipboardData = {
      nodes: JSON.parse(JSON.stringify(selectedNodes)),
      edges: JSON.parse(JSON.stringify(relevantEdges)),
      timestamp: Date.now()
    };

    return true;
  }

  /**
   * Paste copied nodes at a specified position offset
   */
  paste(
    allNodes: Node[],
    allEdges: Edge[],
    offset: { x: number; y: number } = { x: 50, y: 50 }
  ): { nodes: Node[]; edges: Edge[] } | null {
    if (!this.clipboardData || this.clipboardData.nodes.length === 0) {
      return null;
    }

    const { nodes: clipboardNodes, edges: clipboardEdges } = this.clipboardData;

    // Create ID mapping for old -> new node IDs
    const idMapping = new Map<string, string>();
    
    // Generate new unique IDs for pasted nodes
    clipboardNodes.forEach(node => {
      const newId = this.generateUniqueNodeId(allNodes);
      idMapping.set(node.id, newId);
    });

    // Create mapping for old handle IDs to new handle IDs
    const handleIdMapping = new Map<string, string>();
    
    // Create new nodes with updated IDs and positions
    const newNodes = clipboardNodes.map(node => {
      const newId = idMapping.get(node.id)!;
      
      // Deep clone the node data to avoid modifying the original
      let updatedData = JSON.parse(JSON.stringify(node.data));
      
      if (node.type === 'scripting-node') {
        const scriptingData = updatedData as ScriptingNodeData;
        
        // Map old input handle IDs to new ones
        if (scriptingData.inputs) {
          scriptingData.inputs = scriptingData.inputs.map((input, index) => {
            const oldId = input.id;
            const newHandleId = `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`;
            handleIdMapping.set(oldId, newHandleId);
            return {
              ...input,
              id: newHandleId
            };
          });
        }
        
        // Map old output handle IDs to new ones
        if (scriptingData.outputs) {
          scriptingData.outputs = scriptingData.outputs.map((output, index) => {
            const oldId = output.id;
            const newHandleId = `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`;
            handleIdMapping.set(oldId, newHandleId);
            return {
              ...output,
              id: newHandleId
            };
          });
        }
        
        updatedData = scriptingData;
      }
      
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y
        },
        selected: true, // Select pasted nodes
        data: updatedData
      };
    });

    // Create new edges with updated node IDs and handle IDs
    const newEdges = clipboardEdges.map(edge => {
      const newSourceId = idMapping.get(edge.source);
      const newTargetId = idMapping.get(edge.target);
      
      if (!newSourceId || !newTargetId) {
        return null; // Skip edges if source/target not found
      }

      // Update handle IDs if they exist in the mapping
      const newSourceHandle = edge.sourceHandle ? 
        (handleIdMapping.get(edge.sourceHandle) || edge.sourceHandle) : edge.sourceHandle;
      const newTargetHandle = edge.targetHandle ? 
        (handleIdMapping.get(edge.targetHandle) || edge.targetHandle) : edge.targetHandle;

      return {
        ...edge,
        id: this.generateUniqueEdgeId(allEdges, newSourceId, newTargetId),
        source: newSourceId,
        target: newTargetId,
        sourceHandle: newSourceHandle,
        targetHandle: newTargetHandle
      };
    }).filter(Boolean) as Edge[];

    return {
      nodes: newNodes,
      edges: newEdges
    };
  }

  /**
   * Check if clipboard has data
   */
  hasData(): boolean {
    return this.clipboardData !== null && this.clipboardData.nodes.length > 0;
  }

  /**
   * Get information about clipboard contents
   */
  getInfo(): { nodeCount: number; edgeCount: number; timestamp: number } | null {
    if (!this.clipboardData) {
      return null;
    }

    return {
      nodeCount: this.clipboardData.nodes.length,
      edgeCount: this.clipboardData.edges.length,
      timestamp: this.clipboardData.timestamp
    };
  }

  /**
   * Clear clipboard data
   */
  clear(): void {
    this.clipboardData = null;
  }

  /**
   * Generate a unique node ID that doesn't conflict with existing nodes
   */
  private generateUniqueNodeId(existingNodes: Node[]): string {
    const existingIds = new Set(existingNodes.map(node => node.id));
    let counter = 1;
    let newId: string;

    do {
      newId = `node-${Date.now()}-${counter}-${Math.random().toString(36).substring(2, 9)}`;
      counter++;
    } while (existingIds.has(newId));

    return newId;
  }

  /**
   * Generate a unique edge ID
   */
  private generateUniqueEdgeId(existingEdges: Edge[], sourceId: string, targetId: string): string {
    const existingIds = new Set(existingEdges.map(edge => edge.id));
    let counter = 1;
    let newId: string;

    do {
      newId = `${sourceId}-${targetId}-${counter}`;
      counter++;
    } while (existingIds.has(newId));

    return newId;
  }

  /**
   * Update handle IDs in pasted nodes to avoid conflicts
   */
  private updateNodeHandleIds(nodeData: ScriptingNodeData): ScriptingNodeData {
    const updatedData = { ...nodeData };

    // Update input handle IDs
    if (updatedData.inputs) {
      updatedData.inputs = updatedData.inputs.map((input, index) => ({
        ...input,
        id: `input-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`
      }));
    }

    // Update output handle IDs  
    if (updatedData.outputs) {
      updatedData.outputs = updatedData.outputs.map((output, index) => ({
        ...output,
        id: `output-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 11)}`
      }));
    }

    return updatedData;
  }
}

// Export a singleton instance
export const nodeClipboard = new NodeClipboard();

// Export utility functions
export const copySelectedNodes = (selectedNodes: Node[], allEdges: Edge[]): boolean => {
  return nodeClipboard.copy(selectedNodes, allEdges);
};

export const pasteNodes = (
  allNodes: Node[],
  allEdges: Edge[],
  offset?: { x: number; y: number }
): { nodes: Node[]; edges: Edge[] } | null => {
  return nodeClipboard.paste(allNodes, allEdges, offset);
};

export const hasClipboardData = (): boolean => {
  return nodeClipboard.hasData();
};

export const getClipboardInfo = (): { nodeCount: number; edgeCount: number; timestamp: number } | null => {
  return nodeClipboard.getInfo();
};

export const clearClipboard = (): void => {
  nodeClipboard.clear();
};