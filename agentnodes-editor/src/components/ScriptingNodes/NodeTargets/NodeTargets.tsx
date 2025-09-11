import React, { useState } from 'react';
import { Position, Handle } from '@xyflow/react';
import styles from './NodeTargets.module.css';

interface NodeTargetsProps {
  inputs: string[];
  variadic?: boolean;
  onInputsChange?: (inputs: string[]) => void;
}

const NodeTargets: React.FC<NodeTargetsProps> = ({ inputs, variadic = false, onInputsChange }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const handleRename = (index: number, newName: string) => {
    if (onInputsChange) {
      const newInputs = [...inputs];
      newInputs[index] = newName;
      onInputsChange(newInputs);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleAdd = () => {
    if (onInputsChange) {
      const newInputs = [...inputs, `Input ${inputs.length + 1}`];
      onInputsChange(newInputs);
    }
  };

  const handleRemove = (index: number) => {
    if (onInputsChange && inputs.length > 0) {
      const newInputs = inputs.filter((_, i) => i !== index);
      onInputsChange(newInputs);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(inputs[index]);
  };

  return (
    <div className={styles.nodeTargets}>
      {inputs.map((input, index) => (
        <div key={`${input}-${index}`} className={styles.inputBox}>
          {editingIndex === index ? (
            <input
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              onBlur={() => handleRename(index, editingValue)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename(index, editingValue);
                } else if (e.key === 'Escape') {
                  setEditingIndex(null);
                  setEditingValue('');
                }
              }}
              autoFocus
              className={styles.inputEdit}
            />
          ) : (
            <span 
              className={styles.inputLabel}
              onDoubleClick={() => variadic && startEditing(index)}
            >
              {input}
            </span>
          )}
          {variadic && (
            <button
              className={styles.removeButton}
              onClick={() => handleRemove(index)}
              title="Remove input"
            >
              ×
            </button>
          )}
          <Handle 
            id={`${input}-${index}`} 
            type="target"
            position={Position.Left}
            className={styles.inputHandle}
          />
        </div>
      ))}
      {variadic && (
        <div className={styles.addInputBox}>
          <button
            className={styles.addButton}
            onClick={handleAdd}
            title="Add input"
          >
            + Add Input
          </button>
        </div>
      )}
    </div>
  );
};

export default NodeTargets;