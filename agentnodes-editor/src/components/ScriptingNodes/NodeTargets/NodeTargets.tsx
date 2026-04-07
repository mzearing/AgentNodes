import React, { useState, DragEvent, useCallback } from 'react';
import { Position, Handle as HandleComponent } from '@xyflow/react';
import styles from './NodeTargets.module.css';
import { InputHandle } from '../ScriptingNode';
import TypeDropdown, { DropdownOption } from '../TypeDropdown/TypeDropdown';
import { IOType } from '../../../types/project';
import { allTypeOptions, hexToRgba } from '../../../utils/typeColors';

interface NodeTargetsProps {
  inputs: InputHandle[];
  variadic?: boolean;
  multitype?: boolean;
  availableTypes?: (IOType[] | undefined)[];
  onInputsChange?: (inputs: InputHandle[]) => void;
}

const NodeTargets: React.FC<NodeTargetsProps> = ({ inputs, variadic = false, multitype = false, availableTypes, onInputsChange }) => {
  const [updateKey, setUpdateKey] = useState(0);
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

  const handleTypeChange = useCallback((index: number, typeName: string) => {
    if (onInputsChange) {
      const typeMap: Record<string, IOType> = {
        'None': IOType.None,
        'Integer': IOType.Integer,
        'Float': IOType.Float,
        'String': IOType.String,
        'Boolean': IOType.Boolean,
        'Agent': IOType.Agent,
      };
      const newType = typeMap[typeName] || IOType.None;
      const newInputs = [...inputs];
      newInputs[index] = { ...newInputs[index], type: newType };
      onInputsChange(newInputs);
      // Force re-render of TypeDropdowns
      setUpdateKey(prev => prev + 1);
    }
  }, [inputs, onInputsChange]);

  const handleAdd = () => {
    if (onInputsChange) {
      const newInput: InputHandle = {
        id: `input-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        name: `Input ${inputs.length + 1}`,
        type: IOType.Integer
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
    const mouseY = e.clientY - rect.top;
    
    if (mouseY < 32) {
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


  // Function to get available type options for specific inputs based on type arrays
  const getAvailableTypeOptions = (inputIndex: number): DropdownOption[] => {
    if (!multitype || !availableTypes) {
      return allTypeOptions.filter(option => option.value !== 'None');
    }

    const availableTypesForInput = availableTypes[inputIndex];
    if (!availableTypesForInput || availableTypesForInput.length === 0) {
      return allTypeOptions.filter(option => option.value !== 'None');
    }

    // Filter type options to only show available ones, always exclude None
    return allTypeOptions.filter(option => {
      if (option.value === 'None') return false;
      const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
      const typeIndex = typeNames.indexOf(option.value);
      return availableTypesForInput.includes(typeIndex as IOType);
    });
  };


  return (
    <div className={`${styles.nodeTargets} nodrag`}>
      {inputs.map((input, index) => (
        <div 
          key={input.id} 
          className={`${styles.inputBox} ${input.type === IOType.None && !multitype ? styles.noneType : ''} ${draggedIndex === index ? styles.dragging : ''} ${dragOverIndex === index ? styles.dragOver : ''} nodrag`}
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
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
              const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
              return selectedType.color;
            })(),
            '--handle-shadow': (() => {
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
              const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
              return hexToRgba(selectedType.color, 0.4);
            })(),
            '--handle-text-color': (() => {
              const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
              const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
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
              className={styles.inputEdit}
            />
          ) : (
            <>
              {!(input.type === IOType.None && !multitype) && (
                <TypeDropdown
                  key={`${input.id}-${input.type}-${updateKey}`}
                  options={getAvailableTypeOptions(index)}
                  value={(() => {
                    const availableOptions = getAvailableTypeOptions(index);
                    const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                    return availableOptions.find(opt => opt.value === typeNames[input.type]) || availableOptions[0];
                  })()}
                  onChange={(option) => handleTypeChange(index, option.value)}
                  isLocked={!multitype}
                />
              )}
              <span 
                className={`${styles.inputLabel} ${input.type === IOType.None && !multitype ? styles.noneTypeLabel : ''}`}
              >
                {input.name}
              </span>
              {variadic && (
                <div className={styles.buttonStack}>
                  <button
                    className={styles.removeButton}
                    onClick={() => handleRemove(index)}
                    title="Remove input"
                  >
                    ×
                  </button>
                  <button
                    className={styles.editButton}
                    onClick={() => startEditing(index)}
                    title="Edit input name"
                  >
                    ✎
                  </button>
                </div>
              )}
            </>
          )}
          <HandleComponent 
            id={input.id} 
            type="target"
            position={Position.Top}
            className={styles.inputHandle}
            style={{
              backgroundColor: (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
                return selectedType.color;
              })(),
              borderColor: (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
                return selectedType.color;
              })(),
              '--handle-color': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
                return selectedType.color;
              })(),
              '--handle-shadow': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
                return hexToRgba(selectedType.color, 0.4);
              })(),
              '--handle-shadow-strong': (() => {
                const typeNames = ['None', 'Integer', 'Float', 'String', 'Boolean', 'Handle', 'Array', 'Byte', 'Object', 'Agent'];
                const selectedType = allTypeOptions.find(opt => opt.value === typeNames[input.type]) || allTypeOptions[0];
                return hexToRgba(selectedType.color, 0.6);
              })()
            } as React.CSSProperties}
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