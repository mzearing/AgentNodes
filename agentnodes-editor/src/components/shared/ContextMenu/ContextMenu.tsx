import React from 'react';
import styles from './ContextMenu.module.css';

export interface ContextMenuAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'primary';
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  isOpen: boolean;
  onClose?: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ 
  x, 
  y, 
  actions, 
  isOpen,
  onClose 
}) => {
  if (!isOpen) return null;

  return (
    <div
      className={styles.contextMenu}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {actions.map((action, index) => (
        <React.Fragment key={index}>
          {action.separator && index > 0 && (
            <div className={styles.separator} />
          )}
          <button
            className={`${styles.menuItem} ${action.variant ? styles[`menuItem--${action.variant}`] : ''}`}
            onClick={() => {
              action.onClick();
              onClose?.();
            }}
            disabled={action.disabled}
          >
            {action.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};

export default ContextMenu;