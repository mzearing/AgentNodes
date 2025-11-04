import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Node } from '@xyflow/react';
import styles from './App.module.css';
import Header from '../Header/Header';
import Canvas, { CanvasMethods } from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';
import { ProjectState } from '../../types/project';
import { sidebarRefreshEmitter, canvasRefreshEmitter } from '../../hooks/useSidebarData';
import { compilationService } from '../../services/compilationService';


const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [hasProjectLoaded, setHasProjectLoaded] = useState<boolean>(false);
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
      }
    } else {
      alert('Canvas not available');
    }
  }, []);

  const handleCompile = useCallback(async () => {
    if (canvasRef.current) {
      const canvasData = canvasRef.current.getCanvasData();
      console.log('Canvas data retrieved:', canvasData);
      if (canvasData) {
        console.log('Starting compilation with canvas data:', canvasData);
        const result = compilationService.compile(canvasData);
        console.log('Compilation result:', result);
        
        if (result.success && result.data) {
          try {
            // Save compiled.json to the node definitions directory
            const dataStr = JSON.stringify(result.data, null, 2);
            const compiledFilePath = './node-definitions/compiled.json';
            
            if (window.electronAPI?.writeFile) {
              await window.electronAPI.writeFile(compiledFilePath, dataStr);
              alert('Compilation successful! File saved to node-definitions/compiled.json');
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
          alert(`Compilation failed:\n${errorMessage}`);
        }
      } else {
        alert('No canvas data available. Please load a project first.');
      }
    } else {
      alert('Canvas not available');
    }
  }, [projectName]);

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

  return (
    <div className={styles.app}>
      <Header 
        projectName={projectName}
        onProjectNameChange={handleProjectNameChange}
        onSaveProject={handleSaveProject}
        canvasData={canvasRef.current?.getCanvasData()}
        onCompile={handleCompile}
      />
      <Sidebar 
        nodes={nodes} 
        onLoadProject={handleLoadProject}
        onRefreshFunctionReady={(_refreshFn: () => void) => {
          // No-op: refresh function not needed in this component
        }}
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
    </div>
  );
};

export default App;