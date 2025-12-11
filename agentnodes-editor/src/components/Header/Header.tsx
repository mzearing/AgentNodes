import React, { useState } from 'react';
import styles from './Header.module.css';
import { ReactFlowJsonObject, Node, Edge } from '@xyflow/react';
import SettingsMenu from '../SettingsMenu/SettingsMenu';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSaveProject: () => void;
  canvasData?: ReactFlowJsonObject<Node, Edge>;
  onCompile?: () => void;
  currentPath?: string;
  currentExecutablePath?: string;
  onPathChange?: (newPath: string) => void;
  onExecutablePathChange?: (newPath: string) => void;
  onRunProcess?: () => void;
  onStopProcess?: () => void;
  onToggleConsole?: () => void;
  isProcessRunning?: boolean;
  isConsoleVisible?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onSaveProject,
  canvasData,
  onCompile,
  currentPath,
  currentExecutablePath,
  onPathChange,
  onExecutablePathChange,
  onRunProcess,
  onStopProcess,
  onToggleConsole,
  isProcessRunning = false,
  isConsoleVisible = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(projectName);

  const handleNameClick = () => {
    setIsEditing(true);
    setTempName(projectName);
  };

  const handleNameSubmit = () => {
    onProjectNameChange(tempName.trim() || 'Untitled Project');
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setTempName(projectName);
      setIsEditing(false);
    }
  };

  const handleCompile = () => {
    if (onCompile) {
      onCompile();
    }
  };

  return (
    <div className={styles.header}>
      <div className={styles.projectSection}>
        {isEditing ? (
          <input
            className={styles.projectNameInput}
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyPress}
            autoFocus
            placeholder="Project name"
          />
        ) : (
          <div 
            className={styles.projectName}
            onClick={handleNameClick}
            title="Click to edit project name"
          >
            {projectName}
          </div>
        )}
      </div>

      <div className={styles.buttonSection}>
        <button
          className={styles.actionButton}
          onClick={onSaveProject}
          title="Save project as complex node"
        >
          Save
        </button>
        <button
          className={styles.actionButton}
          onClick={handleCompile}
          title="Compile canvas to backend format"
        >
          Compile
        </button>
        <button
          className={`${styles.runButton} ${isProcessRunning ? styles.runButtonDisabled : ''}`}
          onClick={onRunProcess}
          disabled={isProcessRunning}
          title={isProcessRunning ? "Process is running" : "Run the backend process"}
        >
          Run
        </button>
        <button
          className={`${styles.stopButton} ${!isProcessRunning ? styles.stopButtonDisabled : ''}`}
          onClick={onStopProcess}
          disabled={!isProcessRunning}
          title={!isProcessRunning ? "No process running" : "Stop the backend process"}
        >
          Stop
        </button>
        <button
          className={`${styles.consoleButton} ${isConsoleVisible ? styles.consoleButtonActive : ''}`}
          onClick={onToggleConsole}
          title={isConsoleVisible ? "Hide console" : "Show console"}
        >
          Console
        </button>
        <SettingsMenu
          currentPath={currentPath}
          currentExecutablePath={currentExecutablePath}
          onPathChange={onPathChange || (() => {})}
          onExecutablePathChange={onExecutablePathChange || (() => {})}
        />
      </div>
    </div>
  );
};

export default Header;