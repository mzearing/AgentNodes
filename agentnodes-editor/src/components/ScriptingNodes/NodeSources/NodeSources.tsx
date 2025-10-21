import React, { useState, DragEvent, memo } from 'react';
import { Position, Handle } from '@xyflow/react';
import styles from './NodeSources.module.css';
import { OutputHandle } from '../ScriptingNode';

interface NodeSourcesProps {
  outputs: OutputHandle[];
  variadic?: boolean;
  onOutputsChange?: (outputs: OutputHandle[]) => void;
}

const NodeSources: React.FC<NodeSourcesProps> = memo(({ outputs, variadic = false, onOutputsChange }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleRename = (index: number, newName: string) => {
    if (onOutputsChange) {
      const newOutputs = [...outputs];
      newOutputs[index] = { ...newOutputs[index], name: newName };
      onOutputsChange(newOutputs);
    }
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleAdd = () => {
    if (onOutputsChange) {
      const newOutput: OutputHandle = {
        id: `output-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: `Output ${outputs.length + 1}`
      };
      const newOutputs = [...outputs, newOutput];
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
    setEditingValue(outputs[index].name);
  };

  const handleDragStart = (e: DragEvent, index: number) => {
    // Check if mouse is near the handle area (right side, within 30px from right edge)
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const boxWidth = rect.width;
    
    if (mouseX > boxWidth - 32) {
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
    e.dataTransfer.setData('application/node-output-reorder', 'true');
    // Clear any data that might trigger node dragging
    e.dataTransfer.clearData('application/reactflow');
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('application/node-output-reorder')) {
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
    
    if (!e.dataTransfer.types.includes('application/node-output-reorder')) {
      return;
    }
    
    const dragIndex = draggedIndex;
    
    if (dragIndex !== null && dragIndex !== dropIndex && onOutputsChange) {
      const newOutputs = [...outputs];
      const draggedItem = newOutputs[dragIndex];
      newOutputs.splice(dragIndex, 1);
      newOutputs.splice(dropIndex, 0, draggedItem);
      onOutputsChange(newOutputs);
    }
    
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className={`${styles.nodeSources} nodrag`}>
      {outputs.map((output, index) => (
        <div 
          key={output.id} 
          className={`${styles.outputBox} ${draggedIndex === index ? styles.dragging : ''} ${dragOverIndex === index ? styles.dragOver : ''} nodrag`}
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
              className={styles.outputEdit}
            />
          ) : (
            <>
              {variadic && (
                <button
                  className={styles.removeButton}
                  onClick={() => handleRemove(index)}
                  title="Remove output"
                >
                  ×
                </button>
              )}
              {variadic && (
                <button
                  className={styles.editButton}
                  onClick={() => startEditing(index)}
                  title="Edit output name"
                >
                  ✎
                </button>
              )}
              <span 
                className={styles.outputLabel}
              >
                {output.name}
              </span>
            </>
          )}
          <Handle 
            id={output.id} 
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
            title="Add new socket"
          >
            <span className={styles.addIcon}>+</span>
          </button>
        </div>
      )}
    </div>
  );
});

export default NodeSources;