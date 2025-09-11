import React from 'react';
import styles from './NodeHeader.module.css';

interface NodeHeaderProps {
  label: string;
  icon?: string;
}

const NodeHeader: React.FC<NodeHeaderProps> = ({ label }) => {
  return (
    <div className={styles.nodeHeader}>
      <span className={styles.nodeTitle}>{label}</span>
    </div>
  );
};

export default NodeHeader;