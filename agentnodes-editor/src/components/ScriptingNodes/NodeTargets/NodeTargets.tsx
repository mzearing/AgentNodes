import React, { useState, DragEvent } from 'react';
import { Position, Handle } from '@xyflow/react';
import styles from './NodeTargets.module.css';
import { InputHandle } from '../ScriptingNode';

interface NodeTargetsProps {
  inputs: InputHandle[];
  variadic?: boolean;
  onInputsChange?: (inputs: InputHandle[]) => void;
}

const NodeTargets: React.FC<NodeTargetsProps> = ({ inputs, variadic = false, onInputsChange }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleRename = (index: number, newName: string) => {
    if (onInputsChange) {
      const newInputs = [...inputs];
      newInputs[index] = { ...newInputs[index], name: newName };
      onInputsChange(newInputs);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleAdd = () => {
    if (onInputsChange) {
      const newInput: InputHandle = {
        id: `input-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: `Input ${inputs.length + 1}`
      };
      const newInputs = [...inputs, newInput];
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
    setEditingValue(inputs[index].name);
  };

  const handleDragStart = (e: DragEvent, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    
    if (mouseX < 32) {
      // Mouse is near the handle, prevent dragging
      e.preventDefault();
      return;
    }
    
    e.stopPropagation();
    // Cast to native event to access stopImmediatePropagation
    (e.nativeEvent as Event).stopImmediatePropagation?.();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.setData('application/node-input-reorder', 'true');
    // Clear any data that might trigger node dragging
    e.dataTransfer.clearData('application/reactflow');
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Only allow drop if this is an input reorder operation
    if (e.dataTransfer.types.includes('application/node-input-reorder')) {
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
  };

  const handleDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only handle drop if this is an input reorder operation
    if (!e.dataTransfer.types.includes('application/node-input-reorder')) {
      return;
    }
    
    const dragIndex = draggedIndex;
    
    if (dragIndex !== null && dragIndex !== dropIndex && onInputsChange) {
      const newInputs = [...inputs];
      const draggedItem = newInputs[dragIndex];
      
      // Remove the dragged item
      newInputs.splice(dragIndex, 1);
      newInputs.splice(dropIndex, 0, draggedItem);
      
      onInputsChange(newInputs);
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={`${styles.nodeTargets} nodrag`}>
      {inputs.map((input, index) => (
        <div 
          key={input.id} 
          className={`${styles.inputBox} ${draggedIndex === index ? styles.dragging : ''} ${dragOverIndex === index ? styles.dragOver : ''} nodrag`}
          draggable={variadic}
          onDragStart={(e) => variadic && handleDragStart(e, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => variadic && handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => variadic && handleDrop(e, index)}
          onMouseDown={(e) => variadic && e.stopPropagation()}
          onMouseUp={(e) => {
            if (variadic) {
              e.stopPropagation();
              // Force cleanup of any pending edge connections
              const event = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                clientX: e.clientX,
                clientY: e.clientY
              });
              document.dispatchEvent(event);
            }
          }}
        >
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
            <>
              <span 
                className={styles.inputLabel}
              >
                {input.name}
              </span>
              {variadic && (
                <button
                  className={styles.editButton}
                  onClick={() => startEditing(index)}
                  title="Edit input name"
                >
                  ✎
                </button>
              )}
            </>
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
            id={input.id} 
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
            title="Add new socket"
          >
            <span className={styles.addIcon}>+</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default NodeTargets;