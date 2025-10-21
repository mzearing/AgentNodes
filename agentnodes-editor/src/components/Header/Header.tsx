import React, { useState } from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSaveProject: () => void;
}

const Header: React.FC<HeaderProps> = ({
  projectName,
  onProjectNameChange,
  onSaveProject
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
    </div>
  );
};

export default Header;