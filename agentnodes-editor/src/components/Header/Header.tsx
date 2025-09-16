import React from 'react';
import styles from './Header.module.css';

const Header: React.FC = () => {
  return (
    <div className={styles.header}>
        <button
              className={styles.runButton}
              onClick={() => console.log("Run!")}
              title="Run the project"
            >
              Run
        </button>
        <button
              className={styles.runButton}
              onClick={() => console.log("Stop!")}
              title="Stop a project"
            >
              Stop
        </button>
    </div>
  );
};

export default Header;