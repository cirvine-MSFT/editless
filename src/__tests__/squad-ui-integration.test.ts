import { vi, describe, it, expect, beforeEach } from 'vitest';

const { mockGetExtension, mockExecuteCommand, mockOnDidChange } = vi.hoisted(() => ({
  mockGetExtension: vi.fn(),
  mockExecuteCommand: vi.fn(),
  mockOnDidChange: vi.fn(),
}));

vi.mock('vscode', () => ({
  extensions: {
    getExtension: mockGetExtension,
    onDidChange: mockOnDidChange,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

import {
  isSquadUiInstalled,
  initSquadUiContext,
  openSquadUiDashboard,
  openSquadUiCharter,
} from '../squad-ui-integration';
import type * as vscode from 'vscode';

function makeMockContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

describe('squad-ui-integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnDidChange.mockReturnValue({ dispose: vi.fn() });
  });

  describe('isSquadUiInstalled', () => {
    it('should return true when SquadUI extension is installed', () => {
      mockGetExtension.mockReturnValue({ id: 'csharpfritz.squadui' });
      expect(isSquadUiInstalled()).toBe(true);
    });

    it('should return false when SquadUI extension is not installed', () => {
      mockGetExtension.mockReturnValue(undefined);
      expect(isSquadUiInstalled()).toBe(false);
    });

    it('should query the correct extension ID', () => {
      isSquadUiInstalled();
      expect(mockGetExtension).toHaveBeenCalledWith('csharpfritz.squadui');
    });
  });

  describe('initSquadUiContext', () => {
    it('should set context key to true when SquadUI is installed', () => {
      mockGetExtension.mockReturnValue({ id: 'csharpfritz.squadui' });
      initSquadUiContext(makeMockContext());
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', true);
    });

    it('should set context key to false when SquadUI is not installed', () => {
      mockGetExtension.mockReturnValue(undefined);
      initSquadUiContext(makeMockContext());
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', false);
    });

    it('should register onDidChange listener for extension install/uninstall', () => {
      initSquadUiContext(makeMockContext());
      expect(mockOnDidChange).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should update context key when extensions change', () => {
      let changeListener: () => void;
      mockOnDidChange.mockImplementation((listener: () => void) => {
        changeListener = listener;
        return { dispose: vi.fn() };
      });

      mockGetExtension.mockReturnValue(undefined);
      initSquadUiContext(makeMockContext());

      // Simulate SquadUI being installed
      mockGetExtension.mockReturnValue({ id: 'csharpfritz.squadui' });
      mockExecuteCommand.mockClear();
      changeListener!();
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', true);
    });

    it('should push disposable to subscriptions', () => {
      const ctx = makeMockContext();
      initSquadUiContext(ctx);
      expect(ctx.subscriptions).toHaveLength(1);
    });
  });

  describe('openSquadUiDashboard', () => {
    it('should call squadui.openDashboard command with no args when no teamRoot', async () => {
      await openSquadUiDashboard();
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.openDashboard', undefined);
    });

    it('should pass teamRoot when provided', async () => {
      await openSquadUiDashboard('/path/to/squad');
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.openDashboard', '/path/to/squad');
    });

    it('should not throw when command is unavailable', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('command not found'));
      await expect(openSquadUiDashboard()).resolves.toBeUndefined();
    });
  });

  describe('openSquadUiCharter', () => {
    it('should call squadui.viewCharter command with no args when no params', async () => {
      await openSquadUiCharter();
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.viewCharter', undefined, undefined);
    });

    it('should pass memberName and teamRoot when provided', async () => {
      await openSquadUiCharter('alice', '/path/to/squad');
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.viewCharter', 'alice', '/path/to/squad');
    });

    it('should pass only memberName when teamRoot is omitted', async () => {
      await openSquadUiCharter('bob');
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.viewCharter', 'bob', undefined);
    });

    it('should not throw when command is unavailable', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('command not found'));
      await expect(openSquadUiCharter()).resolves.toBeUndefined();
    });
  });
});
