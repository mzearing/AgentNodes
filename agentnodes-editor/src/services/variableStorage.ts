import { Variable } from '../types/project';

// Variables are now stored per-canvas in the project state
// This service provides a simple interface for managing variables
export const variableStorage = {
  // These are now no-ops since variables are managed in project state
  saveVariables: (variables: Variable[]): void => {
    // Variables are automatically saved with project state
    console.log('Variables will be saved with project state:', variables.length);
  },

  loadVariables: (): Variable[] => {
    // Variables are loaded from project state
    return [];
  },

  clearVariables: (): void => {
    // Variables are cleared by updating project state
    console.log('Variables cleared via project state');
  }
};