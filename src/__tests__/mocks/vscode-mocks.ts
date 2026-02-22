/**
 * Shared vscode mock classes and utilities for tests.
 * Extracted from tree-providers.test.ts and extension-commands.test.ts.
 */

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

export class TreeItem {
  label: string;
  collapsibleState: number;
  iconPath?: unknown;
  description?: string;
  contextValue?: string;
  tooltip?: unknown;
  command?: unknown;
  id?: string;
  constructor(label: string, collapsibleState: number = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  id: string;
  color?: unknown;
  constructor(id: string, color?: unknown) {
    this.id = id;
    this.color = color;
  }
}

export class ThemeColor {
  id: string;
  constructor(id: string) {
    this.id = id;
  }
}

export class MarkdownString {
  value: string;
  constructor(value: string) {
    this.value = value;
  }
}

export class EventEmitter {
  private listeners: Function[] = [];
  get event() {
    return (listener: Function) => {
      this.listeners.push(listener);
      return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
  }
  fire(value?: unknown) {
    this.listeners.forEach(l => l(value));
  }
  dispose() {
    this.listeners = [];
  }
}

export class MockEditlessTreeItem {
  terminal?: unknown;
  persistedEntry?: unknown;
  parent?: unknown;
  squadId?: string;
  id?: string;
  constructor(
    public label: string,
    public type: string,
    public collapsibleState: number,
    squadId?: string,
  ) {
    this.squadId = squadId;
  }
}

/**
 * Factory function that returns the vscode module mock object.
 * Use with vi.mock('vscode', () => createVscodeMock(customOverrides)).
 */
export function createVscodeMock(overrides?: Record<string, unknown>) {
  return {
    TreeItem,
    TreeItemCollapsibleState,
    ThemeIcon,
    ThemeColor,
    MarkdownString,
    EventEmitter,
    Uri: {
      parse: (s: string) => ({ toString: () => s }),
      file: (s: string) => ({ toString: () => s, fsPath: s }),
    },
    ...overrides,
  };
}
