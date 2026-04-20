import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from './App.module.css';
import Canvas, { CanvasMethods } from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';
import Console from '../Console/Console';
import SettingsMenu from '../SettingsMenu/SettingsMenu';
import { ProjectState, IOType } from '../../types/project';
import { sidebarRefreshEmitter, canvasRefreshEmitter } from '../../hooks/useSidebarData';
import { compilationService, CompiledProgram } from '../../services/compilationService';
import { nodeCompilationStatusService } from '../../services/nodeCompilationStatus';
import { configurationService } from '../../services/configurationService';
import { processManagerService } from '../../services/processManagerService';
import RunParametersDialog, { RunParam } from '../RunParametersDialog/RunParametersDialog';


const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [hasProjectLoaded, setHasProjectLoaded] = useState<boolean>(false);
  const [currentProjectState, setCurrentProjectState] = useState<ProjectState | null>(null);
  const [nodePath, setNodePath] = useState<string>(configurationService.getNodeDefinitionsPath());
  const [executablePath, setExecutablePath] = useState<string>(configurationService.getExecutablePath());
  const [isConsoleVisible, setIsConsoleVisible] = useState<boolean>(false);
  const [isProcessRunning, setIsProcessRunning] = useState<boolean>(false);
  const canvasRef = useRef<CanvasMethods>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [showRunParamsDialog, setShowRunParamsDialog] = useState<boolean>(false);
  const [pendingRunData, setPendingRunData] = useState<{
    program: CompiledProgram;
    filePath: string;
    params: RunParam[];
  } | null>(null);

  const handleNodesChange = (newNodes: Node[]) => {
    setNodes(newNodes);
  };

  const handleProjectNameChange = useCallback((newName: string) => {
    setProjectName(newName);
    // Update the canvas project state to reflect the name change
    if (canvasRef.current) {
      const currentState = canvasRef.current.getProjectState();
      if (currentState) {
        const updatedState = {
          ...currentState,
          openedNodeName: newName
        };
        canvasRef.current.setProjectState(updatedState);
      }
    }
  }, []);

  const handleSaveProject = useCallback(async () => {
    if (canvasRef.current) {
      const success = await canvasRef.current.saveProject();
      if (success) {
        console.log('Save successful, emitting sidebar refresh event...');
        // Emit refresh event to force sidebar to reload
        sidebarRefreshEmitter.emit();
      }
    } else {
      alert('Canvas not available');
    }
  }, []);

  const handleLoadProject = useCallback(async (projectState: ProjectState) => {
    if (canvasRef.current) {
      const success = await canvasRef.current.loadProject(projectState);
      if (success) {
        setProjectName(projectState.openedNodeName || '');
        setHasProjectLoaded(true);
        setCurrentProjectState(projectState);
      }
    } else {
      alert('Canvas not available');
    }
  }, []);

  const handleProjectStateChange = useCallback((newProjectState: ProjectState) => {
    setCurrentProjectState(newProjectState);
    // Sync the changes back to the canvas
    if (canvasRef.current) {
      canvasRef.current.setProjectState(newProjectState);
    }
  }, []);

  const handleCompile = useCallback(async (): Promise<boolean> => {
    if (canvasRef.current) {
      const canvasData = canvasRef.current.getCanvasData();
      const projectState = canvasRef.current.getProjectState();
      console.log('Canvas data retrieved:', canvasData);
      if (canvasData && projectState) {
        console.log('Starting compilation with canvas data:', canvasData);
        // Check if we're compiling a complex node
        const isComplexNode = projectState.openedNodePath?.includes('/complex/');
        const compiledFilePath = configurationService.getCompilationPath(projectState.openedNodePath, projectState.openedNodeId);
        const result = await compilationService.compile(canvasData, isComplexNode, compiledFilePath);
        console.log('Compilation result:', result);

        if (result.success && result.data) {
          try {
            // Save compiled.json to the specific node's folder
            const dataStr = JSON.stringify(result.data, null, 2);

            if (window.electronAPI?.writeFile) {
              await window.electronAPI.writeFile(compiledFilePath, dataStr);

              // Clear compilation cache for the compiled node to ensure UI updates
              nodeCompilationStatusService.clearCache();

              console.log(`Compilation successful! File saved to ${compiledFilePath}`);
              return true;
            } else {
              // Fallback to download if electron API not available
              const blob = new Blob([dataStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${projectName || 'compiled_program'}.json`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              alert('Compilation successful! File downloaded (Electron API not available).');
              return true;
            }
          } catch (error) {
            console.error('Failed to save compiled file:', error);
            alert(`Failed to save compiled file: ${error}`);
            return false;
          }
        } else {
          const errorMessage = result.errors?.join('\n') || 'Unknown compilation error';
          console.error('Compilation failed:', result.errors);
          alert(`Compilation failed:\n${errorMessage}`);

          // Log errors to console for debugging
          if (result.errors) {
            result.errors.forEach(error => {
              processManagerService.addCompilationError(error);
            });
          }
          return false;
        }
      } else {
        alert('No canvas data or project state available. Please load a project first.');
        return false;
      }
    } else {
      alert('Canvas not available');
      return false;
    }
  }, [projectName]);

  // Stable callback for sidebar refresh function (no-op since refresh not needed in this component)
  const handleSidebarRefreshReady = useCallback((_refreshFn: () => void) => {
    // No-op: refresh function not needed in this component
  }, []);

  const handlePathChange = useCallback(async (newPath: string) => {
    await configurationService.setNodeDefinitionsPath(newPath);
    setNodePath(newPath);
    console.log('Node definitions path changed to:', newPath);

    // Refresh sidebar to load nodes from new path
    sidebarRefreshEmitter.emit();
  }, []);

  const handleExecutablePathChange = useCallback(async (newPath: string) => {
    await configurationService.setExecutablePath(newPath);
    setExecutablePath(newPath);
    console.log('Executable path changed to:', newPath);
  }, []);

  const handleRunProcess = useCallback(async () => {
    if (isProcessRunning) {
      console.log('Process already running');
      return;
    }

    const executablePath = configurationService.getExecutablePath();
    if (!executablePath) {
      alert('No executable path configured. Please set it in Settings.');
      return;
    }

    if (!canvasRef.current) {
      alert('Canvas not available');
      return;
    }

    const canvasData = canvasRef.current.getCanvasData();
    const projectState = canvasRef.current.getProjectState();
    if (!canvasData || !projectState || !projectState.openedNodePath || !projectState.openedNodeId) {
      alert('No project loaded. Please load a project and compile it first.');
      return;
    }

    // Compile
    const isComplexNode = projectState.openedNodePath?.includes('/complex/');
    const compiledFilePath = configurationService.getCompilationPath(
      projectState.openedNodePath,
      projectState.openedNodeId
    );
    const result = await compilationService.compile(canvasData, isComplexNode, compiledFilePath);

    if (!result.success || !result.data) {
      const errorMessage = result.errors?.join('\n') || 'Unknown compilation error';
      alert(`Compilation failed:\n${errorMessage}`);
      if (result.errors) {
        result.errors.forEach(error => processManagerService.addCompilationError(error));
      }
      return;
    }

    // Check if program has inputs
    if (result.data.inputs.length > 0) {
      // Extract input names and types from the Start node
      const startNode = canvasData.nodes.find(n => (n.data as any)?.nodeId === 'start');
      const startOutputs = (startNode?.data as any)?.outputs || [];
      const params: RunParam[] = startOutputs.map((out: any) => ({
        name: out.name || 'Input',
        type: out.type ?? IOType.String
      }));

      setPendingRunData({ program: result.data, filePath: compiledFilePath, params });
      setShowRunParamsDialog(true);
      return;
    }

    // No inputs needed — write compiled file and run immediately
    try {
      if (window.electronAPI?.writeFile) {
        await window.electronAPI.writeFile(compiledFilePath, JSON.stringify(result.data, null, 2));
        nodeCompilationStatusService.clearCache();
      }
    } catch (error) {
      alert(`Failed to save compiled file: ${error}`);
      return;
    }

    setIsConsoleVisible(true);
    const success = await processManagerService.startProcess(executablePath, [
      compiledFilePath,
      '--print-output'
    ]);
    if (success) {
      setIsProcessRunning(true);
    }
  }, [isProcessRunning]);

  const handleRunWithParams = useCallback(async (values: (string | number | boolean)[]) => {
    setShowRunParamsDialog(false);
    if (!pendingRunData) return;

    const executablePath = configurationService.getExecutablePath();
    if (!executablePath) return;

    // Bake the input values into the compiled program
    const bakedProgram = compilationService.bakeInputValues(pendingRunData.program, values);

    try {
      if (window.electronAPI?.writeFile) {
        await window.electronAPI.writeFile(
          pendingRunData.filePath,
          JSON.stringify(bakedProgram, null, 2)
        );
        nodeCompilationStatusService.clearCache();
      }
    } catch (error) {
      alert(`Failed to save compiled file: ${error}`);
      setPendingRunData(null);
      return;
    }

    setIsConsoleVisible(true);
    const success = await processManagerService.startProcess(executablePath, [
      pendingRunData.filePath,
      '--print-output'
    ]);
    if (success) {
      setIsProcessRunning(true);
    }
    setPendingRunData(null);
  }, [pendingRunData]);

  const handleCancelRunParams = useCallback(() => {
    setShowRunParamsDialog(false);
    setPendingRunData(null);
  }, []);

  const handleStopProcess = useCallback(async () => {
    if (!isProcessRunning) {
      console.log('No process running');
      return;
    }

    const success = await processManagerService.stopProcess();
    if (success) {
      setIsProcessRunning(false);
    }
  }, [isProcessRunning]);

  const handleToggleConsole = useCallback(() => {
    setIsConsoleVisible(prev => !prev);
  }, []);

  // Listen for canvas refresh events to reload the current project when dependencies change
  useEffect(() => {
    const unsubscribe = canvasRefreshEmitter.subscribe(async () => {
      console.log('Canvas refresh event received, reloading current project...');
      if (canvasRef.current && hasProjectLoaded) {
        await canvasRef.current.reloadCurrentProject();
      }
    });

    return unsubscribe;
  }, [hasProjectLoaded]);

  // Listen for path configuration changes
  useEffect(() => {
    const unsubscribeNodePath = configurationService.onNodePathChange((newPath) => {
      setNodePath(newPath);
      // Refresh sidebar when path changes
      sidebarRefreshEmitter.emit();
    });

    const unsubscribeExecutablePath = configurationService.onExecutablePathChange((newPath) => {
      setExecutablePath(newPath);
    });

    return () => {
      unsubscribeNodePath();
      unsubscribeExecutablePath();
    };
  }, []);

  // Initialize configuration on startup
  useEffect(() => {
    const initializeConfig = async () => {
      await configurationService.ensureInitialized();
      const currentPath = configurationService.getNodeDefinitionsPath();
      const currentExecutablePath = configurationService.getExecutablePath();
      setNodePath(currentPath);
      setExecutablePath(currentExecutablePath);

      // Initial sidebar refresh to load nodes from configured path
      sidebarRefreshEmitter.emit();
    };

    initializeConfig();
  }, []);

  // Monitor process state changes
  useEffect(() => {
    setIsProcessRunning(processManagerService.isProcessRunning());

    const unsubscribe = processManagerService.onOutput((output) => {
      if (output.type === 'exit' || output.type === 'error') {
        setIsProcessRunning(false);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <div className={isConsoleVisible ? styles.app : styles.appWithoutConsole}>
      <Sidebar
        nodes={nodes}
        onLoadProject={handleLoadProject}
        onRefreshFunctionReady={handleSidebarRefreshReady}
        onNodesChange={handleNodesChange}
        projectState={currentProjectState}
        onProjectStateChange={handleProjectStateChange}
      />
      <div className={hasProjectLoaded ? '' : styles.hiddenCanvas}>
        <Canvas
          ref={canvasRef}
          nodes={nodes}
          onNodesChange={handleNodesChange}
          projectName={projectName}
          onDirtyChange={setHasUnsavedChanges}
        />
      </div>
      {!hasProjectLoaded && (
        <div className={styles.noProjectMessage}>
          No project loaded. Select a node from the sidebar to start editing.
        </div>
      )}
      {isConsoleVisible && (
        <div className={styles.consoleArea}>
          <Console
            isVisible={isConsoleVisible}
            onToggle={handleToggleConsole}
          />
        </div>
      )}

      <div className={styles.topRightControls}>
        <button
          className={`${styles.floatingButton} ${hasUnsavedChanges ? styles.saveButtonDirty : ''}`}
          onClick={() => { handleSaveProject(); handleCompile(); }}
          title="Save and compile project"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4.414a1 1 0 0 0-.293-.707l-2.414-2.414A1 1 0 0 0 11.586 1H2zm1 3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm1 5h8v4H4V9z" />
          </svg>
        </button>
        <button
          className={`${styles.playStopButton} ${isProcessRunning ? styles.playStopRunning : ''}`}
          onClick={isProcessRunning ? handleStopProcess : handleRunProcess}
          title={isProcessRunning ? "Stop process" : "Run process"}
        >
          {isProcessRunning ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="10" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5V2.5z" />
            </svg>
          )}
        </button>
      </div>

      <div className={`${styles.bottomRightControls} ${isConsoleVisible ? styles.bottomRightAboveConsole : ''}`}>
        <button
          className={`${styles.floatingButton} ${isConsoleVisible ? styles.floatingButtonActive : ''}`}
          onClick={handleToggleConsole}
          title={isConsoleVisible ? "Hide console" : "Show console"}
        >
          <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 6 8 10 4 14" />
            <line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        </button>
        <SettingsMenu
          currentPath={nodePath}
          currentExecutablePath={executablePath}
          onPathChange={handlePathChange}
          onExecutablePathChange={handleExecutablePathChange}
        />
      </div>

      <RunParametersDialog
        isOpen={showRunParamsDialog}
        params={pendingRunData?.params || []}
        onRun={handleRunWithParams}
        onCancel={handleCancelRunParams}
      />
    </div>
  );
};

export default App;
