import React, { useState } from 'react';
import styles from './Sidebar.module.css';

interface SidebarNode {
  id: string;
  name: string;
  inputs: string[];
  outputs: string[];
  variadicInputs?: boolean;
  variadicOutputs?: boolean;
}

type Category = 'Complex' | 'Atomic';

const complexNodes: SidebarNode[] = [
  { id: 'script', name: 'Script', inputs:['A','B','C','D','E','F','G'], outputs:['A','B']},
  { id: 'workflow', name: 'Workflow', inputs:['Input','Config'], outputs:['Result','Status']},
];

const atomicNodes: SidebarNode[] = [
  { id: 'start', name: 'Start', inputs:[], outputs:['Output'], variadicInputs: false, variadicOutputs: true},
  { id: 'finish', name: 'Finish', inputs:['Input'], outputs:[], variadicInputs: true, variadicOutputs: false},
  { id: 'script2', name: 'Other Script', inputs:['A','B'], outputs:['A','B','C']},
  { id: 'transform', name: 'Transform', inputs:['Data'], outputs:['Output']},
];

const Sidebar: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<Category>('Complex');
  const handleNodeClick = (node: SidebarNode) => {
    console.log('Node clicked:', node);
  };

  const onDragStart = (event: React.DragEvent, node: SidebarNode) => {
    const dragData = {
      label: node.name,
      inputs: node.inputs,
      outputs: node.outputs,
      variadicInputs: node.variadicInputs,
      variadicOutputs: node.variadicOutputs
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
          {getCurrentNodes().map(node => (
            <div
              key={node.id}
              className={styles.node}
              onClick={() => handleNodeClick(node)}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(event) => onDragStart(event, node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleNodeClick(node);
                }
              }}
            >
              <div className={styles.nodeName}>{node.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;