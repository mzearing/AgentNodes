import React from 'react';
import styles from './Sidebar.module.css';

interface SidebarNode {
  id: string;
  name: string;
}

const scriptingNodes: SidebarNode[] = [
  { id: 'script', name: 'Script' },
];

const Sidebar: React.FC = () => {
  const handleNodeClick = (node: SidebarNode) => {
    console.log('Node clicked:', node);
  };

  const onDragStart = (event: React.DragEvent, node: SidebarNode) => {
    const dragData = {
      label: node.name,
    };
    
    event.dataTransfer.setData('application/reactflow', JSON.stringify(dragData));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarContent}>
        <div className={styles.nodeList}>
          {scriptingNodes.map(node => (
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