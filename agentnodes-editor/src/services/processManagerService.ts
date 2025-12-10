interface ProcessState {
  pid?: number;
  isRunning: boolean;
  startTime?: Date;
  command?: string;
  args?: string[];
}

interface ProcessOutput {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data: string | number;
  timestamp: Date;
}

type ProcessOutputListener = (output: ProcessOutput) => void;

class ProcessManagerService {
  private processState: ProcessState = {
    isRunning: false
  };
  private outputListeners: ProcessOutputListener[] = [];
  private outputBuffer: ProcessOutput[] = [];
  private maxBufferSize = 10000;

  getProcessState(): ProcessState {
    return { ...this.processState };
  }

  isProcessRunning(): boolean {
    return this.processState.isRunning;
  }

  async startProcess(command: string, args: string[] = []): Promise<boolean> {
    if (this.processState.isRunning) {
      this.addOutput('error', 'Process is already running');
      return false;
    }

    try {
      if (!window.electronAPI?.process?.spawn) {
        this.addOutput('error', 'Process management not available');
        return false;
      }

      const result = await window.electronAPI.process.spawn(command, args);
      
      if (result.success && result.pid) {
        this.processState = {
          pid: result.pid,
          isRunning: true,
          startTime: new Date(),
          command,
          args
        };

        this.addOutput('stdout', `Process started with PID ${result.pid}`);
        return true;
      } else {
        this.addOutput('error', result.error || 'Failed to start process');
        return false;
      }
    } catch (error) {
      this.addOutput('error', `Error starting process: ${error}`);
      return false;
    }
  }

  async stopProcess(): Promise<boolean> {
    if (!this.processState.isRunning || !this.processState.pid) {
      this.addOutput('error', 'No process running');
      return false;
    }

    try {
      if (!window.electronAPI?.process?.kill) {
        this.addOutput('error', 'Process management not available');
        return false;
      }

      const result = await window.electronAPI.process.kill(this.processState.pid);
      
      if (result.success) {
        this.processState.isRunning = false;
        this.addOutput('stdout', 'Process stopped');
        return true;
      } else {
        this.addOutput('error', result.error || 'Failed to stop process');
        return false;
      }
    } catch (error) {
      this.addOutput('error', `Error stopping process: ${error}`);
      return false;
    }
  }

  async sendInput(input: string): Promise<boolean> {
    if (!this.processState.isRunning || !this.processState.pid) {
      this.addOutput('error', 'No process running');
      return false;
    }

    try {
      if (!window.electronAPI?.process?.sendInput) {
        this.addOutput('error', 'Process input not available');
        return false;
      }

      const result = await window.electronAPI.process.sendInput(this.processState.pid, input);
      
      if (result.success) {
        this.addOutput('stdout', `> ${input}`);
        return true;
      } else {
        this.addOutput('error', result.error || 'Failed to send input');
        return false;
      }
    } catch (error) {
      this.addOutput('error', `Error sending input: ${error}`);
      return false;
    }
  }

  onOutput(listener: ProcessOutputListener): () => void {
    this.outputListeners.push(listener);
    
    return () => {
      const index = this.outputListeners.indexOf(listener);
      if (index > -1) {
        this.outputListeners.splice(index, 1);
      }
    };
  }

  getOutputBuffer(): ProcessOutput[] {
    return [...this.outputBuffer];
  }

  clearOutput(): void {
    this.outputBuffer = [];
    this.notifyListeners({
      type: 'stdout',
      data: '--- Output cleared ---',
      timestamp: new Date()
    });
  }

  addCompilationError(error: string): void {
    this.addOutput('error', `Compilation Error: ${error}`);
  }

  private addOutput(type: ProcessOutput['type'], data: string | number): void {
    const output: ProcessOutput = {
      type,
      data,
      timestamp: new Date()
    };

    this.outputBuffer.push(output);
    
    if (this.outputBuffer.length > this.maxBufferSize) {
      this.outputBuffer = this.outputBuffer.slice(-Math.floor(this.maxBufferSize * 0.8));
    }

    this.notifyListeners(output);
  }

  private notifyListeners(output: ProcessOutput): void {
    this.outputListeners.forEach(listener => {
      try {
        listener(output);
      } catch (error) {
        console.error('Error in process output listener:', error);
      }
    });
  }

  initialize(): void {
    if (window.electronAPI?.process?.onOutput) {
      window.electronAPI.process.onOutput((output: ProcessOutput) => {
        this.outputBuffer.push(output);
        
        if (output.type === 'exit') {
          this.processState.isRunning = false;
          this.addOutput('stdout', `Process exited with code ${output.data}`);
        }
        
        if (this.outputBuffer.length > this.maxBufferSize) {
          this.outputBuffer = this.outputBuffer.slice(-Math.floor(this.maxBufferSize * 0.8));
        }

        this.notifyListeners(output);
      });
    }
  }

  dispose(): void {
    this.outputListeners = [];
    this.outputBuffer = [];
  }
}

export const processManagerService = new ProcessManagerService();