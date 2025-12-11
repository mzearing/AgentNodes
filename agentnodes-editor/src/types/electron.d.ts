export interface ProcessOutput {
  type: 'stdout' | 'stderr' | 'exit' | 'error';
  data: string | number;
  timestamp: Date;
}

export interface ProcessAPI {
  spawn: (command: string, args?: string[]) => Promise<{
    success: boolean;
    pid?: number;
    command?: string;
    args?: string[];
    error?: string;
  }>;
  kill: (pid: number) => Promise<{
    success: boolean;
    error?: string;
  }>;
  sendInput: (pid: number, input: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  onOutput: (listener: (output: ProcessOutput) => void) => (() => void);
}

export interface ElectronAPI {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readDir: (dirPath: string) => Promise<string[]>;
  exists: (filePath: string) => Promise<boolean>;
  getStats: (filePath: string) => Promise<{
    size: number;
    mtime: Date;
  }>;
  openDirectoryDialog: (defaultPath?: string) => Promise<string | null>;
  getAppDirectory: () => Promise<string>;
  process: ProcessAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}