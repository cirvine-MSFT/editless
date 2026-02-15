// Mock vscode module for testing
export const workspace = {
  getConfiguration: (scope?: string) => ({
    get: (key: string, defaultValue?: any) => defaultValue,
  }),
  onDidChangeConfiguration: (listener: any) => ({
    dispose: () => {},
  }),
};

export const window = {
  createTerminal: (options: any) => ({
    name: options.name,
    cwd: options.cwd,
    sendText: () => {},
    show: () => {},
    dispose: () => {},
  }),
  onDidCloseTerminal: (listener: any) => ({
    dispose: () => {},
  }),
  showInformationMessage: async (message: string, ...items: any[]) => undefined,
  showQuickPick: async (items: any[], options?: any) => undefined,
  showInputBox: async (options?: any) => undefined,
  showOpenDialog: async (options: any) => undefined,
};

export const commands = {
  registerCommand: (command: string, callback: any) => ({
    dispose: () => {},
  }),
};

export class EventEmitter {
  private listeners: Function[] = [];
  
  get event() {
    return (listener: Function) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
  }

  fire(value?: any) {
    this.listeners.forEach(l => l(value));
  }

  dispose() {
    this.listeners = [];
  }
}

export interface ExtensionContext {
  subscriptions: any[];
  workspaceState: {
    get: (key: string, defaultValue?: any) => any;
    update: (key: string, value: any) => Thenable<void>;
  };
}

export interface Terminal {
  name: string;
  cwd?: string;
  sendText: (text: string) => void;
  show: () => void;
  dispose: () => void;
}

export interface Disposable {
  dispose: () => void;
}

export type Event<T> = (listener: (e: T) => any) => Disposable;
