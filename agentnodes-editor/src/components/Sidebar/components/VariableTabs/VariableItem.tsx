import React from 'react';
import { Variable, IOType } from '../../../../types/project';
import TypeDropdown, { DropdownOption } from '../../../ScriptingNodes/TypeDropdown/TypeDropdown';
import styles from './VariableTabs.module.css';

interface VariableItemProps {
  variable: Variable;
  isEditing: boolean;
  editingName: string;
  onStartEditing: (id: string, name: string) => void;
  onFinishEditing: () => void;
  onCancelEditing: () => void;
  onNameChange: (name: string) => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  onTypeChange: (id: string, type: IOType) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, variable: Variable, nodeType: 'get' | 'set') => void;
}

const VariableItem: React.FC<VariableItemProps> = ({
  variable,
  isEditing,
  editingName,
  onStartEditing,
  onFinishEditing,
  onCancelEditing: _onCancelEditing,
  onNameChange,
  onNameKeyDown,
  onTypeChange,
  onDelete,
  onDragStart
}) => {
  // Type options matching those used in ScriptingNodes
  const typeOptions: DropdownOption[] = [
    { value: 'None', label: 'N', color: '#4A5568', bgColor: '#4A5568', textColor: '#FFFFFF' },
    { value: 'Integer', label: 'I', color: '#BEE3F8', bgColor: '#BEE3F8', textColor: '#000000' },
    { value: 'Float', label: 'F', color: '#C6F6D5', bgColor: '#C6F6D5', textColor: '#000000' },
    { value: 'String', label: 'S', color: '#FED7D7', bgColor: '#FED7D7', textColor: '#000000' },
    { value: 'Boolean', label: 'B', color: '#E9D8FD', bgColor: '#E9D8FD', textColor: '#000000' }
  ];

  const getTypeNameFromIOType = (type: IOType): string => {
    switch (type) {
      case IOType.Integer: return 'Integer';
      case IOType.Float: return 'Float';
      case IOType.String: return 'String';
      case IOType.Boolean: return 'Boolean';
      default: return 'None';
    }
  };

  const getIOTypeFromString = (typeName: string): IOType => {
    switch (typeName) {
      case 'Integer': return IOType.Integer;
      case 'Float': return IOType.Float;
      case 'String': return IOType.String;
      case 'Boolean': return IOType.Boolean;
      default: return IOType.None;
    }
  };

  const currentTypeOption = typeOptions.find(
    option => option.value === getTypeNameFromIOType(variable.type)
  ) || typeOptions[0];

  const handleDelete = () => {
    if (window.confirm(`Delete variable "${variable.name}"? This will remove all related get/set nodes from the canvas.`)) {
      onDelete(variable.id);
    }
  };

  return (
    <div className={styles.variableItem}>
      <div className={styles.variableContent}>
        <div className={styles.variableName}>
          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={onNameKeyDown}
              onBlur={onFinishEditing}
              className={styles.variableNameInput}
              autoFocus
            />
          ) : (
            <span 
              onClick={() => onStartEditing(variable.id, variable.name)}
              className={styles.variableNameText}
            >
              {variable.name}
            </span>
          )}
        </div>
        
        <div className={styles.variableActions}>
          <div className={styles.variableType}>
            <TypeDropdown
              options={typeOptions}
              value={currentTypeOption}
              onChange={(option) => onTypeChange(variable.id, getIOTypeFromString(option.value))}
            />
          </div>
          
          <button
            onClick={handleDelete}
            className={styles.deleteButton}
            title="Delete variable"
          >
            ×
          </button>
        </div>
      </div>
      
      <div className={styles.variableControls}>
        <div className={styles.variableDraggers}>
          <div
            className={`${styles.dragger} ${styles.getDragger}`}
            draggable
            onDragStart={(e) => onDragStart(e, variable, 'get')}
            title="Drag to create Get node"
          >
            Get <span className={styles.dragIndicator}>⋮</span>
          </div>
          <div
            className={`${styles.dragger} ${styles.setDragger}`}
            draggable
            onDragStart={(e) => onDragStart(e, variable, 'set')}
            title="Drag to create Set node"
          >
            Set <span className={styles.dragIndicator}>⋮</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VariableItem;