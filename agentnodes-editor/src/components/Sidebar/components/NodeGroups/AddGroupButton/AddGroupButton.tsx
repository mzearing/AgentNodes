import React from 'react';
import styles from '../NodeGroups.module.css';

interface AddGroupButtonProps {
  onClick: () => void;
}

const AddGroupButton: React.FC<AddGroupButtonProps> = ({ onClick }) => {
  return (
    <button
      className={styles.addGroupButton}
      onClick={onClick}
    >
      <span className={styles.addNodeIcon}>+</span>
      Add Group
    </button>
  );
};

export default AddGroupButton;