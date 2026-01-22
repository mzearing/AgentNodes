import React from 'react';
import styles from './NodeHeader.module.css';

interface NodeHeaderProps {
  label: string;
  icon?: string;
  children?: React.ReactNode;
}

const NodeHeader: React.FC<NodeHeaderProps> = ({ label, children }) => {
  return (
    <div className={styles.nodeHeader} title="Drag to move node">
      <span className={styles.nodeTitle}>{label}</span>
      {children}
      <div className={styles.dragIndicator}>
        <div className={styles.dragDots}></div>
        <div className={styles.dragDots}></div>
        <div className={styles.dragDots}></div>
      </div>
    </div>
  );
};

export default React.memo(NodeHeader);