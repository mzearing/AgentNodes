import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from './App.module.css';
import Header from '../Header/Header';
import Canvas, { CanvasMethods } from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';
import Console from '../Console/Console';
import { ProjectState } from '../../types/project';
import { sidebarRefreshEmitter, canvasRefreshEmitter } from '../../hooks/useSidebarData';
import { compilationService } from '../../services/compilationService';
import { nodeCompilationStatusService } from '../../services/nodeCompilationStatus';
import { configurationService } from '../../services/configurationService';
import { processManagerService } from '../../services/processManagerService';


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

  const handleCompile = useCallback(async () => {
    if (canvasRef.current) {
      const canvasData = canvasRef.current.getCanvasData();
      const projectState = canvasRef.current.getProjectState();
      console.log('Canvas data retrieved:', canvasData);
      if (canvasData && projectState) {
        console.log('Starting compilation with canvas data:', canvasData);
        const result = await compilationService.compile(canvasData);
        console.log('Compilation result:', result);
        
        if (result.success && result.data) {
          try {
            // Save compiled.json to the specific node's folder
            const dataStr = JSON.stringify(result.data, null, 2);
            const compiledFilePath = configurationService.getCompilationPath(projectState.openedNodePath, projectState.openedNodeId);
            
            if (window.electronAPI?.writeFile) {
              await window.electronAPI.writeFile(compiledFilePath, dataStr);
              
              // Clear compilation cache for the compiled node to ensure UI updates
              nodeCompilationStatusService.clearCache();
              
              alert(`Compilation successful! File saved to ${compiledFilePath}`);
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
            }
          } catch (error) {
            console.error('Failed to save compiled file:', error);
            alert(`Failed to save compiled file: ${error}`);
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
        }
      } else {
        alert('No canvas data or project state available. Please load a project first.');
      }
    } else {
      alert('Canvas not available');
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

    // Get current project state to find compiled.json file
    if (!canvasRef.current) {
      alert('Canvas not available');
      return;
    }

    const projectState = canvasRef.current.getProjectState();
    if (!projectState || !projectState.openedNodePath || !projectState.openedNodeId) {
      alert('No project loaded. Please load a project and compile it first.');
      return;
    }

    const compiledFilePath = configurationService.getCompilationPath(
      projectState.openedNodePath, 
      projectState.openedNodeId
    );

    // Check if compiled file exists
    try {
      if (window.electronAPI?.readFile) {
        await window.electronAPI.readFile(compiledFilePath);
      } else {
        alert('Compiled file verification not available. Make sure to compile before running.');
        return;
      }
    } catch (error) {
      alert('Compiled file not found. Please compile the project first.');
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
      <Header 
        projectName={projectName}
        onProjectNameChange={handleProjectNameChange}
        onSaveProject={handleSaveProject}
        canvasData={canvasRef.current?.getCanvasData()}
        onCompile={handleCompile}
        currentPath={nodePath}
        currentExecutablePath={executablePath}
        onPathChange={handlePathChange}
        onExecutablePathChange={handleExecutablePathChange}
        onRunProcess={handleRunProcess}
        onStopProcess={handleStopProcess}
        onToggleConsole={handleToggleConsole}
        isProcessRunning={isProcessRunning}
        isConsoleVisible={isConsoleVisible}
      />
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
    </div>
  );
};

export default App;