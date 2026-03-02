import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  TreeItem: class {},
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string) {} },
  ThemeColor: class { constructor(public id: string) {} },
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); dispose = vi.fn(); },
  Uri: { file: (s: string) => ({ fsPath: s }) },
  RelativePattern: class {},
  workspace: { createFileSystemWatcher: vi.fn(() => ({ onDidChange: vi.fn(), onDidCreate: vi.fn(), onDidDelete: vi.fn(), dispose: vi.fn() })) },
}));

import { shortenBranch } from '../editless-tree';

describe('shortenBranch', () => {
  it('strips feat/ prefix', () => {
    expect(shortenBranch('feat/auth-refactor')).toBe('auth-refactor');
  });

  it('strips fix/ prefix', () => {
    expect(shortenBranch('fix/crash-on-load')).toBe('crash-on-load');
  });

  it('strips squad/ prefix', () => {
    expect(shortenBranch('squad/42-login-page')).toBe('42-login-page');
  });

  it('strips feature/ prefix', () => {
    expect(shortenBranch('feature/new-dashboard')).toBe('new-dashboard');
  });

  it('strips bugfix/ prefix', () => {
    expect(shortenBranch('bugfix/memory-leak')).toBe('memory-leak');
  });

  it('strips hotfix/ prefix', () => {
    expect(shortenBranch('hotfix/urgent-fix')).toBe('urgent-fix');
  });

  it('strips release/ prefix', () => {
    expect(shortenBranch('release/v2.0')).toBe('v2.0');
  });

  it('leaves main as-is', () => {
    expect(shortenBranch('main')).toBe('main');
  });

  it('leaves master as-is', () => {
    expect(shortenBranch('master')).toBe('master');
  });

  it('truncates long names with ellipsis', () => {
    const long = 'this-is-a-very-long-branch-name-that-should-be-truncated';
    const result = shortenBranch(long);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate names at exactly maxLen', () => {
    const exact = '12345678901234567890'; // exactly 20 chars
    expect(shortenBranch(exact)).toBe(exact);
  });

  it('respects custom maxLen', () => {
    expect(shortenBranch('some-long-branch', 10).length).toBeLessThanOrEqual(10);
  });

  it('handles nested paths without known prefix', () => {
    const result = shortenBranch('user/cirvine/experiment');
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result.endsWith('…')).toBe(true);
  });
});
