import React, { useState, useRef, useEffect } from 'react';
import styles from './SettingsMenu.module.css';
import { configurationService } from '../../services/configurationService';

interface SettingsMenuProps {
  currentPath?: string;
  currentExecutablePath?: string;
  onPathChange: (newPath: string) => void;
  onExecutablePathChange: (newPath: string) => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ 
  currentPath = configurationService.getNodeDefinitionsPath(),
  currentExecutablePath = configurationService.getExecutablePath(),
  onPathChange,
  onExecutablePathChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempPath, setTempPath] = useState(currentPath);
  const [tempExecutablePath, setTempExecutablePath] = useState(currentExecutablePath);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setTempPath(currentPath);
        setTempExecutablePath(currentExecutablePath);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, currentPath, currentExecutablePath]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTempPath(currentPath);
      setTempExecutablePath(currentExecutablePath);
    }
  };

  const handlePathSubmit = () => {
    const trimmedPath = tempPath.trim();
    const trimmedExecutablePath = tempExecutablePath.trim();
    
    if (trimmedPath && trimmedPath !== currentPath) {
      onPathChange(trimmedPath);
    }
    if (trimmedExecutablePath && trimmedExecutablePath !== currentExecutablePath) {
      onExecutablePathChange(trimmedExecutablePath);
    }
    
    setIsOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePathSubmit();
    } else if (e.key === 'Escape') {
      setTempPath(currentPath);
      setTempExecutablePath(currentExecutablePath);
      setIsOpen(false);
    }
  };

  const handleBrowse = async () => {
    if (window.electronAPI && window.electronAPI.openDirectoryDialog) {
      try {
        const selectedPath = await window.electronAPI.openDirectoryDialog(currentPath);
        if (selectedPath) {
          setTempPath(selectedPath);
        }
      } catch (error) {
        console.error('Failed to open directory dialog:', error);
        alert('Failed to open directory dialog. Please check console for details.');
      }
    } else {
      alert('Directory selection not available (requires Electron)');
    }
  };

  const handleExecutableBrowse = async () => {
    if (window.electronAPI && window.electronAPI.openFileDialog) {
      try {
        const execDir = currentExecutablePath.substring(0, currentExecutablePath.lastIndexOf('/'));
        const selectedPath = await window.electronAPI.openFileDialog(execDir || '.');
        if (selectedPath) {
          setTempExecutablePath(selectedPath);
        }
      } catch (error) {
        console.error('Failed to open file dialog:', error);
        alert('Failed to open file dialog. Please check console for details.');
      }
    } else if (window.electronAPI && window.electronAPI.openDirectoryDialog) {
      // Fallback to directory dialog if file dialog not available
      try {
        const execDir = currentExecutablePath.substring(0, currentExecutablePath.lastIndexOf('/'));
        const selectedPath = await window.electronAPI.openDirectoryDialog(execDir || currentExecutablePath);
        if (selectedPath) {
          setTempExecutablePath(selectedPath);
        }
      } catch (error) {
        console.error('Failed to open directory dialog:', error);
        alert('Failed to open directory dialog. Please check console for details.');
      }
    } else {
      alert('File/directory selection not available (requires Electron)');
    }
  };

  return (
    <div className={styles.settingsContainer} ref={menuRef}>
      <button
        className={styles.settingsButton}
        onClick={handleToggle}
        title="Settings"
        aria-label="Settings"
      >
        Settings
      </button>
      
      {isOpen && (
        <div className={styles.settingsMenu}>
          <div className={styles.menuSection}>
            <h3 className={styles.sectionTitle}>Path Settings</h3>
            
            <div className={styles.pathSection}>
              <label className={styles.pathLabel}>
                Node Definitions Folder:
              </label>
              
              <div className={styles.pathInputContainer}>
                <input
                  type="text"
                  className={styles.pathInput}
                  value={tempPath}
                  onChange={(e) => setTempPath(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter folder path..."
                />
                <button
                  className={styles.browseButton}
                  onClick={handleBrowse}
                  title="Browse for folder"
                >
                  Browse
                </button>
              </div>
            </div>

            <div className={styles.pathSection}>
              <label className={styles.pathLabel}>
                Executable Path:
              </label>
              
              <div className={styles.pathInputContainer}>
                <input
                  type="text"
                  className={styles.pathInput}
                  value={tempExecutablePath}
                  onChange={(e) => setTempExecutablePath(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter executable path..."
                />
                <button
                  className={styles.browseButton}
                  onClick={handleExecutableBrowse}
                  title="Browse for executable"
                >
                  Browse
                </button>
              </div>
            </div>
              
            <div className={styles.buttonGroup}>
              <button
                className={styles.applyButton}
                onClick={handlePathSubmit}
                disabled={tempPath.trim() === currentPath && tempExecutablePath.trim() === currentExecutablePath}
              >
                Apply
              </button>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  setTempPath(currentPath);
                  setTempExecutablePath(currentExecutablePath);
                  setIsOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsMenu;