import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockSpawn, mockExecSync, mockRandomUUID } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExecSync: vi.fn(),
  mockRandomUUID: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
  execSync: mockExecSync,
}));

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID,
}));

vi.mock('vscode', () => ({
  Disposable: class { static from() { return { dispose() {} }; } },
}));

import { ProcessPool } from '../acp/process-pool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockProcess() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12345;
  proc.kill = vi.fn();
  return proc;
}

let uuidCounter = 0;
function resetUUID() {
  uuidCounter = 0;
  mockRandomUUID.mockImplementation(() => `term-${++uuidCounter}`);
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('ProcessPool', () => {
  let pool: ProcessPool;

  beforeEach(() => {
    vi.clearAllMocks();
    resetUUID();
    pool = new ProcessPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  // -----------------------------------------------------------------------
  // Process lifecycle
  // -----------------------------------------------------------------------

  describe('create()', () => {
    it('spawns a process and returns a unique terminalId', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hello']);

      expect(id).toBe('term-1');
      expect(mockSpawn).toHaveBeenCalledWith('echo', ['hello'], expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }));
    });

    it('multiple create() calls return different terminalIds', () => {
      mockSpawn.mockReturnValue(createMockProcess());

      const id1 = pool.create('echo', ['one']);
      const id2 = pool.create('echo', ['two']);
      const id3 = pool.create('echo', ['three']);

      expect(id1).toBe('term-1');
      expect(id2).toBe('term-2');
      expect(id3).toBe('term-3');
    });

    it('passes cwd to spawn', () => {
      mockSpawn.mockReturnValue(createMockProcess());

      pool.create('ls', ['-la'], '/home/user');

      expect(mockSpawn).toHaveBeenCalledWith('ls', ['-la'], expect.objectContaining({
        cwd: '/home/user',
      }));
    });

    it('merges env with process.env when env provided', () => {
      mockSpawn.mockReturnValue(createMockProcess());

      pool.create('cmd', [], undefined, { MY_VAR: 'hello' });

      const spawnCall = mockSpawn.mock.calls[0][2];
      expect(spawnCall.env).toEqual(expect.objectContaining({ MY_VAR: 'hello' }));
    });

    it('does not set env when no env provided', () => {
      mockSpawn.mockReturnValue(createMockProcess());

      pool.create('cmd', []);

      const spawnCall = mockSpawn.mock.calls[0][2];
      expect(spawnCall.env).toBeUndefined();
    });

    it('defaults args to empty array when not provided', () => {
      mockSpawn.mockReturnValue(createMockProcess());

      pool.create('echo');

      expect(mockSpawn).toHaveBeenCalledWith('echo', [], expect.any(Object));
    });

    it('exit triggers exit code availability', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hi']);
      mockProc.emit('exit', 0);

      const { exitCode } = pool.getOutput(id);
      expect(exitCode).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Output buffering
  // -----------------------------------------------------------------------

  describe('getOutput()', () => {
    it('returns accumulated stdout', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hello']);
      mockProc.stdout.emit('data', Buffer.from('hello world\n'));

      const result = pool.getOutput(id);
      expect(result.output).toBe('hello world\n');
    });

    it('clears buffer after read (incremental reads)', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.stdout.emit('data', Buffer.from('line1\n'));

      const first = pool.getOutput(id);
      expect(first.output).toBe('line1\n');

      const second = pool.getOutput(id);
      expect(second.output).toBe('');
    });

    it('successive getOutput() calls only return new output', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.stdout.emit('data', Buffer.from('batch1\n'));
      pool.getOutput(id);

      mockProc.stdout.emit('data', Buffer.from('batch2\n'));
      const result = pool.getOutput(id);
      expect(result.output).toBe('batch2\n');
    });

    it('returns empty for non-existent terminalId', () => {
      const result = pool.getOutput('nonexistent-id');
      expect(result).toEqual({ output: '', exitCode: null });
    });

    it('combines stdout and stderr in output', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.stdout.emit('data', Buffer.from('stdout text\n'));
      mockProc.stderr.emit('data', Buffer.from('stderr text\n'));

      const result = pool.getOutput(id);
      expect(result.output).toContain('stdout text');
      expect(result.output).toContain('stderr text');
    });

    it('returns exitCode as null while process is running', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('sleep', ['10']);
      const result = pool.getOutput(id);
      expect(result.exitCode).toBeNull();
    });

    it('returns exitCode after process exits', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.emit('exit', 42);

      const result = pool.getOutput(id);
      expect(result.exitCode).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // waitForExit
  // -----------------------------------------------------------------------

  describe('waitForExit()', () => {
    it('resolves with exit code 0 for successful command', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hello']);
      mockProc.emit('exit', 0);

      const code = await pool.waitForExit(id);
      expect(code).toBe(0);
    });

    it('resolves with non-zero for failing command', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('false', []);
      mockProc.emit('exit', 127);

      const code = await pool.waitForExit(id);
      expect(code).toBe(127);
    });

    it('resolves immediately if process already exited', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['fast']);
      mockProc.emit('exit', 0);

      // Second call should still resolve
      const code = await pool.waitForExit(id);
      expect(code).toBe(0);
    });

    it('multiple waitForExit calls on same terminal all resolve', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['multi']);

      const p1 = pool.waitForExit(id);
      const p2 = pool.waitForExit(id);
      const p3 = pool.waitForExit(id);

      mockProc.emit('exit', 0);

      const [c1, c2, c3] = await Promise.all([p1, p2, p3]);
      expect(c1).toBe(0);
      expect(c2).toBe(0);
      expect(c3).toBe(0);
    });

    it('returns 1 for non-existent terminalId', async () => {
      const code = await pool.waitForExit('does-not-exist');
      expect(code).toBe(1);
    });

    it('resolves with 1 when exit code is null', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.emit('exit', null);

      const code = await pool.waitForExit(id);
      expect(code).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Kill / Release
  // -----------------------------------------------------------------------

  describe('kill()', () => {
    it('terminates a running process', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('sleep', ['999']);

      pool.kill(id);

      // On Win32, uses execSync taskkill; on Unix, uses SIGKILL
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('taskkill'),
          expect.any(Object)
        );
      } else {
        expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      }
    });

    it('does not throw on already-dead process', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['done']);
      mockProc.emit('exit', 0);

      expect(() => pool.kill(id)).not.toThrow();
    });

    it('does not throw on non-existent terminalId', () => {
      expect(() => pool.kill('nonexistent')).not.toThrow();
    });

    it('handles undefined pid gracefully', () => {
      const mockProc = createMockProcess();
      mockProc.pid = undefined as any;
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);

      expect(() => pool.kill(id)).not.toThrow();
      expect(mockExecSync).not.toHaveBeenCalled();
      expect(mockProc.kill).not.toHaveBeenCalled();
    });
  });

  describe('release()', () => {
    it('cleans up resources', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hi']);
      mockProc.emit('exit', 0);

      pool.release(id);

      // After release, getOutput returns empty
      const result = pool.getOutput(id);
      expect(result).toEqual({ output: '', exitCode: null });
    });

    it('kills running process before release', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('sleep', ['999']);

      pool.release(id);

      // Should have attempted kill
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalled();
      } else {
        expect(mockProc.kill).toHaveBeenCalledWith('SIGKILL');
      }
    });

    it('release after kill works', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('sleep', ['999']);

      pool.kill(id);
      mockProc.emit('exit', 137);

      expect(() => pool.release(id)).not.toThrow();
    });

    it('does not throw on non-existent terminalId', () => {
      expect(() => pool.release('nonexistent')).not.toThrow();
    });

    it('operations on released terminal return defaults', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hi']);
      mockProc.emit('exit', 0);
      pool.release(id);

      // getOutput returns empty for released terminal
      expect(pool.getOutput(id)).toEqual({ output: '', exitCode: null });
      // waitForExit returns 1 for released terminal
      expect(pool.waitForExit(id)).resolves.toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Dispose
  // -----------------------------------------------------------------------

  describe('dispose()', () => {
    it('kills all running processes', () => {
      const proc1 = createMockProcess();
      proc1.pid = 111;
      const proc2 = createMockProcess();
      proc2.pid = 222;

      mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      pool.create('sleep', ['10']);
      pool.create('sleep', ['20']);

      pool.dispose();

      // Both processes should be killed
      if (process.platform === 'win32') {
        expect(mockExecSync).toHaveBeenCalledTimes(2);
      } else {
        expect(proc1.kill).toHaveBeenCalledWith('SIGKILL');
        expect(proc2.kill).toHaveBeenCalledWith('SIGKILL');
      }
    });

    it('does not throw with no processes', () => {
      expect(() => pool.dispose()).not.toThrow();
    });

    it('operations after dispose return defaults', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('echo', ['hi']);
      pool.dispose();

      expect(pool.getOutput(id)).toEqual({ output: '', exitCode: null });
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('Edge cases', () => {
    it('process that writes to stderr', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.stderr.emit('data', Buffer.from('error: something went wrong\n'));

      const result = pool.getOutput(id);
      expect(result.output).toContain('error: something went wrong');
    });

    it('large output does not truncate', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      const largeChunk = Buffer.from('x'.repeat(100000));
      mockProc.stdout.emit('data', largeChunk);

      const result = pool.getOutput(id);
      expect(result.output.length).toBe(100000);
    });

    it('rapid create/kill cycles do not crash', () => {
      for (let i = 0; i < 10; i++) {
        const mockProc = createMockProcess();
        mockProc.pid = 10000 + i;
        mockSpawn.mockReturnValue(mockProc);

        const id = pool.create('echo', [`iteration-${i}`]);
        pool.kill(id);
        pool.release(id);
      }

      expect(mockSpawn).toHaveBeenCalledTimes(10);
    });

    it('spawn error resolves waitForExit with code 1', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('nonexistent-command-xyz', []);
      mockProc.emit('error', new Error('spawn nonexistent-command-xyz ENOENT'));

      const code = await pool.waitForExit(id);
      expect(code).toBe(1);
    });

    it('multiple stdout chunks accumulate', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.stdout.emit('data', Buffer.from('chunk1'));
      mockProc.stdout.emit('data', Buffer.from('chunk2'));
      mockProc.stdout.emit('data', Buffer.from('chunk3'));

      const result = pool.getOutput(id);
      expect(result.output).toBe('chunk1chunk2chunk3');
    });

    it('error after exit does not change exit code', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const id = pool.create('cmd', []);
      mockProc.emit('exit', 0);
      mockProc.emit('error', new Error('late error'));

      const code = await pool.waitForExit(id);
      expect(code).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration Tests (real processes — separate file needed for unmocked imports)
// See acp-process-pool-integration.test.ts
// ---------------------------------------------------------------------------
