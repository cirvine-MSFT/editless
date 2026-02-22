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
  squadUiSupportsDeepLink,
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

  describe('squadUiSupportsDeepLink', () => {
    it('should return true when SquadUI has onUri activation event', () => {
      mockGetExtension.mockReturnValue({
        id: 'csharpfritz.squadui',
        packageJSON: { activationEvents: ['onUri', 'onView:squadTeam'] },
      });
      expect(squadUiSupportsDeepLink()).toBe(true);
    });

    it('should return false when SquadUI lacks onUri activation event', () => {
      mockGetExtension.mockReturnValue({
        id: 'csharpfritz.squadui',
        packageJSON: { activationEvents: ['onView:squadTeam'] },
      });
      expect(squadUiSupportsDeepLink()).toBe(false);
    });

    it('should return false when SquadUI is not installed', () => {
      mockGetExtension.mockReturnValue(undefined);
      expect(squadUiSupportsDeepLink()).toBe(false);
    });

    it('should return false when activationEvents is missing', () => {
      mockGetExtension.mockReturnValue({
        id: 'csharpfritz.squadui',
        packageJSON: {},
      });
      expect(squadUiSupportsDeepLink()).toBe(false);
    });
  });

  describe('initSquadUiContext', () => {
    it('should set context key to true when SquadUI is installed', () => {
      mockGetExtension.mockReturnValue({
        id: 'csharpfritz.squadui',
        packageJSON: { activationEvents: ['onUri'] },
      });
      initSquadUiContext(makeMockContext());
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiSupportsDeepLink', true);
    });

    it('should set context key to false when SquadUI is not installed', () => {
      mockGetExtension.mockReturnValue(undefined);
      initSquadUiContext(makeMockContext());
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', false);
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiSupportsDeepLink', false);
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

      // Simulate SquadUI being installed with deep-link support
      mockGetExtension.mockReturnValue({
        id: 'csharpfritz.squadui',
        packageJSON: { activationEvents: ['onUri'] },
      });
      mockExecuteCommand.mockClear();
      changeListener!();
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiAvailable', true);
      expect(mockExecuteCommand).toHaveBeenCalledWith('setContext', 'editless.squadUiSupportsDeepLink', true);
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

    it('should call refreshTree after openDashboard', async () => {
      mockExecuteCommand.mockResolvedValue(undefined);
      await openSquadUiDashboard();
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.refreshTree', undefined);
    });

    it('should pass teamRoot to refreshTree when provided', async () => {
      mockExecuteCommand.mockResolvedValue(undefined);
      await openSquadUiDashboard('/path/to/squad');
      expect(mockExecuteCommand).toHaveBeenCalledWith('squadui.refreshTree', '/path/to/squad');
    });

    it('should call openDashboard before refreshTree', async () => {
      const callOrder: string[] = [];
      mockExecuteCommand.mockImplementation(async (cmd: string) => {
        callOrder.push(cmd);
      });
      await openSquadUiDashboard('/root');
      expect(callOrder).toEqual(['squadui.openDashboard', 'squadui.refreshTree']);
    });

    it('should not throw when refreshTree fails but openDashboard succeeds', async () => {
      let callCount = 0;
      mockExecuteCommand.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) throw new Error('refreshTree not found');
      });
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
