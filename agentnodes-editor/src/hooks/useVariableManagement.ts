import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Variable, IOType } from '../types/project';
import { variableStorage } from '../services/variableStorage';

interface VariableManagementOptions {
  onVariablesChange?: (variables: Variable[]) => void;
}

export const useVariableManagement = (initialVariables: Variable[] = [], options: VariableManagementOptions = {}) => {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [editingVariable, setEditingVariable] = useState<string | null>(null);
  const [editingVariableName, setEditingVariableName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const { onVariablesChange } = options;
  const onVariablesChangeRef = useRef(onVariablesChange);
  onVariablesChangeRef.current = onVariablesChange;
  const memoizedInitialVariables = useMemo(() => initialVariables, [initialVariables.length, JSON.stringify(initialVariables)]);
  const previousVariablesRef = useRef<Variable[]>([]);
  useEffect(() => {
    const hasChanged = 
      memoizedInitialVariables.length !== previousVariablesRef.current.length ||
      JSON.stringify(memoizedInitialVariables) !== JSON.stringify(previousVariablesRef.current);
    
    if (hasChanged) {
      setVariables(memoizedInitialVariables);
      previousVariablesRef.current = memoizedInitialVariables;
      setIsInitialized(true);
    }
  }, [memoizedInitialVariables]);

  const updateVariables = useCallback((newVariables: Variable[]) => {
    setVariables(newVariables);
    variableStorage.saveVariables(newVariables);
    onVariablesChangeRef.current?.(newVariables);
  }, []);

  const addVariable = useCallback(() => {
    setVariables(prevVariables => {
      const newVariable: Variable = {
        id: `var_${Date.now()}`,
        name: `Variable ${prevVariables.length + 1}`,
        type: IOType.String,
        defaultValue: ''
      };
      const newVariables = [...prevVariables, newVariable];
      variableStorage.saveVariables(newVariables);
      onVariablesChangeRef.current?.(newVariables);
      return newVariables;
    });
  }, []);

  const deleteVariable = useCallback((variableId: string) => {
    setVariables(prevVariables => {
      const newVariables = prevVariables.filter(v => v.id !== variableId);
      variableStorage.saveVariables(newVariables);
      onVariablesChangeRef.current?.(newVariables);
      return newVariables;
    });
  }, []);

  const updateVariable = useCallback((variableId: string, updates: Partial<Variable>) => {
    setVariables(prevVariables => {
      const newVariables = prevVariables.map(v => 
        v.id === variableId ? { ...v, ...updates } : v
      );
      variableStorage.saveVariables(newVariables);
      onVariablesChangeRef.current?.(newVariables);
      return newVariables;
    });
  }, []);

  const startEditingVariable = useCallback((variableId: string, currentName: string) => {
    setEditingVariable(variableId);
    setEditingVariableName(currentName);
  }, []);

  const finishEditingVariable = useCallback(() => {
    if (editingVariable && editingVariableName.trim()) {
      updateVariable(editingVariable, { name: editingVariableName.trim() });
    }
    setEditingVariable(null);
    setEditingVariableName('');
  }, [editingVariable, editingVariableName, updateVariable]);

  const cancelEditingVariable = useCallback(() => {
    setEditingVariable(null);
    setEditingVariableName('');
  }, []);

  return {
    variables,
    editingVariable,
    editingVariableName,
    setEditingVariableName,
    addVariable,
    deleteVariable,
    updateVariable,
    startEditingVariable,
    finishEditingVariable,
    cancelEditingVariable
  };
};