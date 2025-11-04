import React from 'react';
import styles from './NodeData.module.css';
import { IOType } from '../../../types/project';

interface ConstantDataValue {
  type: IOType;
  value: string | number | boolean;
}

interface NodeDataProps {
  constantData: IOType[];
  constantValues?: ConstantDataValue[];
  onConstantValuesChange?: (values: ConstantDataValue[]) => void;
}

const getDefaultValue = (type: IOType): string | number | boolean => {
  switch (type) {
    case IOType.Integer:
      return 0;
    case IOType.Float:
      return 0.0;
    case IOType.String:
      return '';
    case IOType.Boolean:
      return false;
    default:
      return '';
  }
};

const NodeData: React.FC<NodeDataProps> = ({
  constantData,
  constantValues = [],
  onConstantValuesChange
}) => {
  const getValue = React.useCallback((index: number, type: IOType): string | number | boolean => {
    const existingValue = constantValues[index];
    if (existingValue && existingValue.type === type) {
      return existingValue.value;
    }
    return getDefaultValue(type);
  }, [constantValues]);

  const handleValueChange = React.useCallback((index: number, newValue: string | number | boolean, type: IOType) => {
    if (!onConstantValuesChange) return;
    
    const newValues = [...constantValues];
    // Ensure array is large enough
    while (newValues.length <= index) {
      newValues.push({ type: IOType.None, value: '' });
    }
    newValues[index] = { type, value: newValue };
    onConstantValuesChange(newValues);
  }, [constantValues, onConstantValuesChange]);

  const renderInput = React.useCallback((type: IOType, index: number) => {
    const value = getValue(index, type);
    
    switch (type) {
      case IOType.Integer:
        return (
          <input
            type="number"
            step="1"
            value={Number(value)}
            onChange={(e) => handleValueChange(index, parseInt(e.target.value) || 0, type)}
            className={styles.numberInput}
            placeholder="0"
          />
        );
      case IOType.Float:
        return (
          <input
            type="number"
            step="0.01"
            value={Number(value)}
            onChange={(e) => handleValueChange(index, parseFloat(e.target.value) || 0.0, type)}
            className={styles.numberInput}
            placeholder="0.0"
          />
        );
      case IOType.String:
        return (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleValueChange(index, e.target.value, type)}
            className={styles.textInput}
            placeholder="Enter text"
          />
        );
      case IOType.Boolean:
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleValueChange(index, e.target.checked, type)}
            className={styles.checkboxInput}
          />
        );
      default:
        return null;
    }
  }, [getValue, handleValueChange]);

  if (constantData.length === 0 || constantData.every(type => type === IOType.None)) {
    return null;
  }

  return (
    <div className={`${styles.nodeData} nodrag`}>
      <div className={styles.constantDataContainer}>
        {constantData.map((type, index) => {
          if (type === IOType.None) return null;
          
          return (
            <div key={index} className={styles.constantDataItem}>
              {renderInput(type, index)}
            </div>
          );
        }).filter(Boolean)}
      </div>
    </div>
  );
};

export default NodeData;