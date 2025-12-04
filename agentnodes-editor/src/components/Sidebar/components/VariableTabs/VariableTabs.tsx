import React from 'react';
import { Variable, IOType } from '../../../../types/project';
import VariablesList from './VariablesList';
import styles from './VariableTabs.module.css';

interface VariableTabsProps {
  variables: Variable[];
  editingVariable: string | null;
  editingVariableName: string;
  onStartEditing: (id: string, name: string) => void;
  onFinishEditing: () => void;
  onCancelEditing: () => void;
  onNameChange: (name: string) => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  onTypeChange: (id: string, type: IOType) => void;
  onDelete: (id: string) => void;
  onAddVariable: () => void;
  onDragStart: (e: React.DragEvent, variable: Variable, nodeType: 'get' | 'set') => void;
}

const VariableTabs: React.FC<VariableTabsProps> = (props) => {
  return (
    <div className={styles.variablesSection}>
      <div className={styles.variablesSectionTitle}>
        Variables
      </div>
      <VariablesList {...props} />
    </div>
  );
};

export default VariableTabs;