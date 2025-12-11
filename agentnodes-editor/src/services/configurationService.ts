interface ConfigData {
  nodeDefinitionsPath: string;
  executablePath: string;
}

class ConfigurationService {
  private nodeDefinitionsPath: string = './node-definitions';
  private executablePath: string = '../backend/target/debug/backend';
  private configFileName: string = 'agentnodes-config.json';
  private nodePathListeners: ((newPath: string) => void)[] = [];
  private executablePathListeners: ((newPath: string) => void)[] = [];
  private initialized: boolean = false;

  constructor() {
    // Don't load configuration immediately, wait for Electron API to be ready
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    // Wait for window to be available
    if (typeof window !== 'undefined') {
      await this.loadConfiguration();
    } else {
      // Retry initialization when window becomes available
      setTimeout(() => this.initializeAsync(), 100);
    }
  }

  async loadConfiguration(): Promise<void> {
    try {
      if (window.electronAPI?.readFile) {
        const configData = await window.electronAPI.readFile(this.configFileName);
        const config: ConfigData = JSON.parse(configData);
        
        if (config.nodeDefinitionsPath) {
          this.nodeDefinitionsPath = config.nodeDefinitionsPath;
        }
        if (config.executablePath) {
          this.executablePath = config.executablePath;
        }
        
        console.log('Loaded configuration:', config);
      }
    } catch (error) {
      // Config file doesn't exist or is invalid, use defaults
      console.log('No configuration file found, using defaults:', {
        nodeDefinitionsPath: this.nodeDefinitionsPath,
        executablePath: this.executablePath
      });
    }
    
    this.initialized = true;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.loadConfiguration();
    }
  }

  async saveConfiguration(): Promise<void> {
    try {
      if (window.electronAPI?.writeFile) {
        const config: ConfigData = {
          nodeDefinitionsPath: this.nodeDefinitionsPath,
          executablePath: this.executablePath
        };
        
        await window.electronAPI.writeFile(this.configFileName, JSON.stringify(config, null, 2));
        console.log('Saved configuration:', config);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  }

  getNodeDefinitionsPath(): string {
    return this.nodeDefinitionsPath;
  }

  async getNodeDefinitionsPathAsync(): Promise<string> {
    await this.ensureInitialized();
    return this.nodeDefinitionsPath;
  }

  getExecutablePath(): string {
    return this.executablePath;
  }

  async getExecutablePathAsync(): Promise<string> {
    await this.ensureInitialized();
    return this.executablePath;
  }

  async setNodeDefinitionsPath(newPath: string): Promise<void> {
    if (newPath !== this.nodeDefinitionsPath) {
      this.nodeDefinitionsPath = newPath;
      await this.saveConfiguration();
      
      // Notify all listeners about the path change
      this.nodePathListeners.forEach(listener => listener(newPath));
      console.log('Node definitions path updated to:', newPath);
    }
  }

  async setExecutablePath(newPath: string): Promise<void> {
    if (newPath !== this.executablePath) {
      this.executablePath = newPath;
      await this.saveConfiguration();
      
      // Notify all listeners about the path change
      this.executablePathListeners.forEach(listener => listener(newPath));
      console.log('Executable path updated to:', newPath);
    }
  }

  // Subscribe to node path changes
  onNodePathChange(listener: (newPath: string) => void): () => void {
    this.nodePathListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.nodePathListeners.indexOf(listener);
      if (index > -1) {
        this.nodePathListeners.splice(index, 1);
      }
    };
  }

  // Subscribe to executable path changes
  onExecutablePathChange(listener: (newPath: string) => void): () => void {
    this.executablePathListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.executablePathListeners.indexOf(listener);
      if (index > -1) {
        this.executablePathListeners.splice(index, 1);
      }
    };
  }

  // Legacy method for backward compatibility
  onPathChange(listener: (newPath: string) => void): () => void {
    return this.onNodePathChange(listener);
  }

  // Get absolute path for a relative path within node definitions
  getAbsolutePath(relativePath: string = ''): string {
    if (relativePath) {
      return `${this.nodeDefinitionsPath}/${relativePath}`;
    }
    return this.nodeDefinitionsPath;
  }

  // Get compilation path for a project
  getCompilationPath(projectPath: string, projectId: string): string {
    return `${this.nodeDefinitionsPath}/${projectPath}/${projectId}/compiled.json`;
  }
}

export const configurationService = new ConfigurationService();