import React from 'react';
import styles from './App.module.css';
import Header from '../Header/Header';
import Canvas from '../Canvas/Canvas';
import Sidebar from '../Sidebar/Sidebar';

const App: React.FC = () => {
  return (
    <div className={styles.app}>
      <Header />
      <Sidebar />
      <Canvas />
    </div>
  );
};

export default App;