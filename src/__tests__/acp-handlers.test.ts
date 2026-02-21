import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockReadFile, mockWriteFile, mockMkdir, mockOutputChannel, mockPool } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockMkdir: vi.fn(),
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
  mockPool: {
    create: vi.fn().mockReturnValue('mock-term-1'),
    getOutput: vi.fn().mockReturnValue({ output: '', exitCode: null }),
    waitForExit: vi.fn().mockResolvedValue(0),
    kill: vi.fn(),
    release: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
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

vi.mock('../acp/process-pool', () => ({
  ProcessPool: vi.fn(function() { return mockPool; }),
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

  describe('File writing', () => {
    it('writes file with absolute path', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const params: types.WriteTextFileParams = {
        path: '/absolute/path/to/file.txt',
        content: 'new content',
      };

      const result = await handler.onWriteTextFile(params);

      expect(result).toEqual({ success: true });
      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('path'), { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith('/absolute/path/to/file.txt', 'new content', 'utf-8');
    });

    it('writes file with relative path resolved to workspace', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const params: types.WriteTextFileParams = {
        path: 'relative/file.txt',
        content: 'relative content',
      };

      const result = await handler.onWriteTextFile(params);

      expect(result).toEqual({ success: true });
      const writePath = mockWriteFile.mock.calls[0][0];
      expect(writePath).toContain('relative');
      expect(writePath).toContain('file.txt');
    });

    it('creates parent directories recursively', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const params: types.WriteTextFileParams = {
        path: '/deep/nested/dir/file.txt',
        content: 'deep content',
      };

      await handler.onWriteTextFile(params);

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    it('throws on write error', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const params: types.WriteTextFileParams = {
        path: '/readonly/file.txt',
        content: 'content',
      };

      await expect(handler.onWriteTextFile(params)).rejects.toThrow(
        'Failed to write file: EACCES: permission denied'
      );
    });

    it('throws on mkdir error', async () => {
      mockMkdir.mockRejectedValue(new Error('EACCES: mkdir failed'));

      const params: types.WriteTextFileParams = {
        path: '/no-perms/file.txt',
        content: 'content',
      };

      await expect(handler.onWriteTextFile(params)).rejects.toThrow(
        'Failed to write file: EACCES: mkdir failed'
      );
    });

    it('logs write operations', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const params: types.WriteTextFileParams = {
        path: '/test/write.txt',
        content: 'logged content',
      };

      await handler.onWriteTextFile(params);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Write file')
      );
    });

    it('handles empty content', async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const params: types.WriteTextFileParams = {
        path: '/test/empty.txt',
        content: '',
      };

      const result = await handler.onWriteTextFile(params);
      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(expect.any(String), '', 'utf-8');
    });
  });

  describe('Terminal operations (ProcessPool delegation)', () => {
    it('terminal/create delegates to pool.create and returns terminalId', async () => {
      const params: types.TerminalCreateParams = {
        command: 'npm',
        args: ['test'],
        cwd: '/workspace',
      };

      const result = await handler.onTerminalCreate(params);

      expect(result).toEqual({ terminalId: 'mock-term-1' });
      expect(mockPool.create).toHaveBeenCalledWith('npm', ['test'], '/workspace', undefined);
    });

    it('terminal/create passes env to pool', async () => {
      const params: types.TerminalCreateParams = {
        command: 'cmd',
        args: [],
        env: { FOO: 'bar' },
      };

      await handler.onTerminalCreate(params);

      expect(mockPool.create).toHaveBeenCalledWith('cmd', [], undefined, { FOO: 'bar' });
    });

    it('terminal/create handles missing optional params', async () => {
      const params: types.TerminalCreateParams = {
        command: 'ls',
      };

      const result = await handler.onTerminalCreate(params);

      expect(result.terminalId).toBe('mock-term-1');
      expect(mockPool.create).toHaveBeenCalledWith('ls', undefined, undefined, undefined);
    });

    it('terminal/create logs command details', async () => {
      const params: types.TerminalCreateParams = {
        command: 'git',
        args: ['status'],
        cwd: '/repo',
      };

      await handler.onTerminalCreate(params);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('git status')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('/repo')
      );
    });

    it('terminal/output delegates to pool.getOutput', async () => {
      mockPool.getOutput.mockReturnValue({ output: 'hello world\n', exitCode: 0 });

      const params: types.TerminalOutputParams = {
        terminalId: 'term-123',
      };

      const result = await handler.onTerminalOutput(params);

      expect(result).toEqual({ output: 'hello world\n', exitCode: 0 });
      expect(mockPool.getOutput).toHaveBeenCalledWith('term-123');
    });

    it('terminal/output converts null exitCode to undefined', async () => {
      mockPool.getOutput.mockReturnValue({ output: '', exitCode: null });

      const params: types.TerminalOutputParams = { terminalId: 'term-123' };
      const result = await handler.onTerminalOutput(params);

      expect(result.exitCode).toBeUndefined();
    });

    it('terminal/wait_for_exit delegates to pool.waitForExit', async () => {
      mockPool.waitForExit.mockResolvedValue(0);

      const params: types.TerminalWaitForExitParams = {
        terminalId: 'term-123',
      };

      const result = await handler.onTerminalWaitForExit(params);

      expect(result).toEqual({ exitCode: 0 });
      expect(mockPool.waitForExit).toHaveBeenCalledWith('term-123');
    });

    it('terminal/wait_for_exit returns non-zero exit code', async () => {
      mockPool.waitForExit.mockResolvedValue(1);

      const params: types.TerminalWaitForExitParams = { terminalId: 'term-fail' };
      const result = await handler.onTerminalWaitForExit(params);

      expect(result.exitCode).toBe(1);
    });

    it('terminal/kill delegates to pool.kill', async () => {
      const params: types.TerminalKillParams = {
        terminalId: 'term-123',
      };

      const result = await handler.onTerminalKill(params);

      expect(result).toEqual({ success: true });
      expect(mockPool.kill).toHaveBeenCalledWith('term-123');
    });

    it('terminal/release delegates to pool.release', async () => {
      const params: types.TerminalReleaseParams = {
        terminalId: 'term-123',
      };

      const result = await handler.onTerminalRelease(params);

      expect(result).toEqual({ success: true });
      expect(mockPool.release).toHaveBeenCalledWith('term-123');
    });

    it('terminal/output logs operation details', async () => {
      mockPool.getOutput.mockReturnValue({ output: 'data', exitCode: null });

      await handler.onTerminalOutput({ terminalId: 'term-x' });

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('term-x')
      );
    });
  });

  describe('Dispose', () => {
    it('disposes the process pool', () => {
      handler.dispose();
      expect(mockPool.dispose).toHaveBeenCalled();
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
