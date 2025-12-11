import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProcessOutput } from '../../types/electron';
import { processManagerService } from '../../services/processManagerService';
import styles from './Console.module.css';

interface ConsoleProps {
  isVisible: boolean;
  onToggle: () => void;
}

const Console: React.FC<ConsoleProps> = ({ isVisible, onToggle }) => {
  const [outputBuffer, setOutputBuffer] = useState<ProcessOutput[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    setOutputBuffer(processManagerService.getOutputBuffer());
    setIsProcessRunning(processManagerService.isProcessRunning());

    const unsubscribe = processManagerService.onOutput((output) => {
      setOutputBuffer(prev => [...prev, output]);
      
      if (output.type === 'exit' || output.type === 'error') {
        setIsProcessRunning(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [outputBuffer, scrollToBottom]);

  useEffect(() => {
    processManagerService.initialize();
    return () => {
      processManagerService.dispose();
    };
  }, []);

  const handleInputSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputValue.trim()) return;

    if (isProcessRunning) {
      await processManagerService.sendInput(inputValue.trim());
    } else {
      const output: ProcessOutput = {
        type: 'stdout',
        data: `Command: ${inputValue.trim()}`,
        timestamp: new Date()
      };
      setOutputBuffer(prev => [...prev, output]);
    }

    setInputValue('');
  }, [inputValue, isProcessRunning]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit(e);
    }
  }, [handleInputSubmit]);

  const handleClearConsole = useCallback(() => {
    processManagerService.clearOutput();
    setOutputBuffer([]);
  }, []);

  const formatTimestamp = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getOutputClass = (type: ProcessOutput['type']) => {
    switch (type) {
      case 'stderr':
        return styles.stderr;
      case 'error':
        return styles.error;
      case 'exit':
        return styles.exit;
      default:
        return styles.stdout;
    }
  };

  if (!isVisible) {
    return (
      <div className={styles.consoleDocked}>
        <button 
          className={styles.toggleButton} 
          onClick={onToggle}
          title="Show Console"
        >
          Console
        </button>
      </div>
    );
  }

  return (
    <div className={styles.console}>
      <div className={styles.header}>
        <div className={styles.title}>
          Console
          {isProcessRunning && <span className={styles.runningIndicator}>●</span>}
        </div>
        <div className={styles.headerActions}>
          <button 
            className={styles.clearButton} 
            onClick={handleClearConsole}
            title="Clear Console"
          >
            Clear
          </button>
          <button 
            className={styles.toggleButton} 
            onClick={onToggle}
            title="Hide Console"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className={styles.output} ref={outputRef}>
        {outputBuffer.length === 0 ? (
          <div className={styles.emptyMessage}>
            Console ready. Use Run button to execute backend process.
          </div>
        ) : (
          outputBuffer.map((output, index) => (
            <div key={index} className={`${styles.outputLine} ${getOutputClass(output.type)}`}>
              <span className={styles.timestamp}>
                {formatTimestamp(output.timestamp)}
              </span>
              <span className={styles.content}>
                {typeof output.data === 'string' ? output.data : String(output.data)}
              </span>
            </div>
          ))
        )}
      </div>
      
      <form className={styles.inputContainer} onSubmit={handleInputSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={isProcessRunning ? "Type command..." : "No process running"}
          className={styles.input}
          disabled={!isProcessRunning}
        />
        <button 
          type="submit" 
          className={styles.submitButton}
          disabled={!inputValue.trim() || !isProcessRunning}
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Console;