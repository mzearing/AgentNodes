import { useState, useCallback, useRef } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Variable } from '../types/project';

interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  variables: Variable[];
  projectName?: string;
  timestamp: number;
}

interface HistoryState {
  past: CanvasState[];
  present: CanvasState | null;
  future: CanvasState[];
}

const HISTORY_LIMIT = 50;
const DEBOUNCE_DELAY = 500; // ms

/**
 * Custom hook for managing canvas history (undo/redo functionality)
 */
export const useCanvasHistory = () => {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: null,
    future: []
  });

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSavedState = useRef<string | null>(null);

  /**
   * Save current state to history with debouncing
   */
  const saveState = useCallback((nodes: Node[], edges: Edge[], variables: Variable[] = [], projectName?: string, immediate = false) => {
    const newState: CanvasState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      variables: JSON.parse(JSON.stringify(variables)),
      projectName,
      timestamp: Date.now()
    };

    // Create a hash of the state to avoid duplicate saves
    const stateHash = hashState(newState);
    if (stateHash === lastSavedState.current) {
      return; // No changes to save
    }

    const saveStateFn = () => {
      lastSavedState.current = stateHash;
      
      setHistory(prevHistory => {
        const newPast = prevHistory.present 
          ? [...prevHistory.past, prevHistory.present]
          : prevHistory.past;

        // Limit history size
        const limitedPast = newPast.slice(-HISTORY_LIMIT);

        return {
          past: limitedPast,
          present: newState,
          future: [] // Clear future when new state is saved
        };
      });
    };

    if (immediate) {
      // Clear any pending debounced save
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      saveStateFn();
    } else {
      // Debounce the save operation
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        saveStateFn();
        debounceTimer.current = null;
      }, DEBOUNCE_DELAY);
    }
  }, []);

  /**
   * Undo the last action
   */
  const undo = useCallback((): { nodes: Node[]; edges: Edge[]; variables: Variable[]; projectName?: string } | null => {
    let result: { nodes: Node[]; edges: Edge[]; variables: Variable[]; projectName?: string } | null = null;

    setHistory(prevHistory => {
      if (prevHistory.past.length === 0 || !prevHistory.present) {
        return prevHistory; // Nothing to undo
      }

      const previous = prevHistory.past[prevHistory.past.length - 1];
      const newPast = prevHistory.past.slice(0, -1);

      result = {
        nodes: JSON.parse(JSON.stringify(previous.nodes)),
        edges: JSON.parse(JSON.stringify(previous.edges)),
        variables: JSON.parse(JSON.stringify(previous.variables)),
        projectName: previous.projectName
      };

      return {
        past: newPast,
        present: previous,
        future: [prevHistory.present, ...prevHistory.future]
      };
    });

    return result;
  }, []);

  /**
   * Redo the next action
   */
  const redo = useCallback((): { nodes: Node[]; edges: Edge[]; variables: Variable[]; projectName?: string } | null => {
    let result: { nodes: Node[]; edges: Edge[]; variables: Variable[]; projectName?: string } | null = null;

    setHistory(prevHistory => {
      if (prevHistory.future.length === 0 || !prevHistory.present) {
        return prevHistory; // Nothing to redo
      }

      const next = prevHistory.future[0];
      const newFuture = prevHistory.future.slice(1);

      result = {
        nodes: JSON.parse(JSON.stringify(next.nodes)),
        edges: JSON.parse(JSON.stringify(next.edges)),
        variables: JSON.parse(JSON.stringify(next.variables)),
        projectName: next.projectName
      };

      return {
        past: [...prevHistory.past, prevHistory.present],
        present: next,
        future: newFuture
      };
    });

    return result;
  }, []);

  /**
   * Check if undo is available
   */
  const canUndo = useCallback((): boolean => {
    return history.past.length > 0 && history.present !== null;
  }, [history.past.length, history.present]);

  /**
   * Check if redo is available
   */
  const canRedo = useCallback((): boolean => {
    return history.future.length > 0;
  }, [history.future.length]);

  /**
   * Clear all history
   */
  const clearHistory = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    
    lastSavedState.current = null;
    
    setHistory({
      past: [],
      present: null,
      future: []
    });
  }, []);

  /**
   * Initialize history with current state
   */
  const initializeHistory = useCallback((nodes: Node[], edges: Edge[], variables: Variable[] = [], projectName?: string) => {
    const initialState: CanvasState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      variables: JSON.parse(JSON.stringify(variables)),
      projectName,
      timestamp: Date.now()
    };

    lastSavedState.current = hashState(initialState);

    setHistory({
      past: [],
      present: initialState,
      future: []
    });
  }, []);

  /**
   * Get history statistics
   */
  const getHistoryInfo = useCallback(() => {
    return {
      pastCount: history.past.length,
      futureCount: history.future.length,
      canUndo: canUndo(),
      canRedo: canRedo(),
      present: history.present ? {
        nodeCount: history.present.nodes.length,
        edgeCount: history.present.edges.length,
        timestamp: history.present.timestamp
      } : null
    };
  }, [history, canUndo, canRedo]);

  return {
    saveState,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    initializeHistory,
    getHistoryInfo
  };
};

/**
 * Create a simple hash of the canvas state to detect changes
 */
const hashState = (state: CanvasState): string => {
  const stateStr = JSON.stringify({
    nodeCount: state.nodes.length,
    edgeCount: state.edges.length,
    nodeIds: state.nodes.map(n => n.id).sort(),
    edgeIds: state.edges.map(e => e.id).sort(),
    nodePositions: state.nodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
    // Include node data to track label, input/output changes
    nodeData: state.nodes.map(n => ({
      id: n.id,
      label: n.data?.label,
      inputs: n.data?.inputs,
      outputs: n.data?.outputs,
      constantValues: n.data?.constantValues,
      variableId: n.data?.variableId,
      variableName: n.data?.variableName
    })),
    // Include edge properties for connection strength changes
    edgeData: state.edges.map(e => ({
      id: e.id,
      strong: e.strong,
      className: e.className
    })),
    variables: state.variables,
    projectName: state.projectName
  });
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < stateStr.length; i++) {
    const char = stateStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
};