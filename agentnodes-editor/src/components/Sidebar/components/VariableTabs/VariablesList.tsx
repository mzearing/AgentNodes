import React from 'react';
import { Variable, IOType } from '../../../../types/project';
import VariableItem from './VariableItem';
import styles from './VariableTabs.module.css';

interface VariablesListProps {
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

const VariablesList: React.FC<VariablesListProps> = ({
  variables,
  editingVariable,
  editingVariableName,
  onStartEditing,
  onFinishEditing,
  onCancelEditing,
  onNameChange,
  onNameKeyDown,
  onTypeChange,
  onDelete,
  onAddVariable,
  onDragStart
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onFinishEditing();
    } else if (e.key === 'Escape') {
      onCancelEditing();
    } else {
      onNameKeyDown(e);
    }
  };

  return (
    <div className={styles.variablesList}>
      {variables.map((variable) => (
        <VariableItem
          key={variable.id}
          variable={variable}
          isEditing={editingVariable === variable.id}
          editingName={editingVariableName}
          onStartEditing={onStartEditing}
          onFinishEditing={onFinishEditing}
          onCancelEditing={onCancelEditing}
          onNameChange={onNameChange}
          onNameKeyDown={handleKeyDown}
          onTypeChange={onTypeChange}
          onDelete={onDelete}
          onDragStart={onDragStart}
        />
      ))}
      <button
        onClick={onAddVariable}
        className={styles.addVariableButton}
      >
        <span>+</span>
        Add Variable
      </button>
    </div>
  );
};

export default VariablesList;