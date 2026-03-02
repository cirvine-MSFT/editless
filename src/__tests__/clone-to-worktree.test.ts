import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// ----- Hoisted mocks --------------------------------------------------------
const {
  mockShowQuickPick,
  mockShowInputBox,
  mockShowErrorMessage,
  mockShowInformationMessage,
  mockUpdateWorkspaceFolders,
  mockExecFile,
  mockGetDiscoveredItems,
  mockRefreshDiscovery,
} = vi.hoisted(() => ({
  mockShowQuickPick: vi.fn(),
  mockShowInputBox: vi.fn(),
  mockShowErrorMessage: vi.fn(),
  mockShowInformationMessage: vi.fn(),
  mockUpdateWorkspaceFolders: vi.fn(() => true),
  mockExecFile: vi.fn(),
  mockGetDiscoveredItems: vi.fn().mockReturnValue([]),
  mockRefreshDiscovery: vi.fn(),
}));

vi.mock('vscode', () => ({
  TreeItem: class { constructor(public label: string) {} },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class { constructor(public id: string) {} },
  MarkdownString: class { constructor(public value = '') {} },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => p }),
  },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  commands: { registerCommand: vi.fn((_id: string, handler: Function) => ({ dispose: vi.fn(), handler })) },
  window: {
    showQuickPick: mockShowQuickPick,
    showInputBox: mockShowInputBox,
    showErrorMessage: mockShowErrorMessage,
    showInformationMessage: mockShowInformationMessage,
    createOutputChannel: () => ({ appendLine: vi.fn(), dispose: vi.fn() }),
  },
  workspace: {
    workspaceFolders: [],
    updateWorkspaceFolders: mockUpdateWorkspaceFolders,
  },
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: (fn: any) => fn === mockExecFile ? mockExecFile : vi.fn(),
}));

// ----- Import under test ----------------------------------------------------
import { isValidBranchName, defaultWorktreePath } from '../commands/agent-commands';

describe('Clone to Worktree helpers', () => {
  describe('defaultWorktreePath', () => {
    it('computes {parent}/../{name}.wt/{branch-slug}', () => {
      const result = defaultWorktreePath('/repos/my-project', 'feature/cool');
      expect(result).toBe(path.join('/repos', 'my-project.wt', 'feature-cool'));
    });

    it('handles simple branch names', () => {
      const result = defaultWorktreePath('/repos/my-project', 'main');
      expect(result).toBe(path.join('/repos', 'my-project.wt', 'main'));
    });
  });

  describe('isValidBranchName', () => {
    it('rejects empty string', () => expect(isValidBranchName('')).toBe(false));
    it('rejects spaces', () => expect(isValidBranchName('my branch')).toBe(false));
    it('rejects tilde', () => expect(isValidBranchName('a~b')).toBe(false));
    it('rejects double dot', () => expect(isValidBranchName('a..b')).toBe(false));
    it('rejects .lock suffix', () => expect(isValidBranchName('a.lock')).toBe(false));
    it('accepts valid names', () => expect(isValidBranchName('feature/foo-bar')).toBe(true));
    it('accepts simple names', () => expect(isValidBranchName('main')).toBe(true));
  });
});

describe('editless.cloneToWorktree command', () => {
  let handler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetDiscoveredItems.mockReturnValue([
      { id: 'squad:my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/repos/my-project' },
    ]);

    // Dynamically register the command and capture its handler
    const vscode = await import('vscode');
    const handlers = new Map<string, Function>();
    (vscode.commands.registerCommand as any).mockImplementation((id: string, h: Function) => {
      handlers.set(id, h);
      return { dispose: vi.fn() };
    });

    const { register } = await import('../commands/agent-commands');
    register({ subscriptions: [], globalStorageUri: { fsPath: '/tmp' } } as any, {
      agentSettings: { get: vi.fn(), isHidden: vi.fn(), hide: vi.fn(), show: vi.fn(), showAll: vi.fn(), getHiddenIds: vi.fn().mockReturnValue([]), update: vi.fn(), settingsPath: '/mock' } as any,
      treeProvider: { refresh: vi.fn(), getDiscoveredItems: mockGetDiscoveredItems, setDiscoveredItems: vi.fn() } as any,
      terminalManager: { launchTerminal: vi.fn() } as any,
      labelManager: { getLabel: vi.fn(), setLabel: vi.fn() } as any,
      getDiscoveredItems: mockGetDiscoveredItems,
      refreshDiscovery: mockRefreshDiscovery,
      ensureWorkspaceFolder: vi.fn(),
      output: { appendLine: vi.fn() } as any,
    });

    handler = handlers.get('editless.cloneToWorktree')!;
    expect(handler).toBeDefined();
  });

  it('does nothing when user cancels quick pick', async () => {
    mockExecFile.mockResolvedValue({ stdout: 'main\ndev\n', stderr: '' });
    mockShowQuickPick.mockResolvedValue(undefined);

    await handler({ squadId: 'squad:my-squad', type: 'squad' });

    expect(mockUpdateWorkspaceFolders).not.toHaveBeenCalled();
    expect(mockRefreshDiscovery).not.toHaveBeenCalled();
  });

  it('shows error when git worktree add fails', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }); // branch list
    mockShowQuickPick.mockResolvedValue({ label: 'main', isNew: false });
    mockShowInputBox.mockResolvedValue('/tmp/wt/main');
    mockExecFile.mockRejectedValueOnce({ stderr: 'fatal: already checked out' });

    await handler({ squadId: 'squad:my-squad', type: 'squad' });

    expect(mockShowErrorMessage).toHaveBeenCalledWith(expect.stringContaining('already checked out'));
    expect(mockUpdateWorkspaceFolders).not.toHaveBeenCalled();
  });

  it('creates worktree and updates workspace on success', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: 'main\ndev\n', stderr: '' }); // branch list
    mockShowQuickPick.mockResolvedValue({ label: 'dev', isNew: false });
    mockShowInputBox.mockResolvedValue('/tmp/wt/dev');
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }); // worktree add

    await handler({ squadId: 'squad:my-squad', type: 'squad' });

    expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'add', '/tmp/wt/dev', 'dev'], { cwd: '/repos/my-project' });
    expect(mockUpdateWorkspaceFolders).toHaveBeenCalled();
    expect(mockRefreshDiscovery).toHaveBeenCalled();
    expect(mockShowInformationMessage).toHaveBeenCalledWith(expect.stringContaining('/tmp/wt/dev'));
  });

  it('uses -b flag for new branches', async () => {
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }); // branch list
    mockShowQuickPick.mockResolvedValue({ label: '$(add) Create new branch', isNew: true });
    mockShowInputBox
      .mockResolvedValueOnce('feature/new') // branch name
      .mockResolvedValueOnce('/tmp/wt/feature-new'); // path
    mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }); // worktree add

    await handler({ squadId: 'squad:my-squad', type: 'squad' });

    expect(mockExecFile).toHaveBeenCalledWith('git', ['worktree', 'add', '-b', 'feature/new', '/tmp/wt/feature-new'], { cwd: '/repos/my-project' });
    expect(mockUpdateWorkspaceFolders).toHaveBeenCalled();
  });
});
