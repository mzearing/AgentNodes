import React, { useState } from 'react';
import { Node } from '@xyflow/react';
import styles from './App.module.css';
import Header from '../Header/Header';
import Canvas from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';

const App: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);

  const handleNodesChange = (newNodes: Node[]) => {
    setNodes(newNodes);
  };

  return (
    <div className={styles.app}>
      <Header />
      <Sidebar nodes={nodes} />
      <Canvas nodes={nodes} onNodesChange={handleNodesChange} />
    </div>
  );
};

export default App;