import React, { useState, useCallback, useRef } from 'react';
import { Node } from '@xyflow/react';
import styles from './App.module.css';
import Header from '../Header/Header';
import Canvas, { CanvasMethods } from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';
import { ProjectState } from '../../types/project';


const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [hasProjectLoaded, setHasProjectLoaded] = useState<boolean>(false);
  const canvasRef = useRef<CanvasMethods>(null);

  const handleNodesChange = (newNodes: Node[]) => {
    setNodes(newNodes);
  };

  const handleSaveProject = useCallback(async () => {
    if (canvasRef.current) {
      await canvasRef.current.saveProject();
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

  return (
    <div className={styles.app}>
      <Header 
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onSaveProject={handleSaveProject}
      />
      <Sidebar 
        nodes={nodes} 
        onLoadProject={handleLoadProject}
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