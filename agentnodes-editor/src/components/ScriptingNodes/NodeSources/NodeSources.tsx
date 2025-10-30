import React, { useState, DragEvent, useCallback } from 'react';
import { Position, Handle } from '@xyflow/react';
import styles from './NodeSources.module.css';
import { OutputHandle } from '../ScriptingNode';
import TypeDropdown, { DropdownOption } from '../TypeDropdown/TypeDropdown';
import { IOType } from '../../../types/project';

interface NodeSourcesProps {
  outputs: OutputHandle[];
  variadic?: boolean;
  onOutputsChange?: (outputs: OutputHandle[]) => void;
}

const NodeSources: React.FC<NodeSourcesProps> = ({ outputs, variadic = false, onOutputsChange }) => {
  const [updateKey, setUpdateKey] = useState(0);
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

  const handleTypeChange = useCallback((index: number, typeName: string) => {
    if (onOutputsChange) {
      const typeMap: Record<string, IOType> = {
        'None': IOType.None,
        'Integer': IOType.Integer,
        'Float': IOType.Float,
        'String': IOType.String,
        'Boolean': IOType.Boolean,
      };
      const newType = typeMap[typeName] || IOType.None;
      const newOutputs = [...outputs];
      newOutputs[index] = { ...newOutputs[index], type: newType };
      onOutputsChange(newOutputs);
      // Force re-render of TypeDropdowns
      setUpdateKey(prev => prev + 1);
    }
  }, [outputs, onOutputsChange]);

  const handleAdd = () => {
    if (onOutputsChange) {
      const newOutput: OutputHandle = {
        id: `output-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: `Output ${outputs.length + 1}`,
        type: IOType.None
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

  const typeOptions: DropdownOption[] = [
    { value: 'None', label: 'N', color: '#4A5568', bgColor: '#4A5568', textColor: '#FFFFFF' },
    { value: 'Integer', label: 'I', color: '#BEE3F8', bgColor: '#BEE3F8', textColor: '#000000' },
    { value: 'Float', label: 'F', color: '#C6F6D5', bgColor: '#C6F6D5', textColor: '#000000' },
    { value: 'String', label: 'S', color: '#FF8C00', bgColor: '#FF8C00', textColor: '#FFFFFF' },
    { value: 'Boolean', label: 'B', color: '#E6E6FA', bgColor: '#E6E6FA', textColor: '#000000' },
  ];

  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
          style={{
            '--handle-color': (() => {
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
              const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
              return selectedType.color;
            })(),
            '--handle-shadow': (() => {
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
              const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
              return hexToRgba(selectedType.color, 0.4);
            })(),
            '--handle-text-color': (() => {
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
              const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
              return selectedType.textColor;
            })()
          } as React.CSSProperties}
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
              <TypeDropdown
                key={`${output.id}-${output.type}-${updateKey}`}
                options={typeOptions}
                value={typeOptions.find(opt => {
                  const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                  return opt.value === typeNames[output.type];
                }) || typeOptions[0]}
                onChange={(option) => handleTypeChange(index, option.value)}
                isLocked={!variadic}
              />
            </>
          )}
          <Handle 
            id={output.id} 
            type="source"
            position={Position.Right}
            className={styles.outputHandle}
            style={{
              backgroundColor: (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
                return selectedType.color;
              })(),
              borderColor: (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
                return selectedType.color;
              })(),
              '--handle-color': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
                return selectedType.color;
              })(),
              '--handle-shadow': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
                return hexToRgba(selectedType.color, 0.4);
              })(),
              '--handle-shadow-strong': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean'];
                const selectedType = typeOptions.find(opt => opt.value === typeNames[output.type]) || typeOptions[0];
                return hexToRgba(selectedType.color, 0.6);
              })()
            } as React.CSSProperties}
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
};

export default NodeSources;