import React, { useState } from 'react';
import { Node } from '@xyflow/react';
import styles from './Sidebar.module.css';
import { ScriptingNodeData } from '../ScriptingNodes/ScriptingNode';

interface SidebarNode {
  id: string;
  name: string;
  inputs: string[];
  outputs: string[];
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
  solo?: boolean;
}

type Category = 'Complex' | 'Atomic';

const complexNodes: SidebarNode[] = [
  { id: 'script', name: 'Script', inputs:['A','B','C','D','E','F','G'], outputs:['A','B']},
  { id: 'workflow', name: 'Workflow', inputs:['Input','Config'], outputs:['Result','Status']},
];

const atomicNodes: SidebarNode[] = [
  { id: 'start', name: 'Start', inputs:[], outputs:['Output'], variadicInputs: false, variadicOutputs: true, solo: true},
  { id: 'finish', name: 'Finish', inputs:['Input'], outputs:[], variadicInputs: true, variadicOutputs: false, solo: true},
  { id: 'script2', name: 'Other Script', inputs:['A','B'], outputs:['A','B','C']},
  { id: 'transform', name: 'Transform', inputs:['Data'], outputs:['Output']},
];

interface SidebarProps {
  nodes: Node[];
}

const Sidebar: React.FC<SidebarProps> = ({ nodes }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  const handleNodeClick = (node: SidebarNode) => {
    console.log('Node clicked:', node);
  };

  const isNodeAlreadyOnCanvas = (sidebarNode: SidebarNode): boolean => {
    if (!sidebarNode.solo) return false;
    
    return nodes.some(canvasNode => {
      const nodeData = canvasNode.data as ScriptingNodeData;
      return nodeData.solo && nodeData.nodeId === sidebarNode.id;
    });
  };

  const onDragStart = (event: React.DragEvent, node: SidebarNode) => {
    // Prevent dragging if the solo node already exists
    if (isNodeAlreadyOnCanvas(node)) {
      event.preventDefault();
      return;
    }

    const dragData = {
      nodeId: node.id,
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs,
      solo: node.solo
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  const getCurrentNodes = (): SidebarNode[] => {
    return activeCategory === 'Complex' ? complexNodes : atomicNodes;
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <div className={styles.categories}>
          <button
            className={`${styles.categoryButton} ${activeCategory === 'Complex' ? styles.active : ''}`}
            onClick={() => setActiveCategory('Complex')}
          >
            Complex
          </button>
          <button
            className={`${styles.categoryButton} ${activeCategory === 'Atomic' ? styles.active : ''}`}
            onClick={() => setActiveCategory('Atomic')}
          >
            Atomic
          </button>
        </div>
        <div className={styles.nodeList}>
          {getCurrentNodes().map(node => {
            const isDisabled = isNodeAlreadyOnCanvas(node);
            return (
              <div
                key={node.id}
                className={`${styles.node} ${isDisabled ? styles.disabled : ''}`}
                onClick={() => !isDisabled && handleNodeClick(node)}
                role="button"
                tabIndex={isDisabled ? -1 : 0}
                draggable={!isDisabled}
                onDragStart={(event) => onDragStart(event, node)}
                onKeyDown={(e) => {
                  if (!isDisabled && (e.key === 'Enter' || e.key === ' ')) {
                    handleNodeClick(node);
                  }
                }}
              >
                <div className={styles.nodeName}>{node.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;