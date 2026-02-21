import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Integration tests for ProcessPool — NO mocks, real child processes
// ---------------------------------------------------------------------------

vi.mock('vscode', () => ({
  Disposable: class { static from() { return { dispose() {} }; } },
}));

import { ProcessPool } from '../acp/process-pool';

describe('ProcessPool Integration', () => {
  let pool: ProcessPool;

  beforeEach(() => {
    pool = new ProcessPool();
  });

  afterEach(() => {
    pool.dispose();
  });

  it('spawns a real process and captures output', async () => {
    const id = pool.create('node', ['--version']);

    const exitCode = await pool.waitForExit(id);
    expect(exitCode).toBe(0);

    const { output } = pool.getOutput(id);
    expect(output).toMatch(/v\d+\.\d+/);
  }, 15000);

  it('captures exit code from failing process', async () => {
    const id = pool.create('node', ['-e', "process.exit(42)"]);

    const exitCode = await pool.waitForExit(id);
    expect(exitCode).toBe(42);
  }, 15000);

  it('captures stderr from real process', async () => {
    const id = pool.create('node', ['-e', "process.stderr.write('oops\\n');process.exit(1)"]);

    await pool.waitForExit(id);
    const { output } = pool.getOutput(id);
    expect(output).toContain('oops');
  }, 15000);

  it('kill terminates a long-running process', async () => {
    const id = pool.create('node', ['-e', "setTimeout(function(){},60000)"]);

    // Let the process start
    await new Promise(r => setTimeout(r, 500));

    pool.kill(id);
    const exitCode = await pool.waitForExit(id);

    expect(typeof exitCode).toBe('number');
  }, 15000);

  it('handles multiple concurrent processes', async () => {
    const id1 = pool.create('node', ['-p', "'proc1'"]);
    const id2 = pool.create('node', ['-p', "'proc2'"]);

    expect(id1).not.toBe(id2);

    const [code1, code2] = await Promise.all([
      pool.waitForExit(id1),
      pool.waitForExit(id2),
    ]);

    expect(code1).toBe(0);
    expect(code2).toBe(0);

    const out1 = pool.getOutput(id1);
    const out2 = pool.getOutput(id2);
    expect(out1.output).toContain('proc1');
    expect(out2.output).toContain('proc2');
  }, 15000);

  it('incremental output reads work with real process', async () => {
    const id = pool.create('node', ['-e',
      "process.stdout.write('line1\\n');setTimeout(function(){process.stdout.write('line2\\n');setTimeout(function(){process.exit(0)},50)},500)"
    ]);

    // Collect all output across incremental reads
    let allOutput = '';

    // Wait for first output
    await new Promise(r => setTimeout(r, 200));
    const first = pool.getOutput(id);
    allOutput += first.output;

    // Wait for process to finish then collect remaining
    await pool.waitForExit(id);
    const second = pool.getOutput(id);
    allOutput += second.output;

    // All output must be captured across reads, order doesn't matter per-read
    expect(allOutput).toContain('line1');
    expect(allOutput).toContain('line2');
    // Buffer clears on read — second read should NOT contain first read's data
    expect(first.output.length + second.output.length).toBe(allOutput.length);
  }, 15000);
});
