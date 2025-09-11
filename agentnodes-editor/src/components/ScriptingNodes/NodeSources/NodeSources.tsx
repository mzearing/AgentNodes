import React, { useState } from 'react';
import { Position, Handle } from '@xyflow/react';
import styles from './NodeSources.module.css';

interface NodeSourcesProps {
  outputs: string[];
  variadic?: boolean;
  onOutputsChange?: (outputs: string[]) => void;
}

const NodeSources: React.FC<NodeSourcesProps> = ({ outputs, variadic = false, onOutputsChange }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const handleRename = (index: number, newName: string) => {
    if (onOutputsChange) {
      const newOutputs = [...outputs];
      newOutputs[index] = newName;
      onOutputsChange(newOutputs);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleAdd = () => {
    if (onOutputsChange) {
      const newOutputs = [...outputs, `Output ${outputs.length + 1}`];
      onOutputsChange(newOutputs);
    }
  };

  const handleRemove = (index: number) => {
    if (onOutputsChange && outputs.length > 0) {
      const newOutputs = outputs.filter((_, i) => i !== index);
      onOutputsChange(newOutputs);
    }
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingValue(outputs[index]);
  };

  return (
    <div className={styles.nodeSources}>
      {outputs.map((output, index) => (
        <div key={`${output}-${index}`} className={styles.outputBox}>
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
              className={styles.outputEdit}
            />
          ) : (
            <span 
              className={styles.outputLabel}
              onDoubleClick={() => variadic && startEditing(index)}
            >
              {output}
            </span>
          )}
          {variadic && (
            <button
              className={styles.removeButton}
              onClick={() => handleRemove(index)}
              title="Remove output"
            >
              ×
            </button>
          )}
          <Handle 
            id={`${output}-${index}`} 
            type="source"
            position={Position.Right}
            className={styles.outputHandle}
          />
        </div>
      ))}
      {variadic && (
        <div className={styles.addOutputBox}>
          <button
            className={styles.addButton}
            onClick={handleAdd}
            title="Add output"
          >
            + Add Output
          </button>
        </div>
      )}
    </div>
  );
};

export default NodeSources;