export interface ElectronAPI {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readDir: (dirPath: string) => Promise<string[]>;
  exists: (filePath: string) => Promise<boolean>;
  getStats: (filePath: string) => Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date;
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}