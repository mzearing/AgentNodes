import React, { useState, useCallback, useEffect } from 'react';
import styles from './RunParametersDialog.module.css';
import { IOType } from '../../types/project';

export interface RunParam {
  name: string;
  type: IOType;
}

interface RunParametersDialogProps {
  isOpen: boolean;
  params: RunParam[];
  onRun: (values: (string | number | boolean)[]) => void;
  onCancel: () => void;
}

const getDefaultValue = (type: IOType): string | number | boolean => {
  switch (type) {
    case IOType.Integer: return 0;
    case IOType.Float: return 0.0;
    case IOType.String: return '';
    case IOType.Boolean: return false;
    default: return '';
  }
};

const getTypeName = (type: IOType): string => {
  switch (type) {
    case IOType.Integer: return 'Integer';
    case IOType.Float: return 'Float';
    case IOType.String: return 'String';
    case IOType.Boolean: return 'Boolean';
    default: return 'Unknown';
  }
};

const RunParametersDialog: React.FC<RunParametersDialogProps> = ({
  isOpen,
  params,
  onRun,
  onCancel
}) => {
  const [values, setValues] = useState<(string | number | boolean)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setValues(params.map(p => getDefaultValue(p.type)));
    }
  }, [isOpen, params]);

  const handleValueChange = useCallback((index: number, value: string | number | boolean) => {
    setValues(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    onRun(values);
  }, [onRun, values]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  }, [onCancel]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onCancel} onKeyDown={handleKeyDown}>
      <form className={styles.dialog} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3 className={styles.title}>Run Parameters</h3>
        <p className={styles.subtitle}>Provide input values for this program.</p>
        <div className={styles.paramList}>
          {params.map((param, index) => (
            <div key={index} className={styles.paramRow}>
              <label className={styles.paramLabel}>
                {param.name} <span className={styles.paramType}>({getTypeName(param.type)})</span>
              </label>
              <div className={styles.paramInput}>
                {param.type === IOType.Integer && (
                  <input
                    type="number"
                    step="1"
                    value={Number(values[index] ?? 0)}
                    onChange={e => handleValueChange(index, parseInt(e.target.value) || 0)}
                    autoFocus={index === 0}
                  />
                )}
                {param.type === IOType.Float && (
                  <input
                    type="number"
                    step="0.01"
                    value={Number(values[index] ?? 0)}
                    onChange={e => handleValueChange(index, parseFloat(e.target.value) || 0.0)}
                    autoFocus={index === 0}
                  />
                )}
                {param.type === IOType.String && (
                  <input
                    type="text"
                    value={String(values[index] ?? '')}
                    onChange={e => handleValueChange(index, e.target.value)}
                    placeholder="Enter text"
                    autoFocus={index === 0}
                  />
                )}
                {param.type === IOType.Boolean && (
                  <input
                    type="checkbox"
                    checked={Boolean(values[index])}
                    onChange={e => handleValueChange(index, e.target.checked)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.buttons}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={styles.runButton}>
            Run
          </button>
        </div>
      </form>
    </div>
  );
};

export default RunParametersDialog;
