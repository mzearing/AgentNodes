import React, { useRef, useEffect } from 'react';
import styles from '../NodeGroups.module.css';
import { NodeGroup } from '../../../types';

interface GroupHeaderProps {
  group: NodeGroup;
  isExpanded: boolean;
  isEditing: boolean;
  editingGroupName: string;
  onToggleGroup: (groupId: string) => void;
  onGroupDoubleClick: (groupId: string, groupName: string) => void;
  onGroupRightClick: (e: React.MouseEvent, groupId: string) => void;
  onGroupNameSubmit: () => void;
  onGroupNameKeyDown: (e: React.KeyboardEvent) => void;
  onGroupNameChange: (value: string) => void;
}

const GroupHeader: React.FC<GroupHeaderProps> = ({
  group,
  isExpanded,
  isEditing,
  editingGroupName,
  onToggleGroup,
  onGroupDoubleClick,
  onGroupRightClick,
  onGroupNameSubmit,
  onGroupNameKeyDown,
  onGroupNameChange,
}) => {
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  return (
    <div 
      className={styles.groupHeader}
      onClick={() => onToggleGroup(group.id)}
      onDoubleClick={() => onGroupDoubleClick(group.id, group.name)}
      onContextMenu={(e) => onGroupRightClick(e, group.id)}
      style={{ '--group-color': group.color } as React.CSSProperties}
    >
      <div className={styles.groupIndicator}></div>
      <div className={styles.groupName}>
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingGroupName}
            onChange={(e) => onGroupNameChange(e.target.value)}
            onBlur={onGroupNameSubmit}
            onKeyDown={onGroupNameKeyDown}
            className={styles.groupNameInput}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{group.name}</span>
        )}
        <div className={`${styles.expandIcon} ${isExpanded ? styles.expanded : ''}`}>
          ▼
        </div>
      </div>
    </div>
  );
};

export default GroupHeader;