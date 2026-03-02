import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

vi.mock('vscode', () => ({
  Uri: {
    file: (s: string) => ({ fsPath: s, toString: () => `file://${s}` }),
    parse: (s: string) => ({ toString: () => s }),
  },
  Position: class {
    constructor(public line: number, public character: number) {}
  },
  Range: class {
    constructor(public start: unknown, public end: unknown) {}
  },
  env: { openExternal: vi.fn() },
  window: {
    showTextDocument: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
}));

import { EditlessTerminalLinkProvider, type TerminalLinkWithData } from '../terminal-link-provider';

function makeContext(line: string) {
  return { line, terminal: {} as unknown };
}

describe('EditlessTerminalLinkProvider — provideTerminalLinks', () => {
  let provider: EditlessTerminalLinkProvider;

  beforeEach(() => {
    provider = new EditlessTerminalLinkProvider(
      () => ({ org: 'myorg', project: 'myproject' }),
      () => 'owner/repo',
    );
  });

  // --- GitHub references ---

  it('matches bare #123', () => {
    const links = provider.provideTerminalLinks(makeContext('Fixed #42 and closed') as any);
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks).toHaveLength(1);
    expect(ghLinks[0].data.value).toBe('42');
  });

  it('matches PR #123', () => {
    const links = provider.provideTerminalLinks(makeContext('See PR #99 for details') as any);
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks.length).toBeGreaterThanOrEqual(1);
    expect(ghLinks.some(l => l.data.value === '99')).toBe(true);
  });

  it('matches issue #456', () => {
    const links = provider.provideTerminalLinks(makeContext('Closes issue #456') as any);
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks.some(l => l.data.value === '456')).toBe(true);
  });

  it('does not match numbers without # prefix', () => {
    const links = provider.provideTerminalLinks(makeContext('Version 123 released') as any);
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks).toHaveLength(0);
  });

  it('does not match # inside words like hex colors', () => {
    const links = provider.provideTerminalLinks(makeContext('color: #ff0000') as any);
    // #ff0000 is not digits-only, so should not match
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks).toHaveLength(0);
  });

  it('matches multiple refs on one line', () => {
    const links = provider.provideTerminalLinks(makeContext('Fixed #10, #20, and PR #30') as any);
    const ghLinks = links.filter(l => l.data.type === 'github-ref');
    expect(ghLinks.length).toBeGreaterThanOrEqual(3);
  });

  // --- ADO references ---

  it('matches WI#12345', () => {
    const links = provider.provideTerminalLinks(makeContext('Linked to WI#12345') as any);
    const adoLinks = links.filter(l => l.data.type === 'ado-ref');
    expect(adoLinks).toHaveLength(1);
    expect(adoLinks[0].data.value).toBe('12345');
  });

  it('matches US#999', () => {
    const links = provider.provideTerminalLinks(makeContext('Working on US#999') as any);
    const adoLinks = links.filter(l => l.data.type === 'ado-ref');
    expect(adoLinks).toHaveLength(1);
    expect(adoLinks[0].data.value).toBe('999');
  });

  it('matches Bug#42 and Task#7', () => {
    const links = provider.provideTerminalLinks(makeContext('Bug#42 blocks Task#7') as any);
    const adoLinks = links.filter(l => l.data.type === 'ado-ref');
    expect(adoLinks).toHaveLength(2);
  });

  // --- File paths ---

  it('matches src/foo.ts', () => {
    const links = provider.provideTerminalLinks(makeContext('Error in src/foo.ts') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0].data.value).toBe('src/foo.ts');
  });

  it('matches file path with line number', () => {
    const links = provider.provideTerminalLinks(makeContext('src/bar.ts:42') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0].data.value).toBe('src/bar.ts');
    expect(fileLinks[0].data.line).toBe(42);
  });

  it('matches file path with line and column', () => {
    const links = provider.provideTerminalLinks(makeContext('src/baz.ts:10:5') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0].data.line).toBe(10);
    expect(fileLinks[0].data.column).toBe(5);
  });

  it('matches ./relative/path.js', () => {
    const links = provider.provideTerminalLinks(makeContext('See ./relative/path.js') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0].data.value).toBe('./relative/path.js');
  });

  it('matches absolute paths', () => {
    const links = provider.provideTerminalLinks(makeContext('Error in /home/user/project/src/file.ts') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
    expect(fileLinks[0].data.value).toBe('/home/user/project/src/file.ts');
  });

  it('matches Windows absolute paths', () => {
    const links = provider.provideTerminalLinks(makeContext('Error in C:\\Users\\dev\\src\\file.ts') as any);
    const fileLinks = links.filter(l => l.data.type === 'file-path');
    expect(fileLinks).toHaveLength(1);
  });
});

describe('EditlessTerminalLinkProvider — handleTerminalLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens GitHub URL for github-ref', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => undefined,
      () => 'owner/repo',
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 3,
      data: { type: 'github-ref', value: '42' },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.env.openExternal).toHaveBeenCalledWith(
      expect.objectContaining({ toString: expect.any(Function) }),
    );
  });

  it('shows warning when no GitHub repo configured', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => undefined,
      () => undefined,
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 3,
      data: { type: 'github-ref', value: '42' },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('opens ADO URL for ado-ref', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => ({ org: 'myorg', project: 'myproject' }),
      () => undefined,
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 8,
      data: { type: 'ado-ref', value: '12345' },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.env.openExternal).toHaveBeenCalled();
  });

  it('shows warning when no ADO config for ado-ref', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => undefined,
      () => undefined,
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 8,
      data: { type: 'ado-ref', value: '12345' },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('opens file in editor for file-path', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => undefined,
      () => undefined,
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 10,
      data: { type: 'file-path', value: 'src/foo.ts' },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.window.showTextDocument).toHaveBeenCalled();
  });

  it('opens file at specific line for file-path with line', async () => {
    const provider = new EditlessTerminalLinkProvider(
      () => undefined,
      () => undefined,
    );
    const link: TerminalLinkWithData = {
      startIndex: 0,
      length: 13,
      data: { type: 'file-path', value: 'src/foo.ts', line: 42 },
    };
    await provider.handleTerminalLink(link);
    expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ selection: expect.anything() }),
    );
  });
});
