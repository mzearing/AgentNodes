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
    if (isInitialized) {
      onVariablesChangeRef.current?.(newVariables);
    }
  }, [isInitialized]);

  const addVariable = useCallback(() => {
    const newVariable: Variable = {
      id: `var_${Date.now()}`,
      name: `Variable ${variables.length + 1}`,
      type: IOType.String,
      defaultValue: ''
    };
    updateVariables([...variables, newVariable]);
  }, [variables, updateVariables]);

  const deleteVariable = useCallback((variableId: string) => {
    const newVariables = variables.filter(v => v.id !== variableId);
    updateVariables(newVariables);
  }, [variables, updateVariables]);

  const updateVariable = useCallback((variableId: string, updates: Partial<Variable>) => {
    const newVariables = variables.map(v => 
      v.id === variableId ? { ...v, ...updates } : v
    );
    updateVariables(newVariables);
  }, [variables, updateVariables]);

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