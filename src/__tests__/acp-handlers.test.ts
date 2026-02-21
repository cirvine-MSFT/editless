import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockReadFile, mockOutputChannel } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockOutputChannel: {
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    name: 'ACP Handler Test',
    replace: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/workspace/root' },
      },
    ],
  },
}));

import { DefaultAcpRequestHandler } from '../acp/handlers';
import type * as types from '../acp/types';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DefaultAcpRequestHandler', () => {
  let handler: DefaultAcpRequestHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new DefaultAcpRequestHandler(mockOutputChannel);
  });

  describe('Permission handling', () => {
    it('auto-approves all permission requests', async () => {
      const params: types.RequestPermissionParams = {
        sessionId: 'sess-1',
        action: 'execute_command',
        details: { command: 'npm install' },
      };

      const result = await handler.onPermissionRequest(params);

      expect(result).toEqual({ approved: true });
    });

    it('returns correct response shape', async () => {
      const params: types.RequestPermissionParams = {
        sessionId: 'sess-2',
        action: 'write_file',
        details: { path: '/test.txt' },
      };

      const result = await handler.onPermissionRequest(params);

      expect(result).toHaveProperty('approved');
      expect(typeof result.approved).toBe('boolean');
    });

    it('logs permission request details', async () => {
      const params: types.RequestPermissionParams = {
        sessionId: 'sess-3',
        action: 'delete_file',
        details: { path: '/dangerous.txt', reason: 'cleanup' },
      };

      await handler.onPermissionRequest(params);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('delete_file')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('dangerous.txt')
      );
    });
  });

  describe('File reading', () => {
    it('reads existing file and returns content', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/src/test.ts',
      };

      mockReadFile.mockResolvedValue('export const foo = "bar";');

      const result = await handler.onReadTextFile(params);

      expect(result).toEqual({ content: 'export const foo = "bar";' });
      expect(mockReadFile).toHaveBeenCalledWith('/workspace/root/src/test.ts', 'utf-8');
    });

    it('returns error for non-existent file', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/missing.txt',
      };

      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      await expect(handler.onReadTextFile(params)).rejects.toThrow(
        'Failed to read file: ENOENT: no such file or directory'
      );
    });

    it('handles read errors gracefully', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/permission-denied.txt',
      };

      mockReadFile.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(handler.onReadTextFile(params)).rejects.toThrow(
        'Failed to read file: EACCES: permission denied'
      );
    });

    it('handles absolute paths', async () => {
      const params: types.ReadTextFileParams = {
        path: '/absolute/path/to/file.txt',
      };

      mockReadFile.mockResolvedValue('absolute file content');

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe('absolute file content');
      expect(mockReadFile).toHaveBeenCalledWith('/absolute/path/to/file.txt', 'utf-8');
    });

    it('handles relative paths by resolving to workspace root', async () => {
      const params: types.ReadTextFileParams = {
        path: 'relative/file.txt',
      };

      mockReadFile.mockResolvedValue('relative file content');

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe('relative file content');
      // Should resolve relative to workspace root - check the call happened with resolved path
      const callPath = mockReadFile.mock.calls[0][0];
      expect(callPath).toContain('relative');
      expect(callPath).toContain('file.txt');
    });

    it('logs file read operations', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/test.txt',
      };

      mockReadFile.mockResolvedValue('test content');

      await handler.onReadTextFile(params);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Read file')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('test.txt')
      );
    });

    it('handles empty file content', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/empty.txt',
      };

      mockReadFile.mockResolvedValue('');

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe('');
    });

    it('handles large file content', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/large.txt',
      };

      const largeContent = 'x'.repeat(1000000);
      mockReadFile.mockResolvedValue(largeContent);

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe(largeContent);
      expect(result.content.length).toBe(1000000);
    });

    it('handles non-Error rejections', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/weird-error.txt',
      };

      mockReadFile.mockRejectedValue('string error');

      await expect(handler.onReadTextFile(params)).rejects.toThrow(
        'Failed to read file: string error'
      );
    });
  });

  describe('Stub methods', () => {
    it('writeTextFile returns error (not implemented)', async () => {
      const params: types.WriteTextFileParams = {
        path: '/test.txt',
        content: 'new content',
      };

      await expect(handler.onWriteTextFile(params)).rejects.toThrow(
        'Write operations not supported in spike'
      );

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('STUB')
      );
    });

    it('writeTextFile logs the request before failing', async () => {
      const params: types.WriteTextFileParams = {
        path: '/test.txt',
        content: 'test content',
      };

      await expect(handler.onWriteTextFile(params)).rejects.toThrow();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Write file request')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('test.txt')
      );
    });

    it('terminal/create returns error (not implemented)', async () => {
      const params: types.TerminalCreateParams = {
        command: 'npm',
        args: ['test'],
        cwd: '/workspace',
      };

      await expect(handler.onTerminalCreate(params)).rejects.toThrow(
        'Terminal operations not supported in spike'
      );

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('STUB')
      );
    });

    it('terminal/output returns error (not implemented)', async () => {
      const params: types.TerminalOutputParams = {
        terminalId: 'term-123',
      };

      await expect(handler.onTerminalOutput(params)).rejects.toThrow(
        'Terminal operations not supported in spike'
      );
    });

    it('terminal/wait_for_exit returns error (not implemented)', async () => {
      const params: types.TerminalWaitForExitParams = {
        terminalId: 'term-123',
      };

      await expect(handler.onTerminalWaitForExit(params)).rejects.toThrow(
        'Terminal operations not supported in spike'
      );
    });

    it('terminal/kill returns error (not implemented)', async () => {
      const params: types.TerminalKillParams = {
        terminalId: 'term-123',
      };

      await expect(handler.onTerminalKill(params)).rejects.toThrow(
        'Terminal operations not supported in spike'
      );
    });

    it('terminal/release returns error (not implemented)', async () => {
      const params: types.TerminalReleaseParams = {
        terminalId: 'term-123',
      };

      await expect(handler.onTerminalRelease(params)).rejects.toThrow(
        'Terminal operations not supported in spike'
      );
    });

    it('terminal/create logs command details before failing', async () => {
      const params: types.TerminalCreateParams = {
        command: 'git',
        args: ['status'],
        cwd: '/repo',
        env: { GIT_EDITOR: 'vim' },
      };

      await expect(handler.onTerminalCreate(params)).rejects.toThrow();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('git status')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('/repo')
      );
    });

    it('terminal/create handles missing optional params', async () => {
      const params: types.TerminalCreateParams = {
        command: 'ls',
      };

      await expect(handler.onTerminalCreate(params)).rejects.toThrow();

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('ls')
      );
    });
  });

  describe('Edge cases', () => {
    it('handles permission request with empty details', async () => {
      const params: types.RequestPermissionParams = {
        sessionId: 'sess-1',
        action: 'generic_action',
        details: {},
      };

      const result = await handler.onPermissionRequest(params);

      expect(result.approved).toBe(true);
    });

    it('handles permission request with complex nested details', async () => {
      const params: types.RequestPermissionParams = {
        sessionId: 'sess-1',
        action: 'complex_action',
        details: {
          nested: {
            deep: {
              structure: ['a', 'b', 'c'],
            },
          },
          count: 42,
        },
      };

      const result = await handler.onPermissionRequest(params);

      expect(result.approved).toBe(true);
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('complex_action')
      );
    });

    it('handles file paths with special characters', async () => {
      const params: types.ReadTextFileParams = {
        path: '/workspace/root/special-chars!@#$%.txt',
      };

      mockReadFile.mockResolvedValue('special content');

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe('special content');
    });

    it('handles Windows-style paths', async () => {
      const params: types.ReadTextFileParams = {
        path: 'C:\\Users\\test\\file.txt',
      };

      mockReadFile.mockResolvedValue('windows content');

      const result = await handler.onReadTextFile(params);

      expect(result.content).toBe('windows content');
    });
  });
});
