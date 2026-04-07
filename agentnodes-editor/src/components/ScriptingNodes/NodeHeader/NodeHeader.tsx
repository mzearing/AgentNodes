import React, { useState } from 'react';
import styles from './NodeHeader.module.css';

interface NodeHeaderProps {
  label: string;
  icon?: string;
  children?: React.ReactNode;
  onLabelChange?: (newLabel: string) => void;
}

const NodeHeader: React.FC<NodeHeaderProps> = ({ label, children, onLabelChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState(label);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onLabelChange) return;
    e.stopPropagation();
    setEditingValue(label);
    setIsEditing(true);
  };

  const handleSubmit = () => {
    const trimmed = editingValue.trim();
    if (trimmed && trimmed !== label) {
      onLabelChange?.(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setEditingValue(label);
      setIsEditing(false);
    }
  };

  return (
    <div className={styles.nodeHeader} title="Drag to move node">
      {isEditing ? (
        <input
          className={styles.nodeTitleInput}
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          autoFocus
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={`${styles.nodeTitle} ${onLabelChange ? styles.editable : ''}`}
          onDoubleClick={handleDoubleClick}
        >
          {label}
        </span>
      )}
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
