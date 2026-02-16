import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('vscode', () => {
  let onDidChangeVisibleTextEditorsCbs: Function[] = [];
  const mockExecuteCommand = vi.fn();
  const mockGetConfiguration = vi.fn();
  return {
    window: {
      visibleTextEditors: [] as unknown[],
      onDidChangeVisibleTextEditors: (cb: Function) => {
        onDidChangeVisibleTextEditorsCbs.push(cb);
        return { dispose: () => { onDidChangeVisibleTextEditorsCbs = onDidChangeVisibleTextEditorsCbs.filter(c => c !== cb); } };
      },
      __fireVisibleTextEditors: (editors: unknown[]) => {
        for (const cb of [...onDidChangeVisibleTextEditorsCbs]) cb(editors);
      },
    },
    workspace: {
      getConfiguration: mockGetConfiguration,
    },
    commands: {
      executeCommand: mockExecuteCommand,
    },
  };
});

import * as vscode from 'vscode';
import { TerminalLayoutManager } from '../terminal-layout';

function fireEditors(editors: unknown[]): void {
  (vscode.window as unknown as { __fireVisibleTextEditors: Function }).__fireVisibleTextEditors(editors);
}

function stubSetting(enabled: boolean): void {
  (vscode.workspace.getConfiguration as ReturnType<typeof vi.fn>).mockReturnValue({
    get: (_key: string, defaultValue?: boolean) => enabled ?? defaultValue,
  });
}

describe('TerminalLayoutManager', () => {
  let manager: TerminalLayoutManager;

  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.window as unknown as { visibleTextEditors: unknown[] }).visibleTextEditors = [];
    stubSetting(true);
  });

  afterEach(() => {
    manager?.dispose();
  });

  it('should maximize panel when all editors close after opening', () => {
    manager = new TerminalLayoutManager();

    fireEditors([{ document: {} }]);
    fireEditors([]);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.toggleMaximizedPanel');
  });

  it('should not maximize when editors were already open at construction', () => {
    (vscode.window as unknown as { visibleTextEditors: unknown[] }).visibleTextEditors = [{ document: {} }];
    manager = new TerminalLayoutManager();

    fireEditors([]);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('should not maximize when switching between editors', () => {
    manager = new TerminalLayoutManager();

    fireEditors([{ document: {} }]);
    fireEditors([{ document: {} }, { document: {} }]);
    fireEditors([{ document: {} }]);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('should not maximize when setting is disabled', () => {
    stubSetting(false);
    manager = new TerminalLayoutManager();

    fireEditors([{ document: {} }]);
    stubSetting(false);
    fireEditors([]);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('should maximize again after a second open-close cycle', () => {
    manager = new TerminalLayoutManager();

    fireEditors([{ document: {} }]);
    fireEditors([]);
    expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);

    fireEditors([{ document: {} }]);
    fireEditors([]);
    expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(2);
  });

  it('should respect setting changes between cycles', () => {
    manager = new TerminalLayoutManager();

    fireEditors([{ document: {} }]);
    fireEditors([]);
    expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);

    stubSetting(false);
    fireEditors([{ document: {} }]);
    stubSetting(false);
    fireEditors([]);
    expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
  });

  it('should not fire when editors go from empty to empty', () => {
    manager = new TerminalLayoutManager();

    fireEditors([]);
    fireEditors([]);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});
