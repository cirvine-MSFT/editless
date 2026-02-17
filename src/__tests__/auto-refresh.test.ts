import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ----- Hoisted mock wiring ---------------------------------------------------
const windowStateCbs: Array<(state: { focused: boolean }) => void> = [];
const configChangeCbs: Array<(e: { affectsConfiguration: (s: string) => boolean }) => void> = [];
const terminalCloseCbs: Array<() => void> = [];
const shellEndCbs: Array<() => void> = [];
const taskEndCbs: Array<(e: { execution: { task: { name: string; source: string } } }) => void> = [];

let mockRefreshIntervalMinutes = 1;

vi.mock('vscode', () => ({
  window: {
    onDidChangeWindowState: (cb: (state: { focused: boolean }) => void) => {
      windowStateCbs.push(cb);
      return { dispose: () => { const i = windowStateCbs.indexOf(cb); if (i >= 0) windowStateCbs.splice(i, 1); } };
    },
    onDidCloseTerminal: (cb: () => void) => {
      terminalCloseCbs.push(cb);
      return { dispose: () => { const i = terminalCloseCbs.indexOf(cb); if (i >= 0) terminalCloseCbs.splice(i, 1); } };
    },
    onDidEndTerminalShellExecution: (cb: () => void) => {
      shellEndCbs.push(cb);
      return { dispose: () => { const i = shellEndCbs.indexOf(cb); if (i >= 0) shellEndCbs.splice(i, 1); } };
    },
  },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: number) => mockRefreshIntervalMinutes ?? defaultValue,
    }),
    onDidChangeConfiguration: (cb: (e: { affectsConfiguration: (s: string) => boolean }) => void) => {
      configChangeCbs.push(cb);
      return { dispose: () => { const i = configChangeCbs.indexOf(cb); if (i >= 0) configChangeCbs.splice(i, 1); } };
    },
  },
  tasks: {
    onDidEndTask: (cb: (e: { execution: { task: { name: string; source: string } } }) => void) => {
      taskEndCbs.push(cb);
      return { dispose: () => { const i = taskEndCbs.indexOf(cb); if (i >= 0) taskEndCbs.splice(i, 1); } };
    },
  },
}));

import { initAutoRefresh } from '../auto-refresh';

// ----- Helpers ---------------------------------------------------------------
function makeProviders() {
  return {
    workItems: { refresh: vi.fn() },
    prs: { refresh: vi.fn() },
  };
}

function fireWindowFocus(focused: boolean): void {
  for (const cb of [...windowStateCbs]) cb({ focused });
}

function fireTerminalClose(): void {
  for (const cb of [...terminalCloseCbs]) cb();
}

function fireShellEnd(): void {
  for (const cb of [...shellEndCbs]) cb();
}

function fireTaskEnd(name: string, source = ''): void {
  for (const cb of [...taskEndCbs]) cb({ execution: { task: { name, source } } });
}

function fireConfigChange(section: string): void {
  for (const cb of [...configChangeCbs]) cb({ affectsConfiguration: (s: string) => s === section });
}

// ----- Tests -----------------------------------------------------------------
describe('initAutoRefresh', () => {
  let disposable: { dispose: () => void };
  let providers: ReturnType<typeof makeProviders>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRefreshIntervalMinutes = 1;
    windowStateCbs.length = 0;
    configChangeCbs.length = 0;
    terminalCloseCbs.length = 0;
    shellEndCbs.length = 0;
    taskEndCbs.length = 0;
    providers = makeProviders();
    disposable = initAutoRefresh(
      providers.workItems as any,
      providers.prs as any,
    );
  });

  afterEach(() => {
    disposable.dispose();
    vi.useRealTimers();
  });

  // --- Timer polling ---
  it('should refresh both trees on timer interval (1 minute default)', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    vi.advanceTimersByTime(60_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should not refresh before the interval elapses', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    vi.advanceTimersByTime(30_000);

    expect(providers.workItems.refresh).not.toHaveBeenCalled();
    expect(providers.prs.refresh).not.toHaveBeenCalled();
  });

  it('should disable timer when refreshInterval is 0', () => {
    disposable.dispose();
    mockRefreshIntervalMinutes = 0;
    providers = makeProviders();
    disposable = initAutoRefresh(providers.workItems as any, providers.prs as any);

    vi.advanceTimersByTime(300_000);

    expect(providers.workItems.refresh).not.toHaveBeenCalled();
    expect(providers.prs.refresh).not.toHaveBeenCalled();
  });

  // --- Window focus ---
  it('should refresh immediately on window focus', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireWindowFocus(true);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should not refresh when window loses focus', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireWindowFocus(false);

    expect(providers.workItems.refresh).not.toHaveBeenCalled();
  });

  // --- Terminal close ---
  it('should refresh after terminal close with debounce', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireTerminalClose();

    expect(providers.workItems.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should debounce multiple terminal close events', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireTerminalClose();
    vi.advanceTimersByTime(500);
    fireTerminalClose();
    vi.advanceTimersByTime(500);
    fireTerminalClose();

    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  // --- Shell execution end ---
  it('should refresh after shell execution ends with debounce', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireShellEnd();
    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  // --- Git task end ---
  it('should refresh after a git task completes', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireTaskEnd('git push', 'git');
    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
    expect(providers.prs.refresh).toHaveBeenCalledTimes(1);
  });

  it('should refresh for tasks with git in the name', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireTaskEnd('Run Git Pull', 'shell');
    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
  });

  it('should not refresh for non-git tasks', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    fireTaskEnd('npm install', 'npm');
    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).not.toHaveBeenCalled();
  });

  // --- Config change ---
  it('should restart timer when refreshInterval setting changes', () => {
    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    mockRefreshIntervalMinutes = 2;
    fireConfigChange('editless.refreshInterval');

    vi.advanceTimersByTime(60_000);
    expect(providers.workItems.refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000);
    expect(providers.workItems.refresh).toHaveBeenCalledTimes(1);
  });

  // --- Dispose ---
  it('should clean up all listeners on dispose', () => {
    disposable.dispose();

    providers.workItems.refresh.mockClear();
    providers.prs.refresh.mockClear();

    vi.advanceTimersByTime(120_000);
    fireWindowFocus(true);
    fireTerminalClose();
    vi.advanceTimersByTime(2_000);

    expect(providers.workItems.refresh).not.toHaveBeenCalled();
    expect(providers.prs.refresh).not.toHaveBeenCalled();
  });
});
