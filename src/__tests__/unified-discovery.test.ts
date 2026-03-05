import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock vscode (required by discovery.ts)
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: (section?: string) => ({
      get: (key: string, defaultValue?: unknown) => {
        if (section === 'editless.cli' && key === 'launchCommand') {
          return 'copilot --agent $(agent)';
        }
        return defaultValue;
      },
    }),
    workspaceFolders: [],
  },
  window: {
    showInformationMessage: async () => undefined,
    showQuickPick: async () => undefined,
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
}));

import { discoverAll, type DiscoveredItem } from '../unified-discovery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'unified-discovery-test-'));
}

function writeFixture(relPath: string, content: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function wsFolder(fsPath: string): { uri: { fsPath: string } } {
  return { uri: { fsPath } };
}

beforeEach(() => {
  tmpDir = makeTmp();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// discoverAll
// ---------------------------------------------------------------------------

describe('discoverAll', () => {
  it('discovers agents from workspace folders', () => {
    writeFixture('ws/.github/agents/test.agent.md', '# Test Agent\n> A test agent.\n');


    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))]);

    const agent = result.find(i => i.id === 'test');
    expect(agent).toBeDefined();
    expect(agent!.type).toBe('agent');
    expect(agent!.source).toBe('workspace');
    expect(agent!.name).toBe('Test Agent');
  });

  it('discovers squad at workspace folder root', () => {
    // Workspace folder itself IS a squad (has .squad/team.md at root)
    const workspaceDir = path.join(tmpDir, 'my-squad');
    writeFixture('my-squad/.squad/team.md', '# My Squad\n> A squad at the root.\n**Universe:** dev\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'my-squad');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('dev');
    expect(squad!.path).toBe(workspaceDir);
  });

  it('parses Casting Universe variant from team.md', () => {
    const workspaceDir = path.join(tmpDir, 'cast-squad');
    writeFixture('cast-squad/.squad/team.md', '# Cast Squad\n> A squad.\n- **Casting Universe:** Greek Mythology\n');

    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'cast-squad');
    expect(squad).toBeDefined();
    expect(squad!.universe).toBe('Greek Mythology');
  });

  it('discovers .ai-team squad at workspace folder root', () => {
    // Workspace folder itself IS a squad (has .ai-team/team.md at root — legacy format)
    const workspaceDir = path.join(tmpDir, 'legacy-squad');
    writeFixture('legacy-squad/.ai-team/team.md', '# Legacy Root Squad\n> A legacy squad at the root.\n**Universe:** legacy\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'legacy-squad');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('legacy');
    expect(squad!.path).toBe(workspaceDir);
  });

  it('discovers squads from immediate children of workspace folders', () => {
    // Workspace folder contains a child directory that is a squad
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/child-squad/.squad/team.md', '# Child Squad\n> A child squad.\n**Universe:** test\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'child-squad');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('test');
  });

  it('does NOT discover squads from sibling directories (parent-dir scan)', () => {
    // Workspace is my-project; sibling-squad is a sibling — should NOT be found
    const workspaceDir = path.join(tmpDir, 'projects', 'my-project');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/sibling-squad/.squad/team.md', '# Sibling Squad\n> A sibling.\n**Universe:** test\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'sibling-squad');
    expect(squad).toBeUndefined();
  });

  it('returns all items regardless of settings (no registry filtering)', () => {
    writeFixture('ws/.github/agents/my-agent.agent.md', '# My Agent\n');

    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))]);

    // Discovery no longer filters — items always appear
    expect(result.find(i => i.id === 'my-agent')).toBeDefined();
  });

  it('returns squads from workspace even if previously registered', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/existing-squad/.squad/team.md', '# Existing\n> Already registered.\n**Universe:** prod\n');

    const result = discoverAll([wsFolder(workspaceDir)]);

    // Discovery returns everything — no registry exclusion
    expect(result.find(i => i.id === 'existing-squad')).toBeDefined();
  });

  it('deduplicates items by id', () => {
    // Same agent in two workspace folders
    writeFixture('ws1/.github/agents/shared.agent.md', '# Shared Agent\n');
    writeFixture('ws2/.github/agents/shared.agent.md', '# Shared Agent Copy\n');


    const result = discoverAll([
      wsFolder(path.join(tmpDir, 'ws1')),
      wsFolder(path.join(tmpDir, 'ws2')),
    ]);

    const shared = result.filter(i => i.id === 'shared');
    expect(shared).toHaveLength(1);
  });

  it('returns both agents and squads in a single result', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(path.join(workspaceDir, '.github', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, '.github', 'agents', 'helper.agent.md'), '# Helper\n> Helps.\n');
    writeFixture('projects/team-squad/.squad/team.md', '# Team Squad\n> A team.\n**Universe:** dev\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const agents = result.filter(i => i.type === 'agent');
    const squads = result.filter(i => i.type === 'squad');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(squads.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when nothing to discover', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty'), { recursive: true });


    const result = discoverAll([wsFolder(path.join(tmpDir, 'empty'))]);

    // May include copilot-dir agents from real home dir, but no workspace items
    const wsItems = result.filter(i => i.source === 'workspace');
    expect(wsItems).toEqual([]);
  });

  it('returns empty array for empty workspace folders list', () => {

    const result = discoverAll([]);
    // Only copilot-dir agents possible
    const wsItems = result.filter(i => i.source === 'workspace');
    expect(wsItems).toEqual([]);
  });

  it('sets correct DiscoveredItem fields for agents', () => {
    writeFixture('ws/.github/agents/bot.agent.md', '# Bot\n> Does bot things.\n');


    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))]);

    const bot = result.find(i => i.id === 'bot');
    expect(bot).toMatchObject({
      id: 'bot',
      name: 'Bot',
      type: 'agent',
      source: 'workspace',
      description: 'Does bot things.',
    });
    expect(bot!.path).toContain('bot.agent.md');
  });

  it('filters squad governance agents when squad is discovered from same folder', () => {
    const workspaceDir = path.join(tmpDir, 'ws');
    // Create both a squad AND its governance agent file
    writeFixture('ws/.squad/team.md', '# WS Squad\n> The squad.\n**Universe:** test\n');
    writeFixture('ws/.github/agents/squad.agent.md', '# Squad Coordinator\n> Governance file.\n');
    writeFixture('ws/.github/agents/helper.agent.md', '# Helper\n> Should survive.\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    // squad.agent.md should be filtered out (it's governance for the discovered squad)
    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
    // The squad itself should be present
    expect(result.find(i => i.type === 'squad')).toBeDefined();
    // Other agents in the same folder should survive
    expect(result.find(i => i.id === 'helper')).toBeDefined();
  });

  it('keeps squad.agent.md when no squad is discovered in that folder', () => {
    writeFixture('ws/.github/agents/squad.agent.md', '# Squad\n> Standalone agent, no squad here.\n');


    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result.find(i => i.id === 'squad')).toBeDefined();
  });

  it('keeps squad.agent.md when squad is discovered from a different workspace root', () => {
    // ws1 has a squad, ws2 has squad.agent.md but no squad
    const ws1 = path.join(tmpDir, 'ws1');
    const ws2 = path.join(tmpDir, 'ws2');
    writeFixture('ws1/.squad/team.md', '# WS1 Squad\n> Squad in ws1.\n**Universe:** test\n');
    writeFixture('ws2/.github/agents/squad.agent.md', '# Squad Agent\n> Governance in ws2.\n');


    const result = discoverAll([wsFolder(ws1), wsFolder(ws2)]);

    // ws2's squad.agent.md should survive — its root (ws2) has no squad
    const squadAgent = result.find(i => i.id === 'squad' && i.type === 'agent');
    expect(squadAgent).toBeDefined();
    expect(squadAgent!.path).toContain('ws2');
  });

  it('does not filter non-governance agents even when squad is discovered in the same root', () => {
    // ws has both a squad AND a regular agent — only squad.agent.md is filtered
    const ws = path.join(tmpDir, 'ws');
    writeFixture('ws/.squad/team.md', '# WS Squad\n> Squad.\n**Universe:** test\n');
    writeFixture('ws/.github/agents/squad.agent.md', '# Governance\n> Filtered.\n');
    writeFixture('ws/.github/agents/deploy.agent.md', '# Deploy\n> Not filtered.\n');


    const result = discoverAll([wsFolder(ws)]);

    // squad.agent.md filtered (governance for discovered squad)
    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
    // deploy.agent.md kept (not a governance file)
    expect(result.find(i => i.id === 'deploy')).toBeDefined();
    // The squad itself is present
    expect(result.find(i => i.type === 'squad')).toBeDefined();
  });

  it('sets correct DiscoveredItem fields for squads', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/my-squad/.squad/team.md', '# My Squad\n> Squad description.\n**Universe:** staging\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'my-squad');
    expect(squad).toMatchObject({
      id: 'my-squad',
      name: 'My Squad',
      type: 'squad',
      source: 'workspace',
      description: 'Squad description.',
      universe: 'staging',
    });
  });

  it('filters squad.agent.md from squad folder but keeps agents in non-squad folder', () => {
    // Folder A is a squad with squad.agent.md + helper.agent.md
    const folderA = path.join(tmpDir, 'squad-project');
    writeFixture('squad-project/.squad/team.md', '# Squad Project\n> A squad.\n**Universe:** prod\n');
    writeFixture('squad-project/.github/agents/squad.agent.md', '# Squad\n> Governance.\n');
    writeFixture('squad-project/.github/agents/helper.agent.md', '# Helper\n> Helps.\n');

    // Folder B is NOT a squad, has its own agent
    const folderB = path.join(tmpDir, 'plain-project');
    writeFixture('plain-project/.github/agents/tools.agent.md', '# Tools\n> A tools agent.\n');


    const result = discoverAll([wsFolder(folderA), wsFolder(folderB)]);

    // squad.agent.md from squad folder should be filtered out
    expect(result.find(i => i.type === 'agent' && path.basename(i.path) === 'squad.agent.md')).toBeUndefined();
    // helper from squad folder should be kept
    expect(result.find(i => i.id === 'helper')).toBeDefined();
    // tools from plain folder should be kept
    expect(result.find(i => i.id === 'tools')).toBeDefined();
    // The squad itself should exist
    expect(result.find(i => i.type === 'squad' && i.id === 'squad-project')).toBeDefined();
  });

  it('deduplicates squad.agent.md by id when same file exists in multiple workspace folders', () => {
    // Both folders have squad.agent.md — only one should survive due to id dedup
    const folderA = path.join(tmpDir, 'project-a');
    writeFixture('project-a/.github/agents/squad.agent.md', '# Squad\n> First.\n');

    const folderB = path.join(tmpDir, 'project-b');
    writeFixture('project-b/.github/agents/squad.agent.md', '# Squad\n> Second.\n');


    const result = discoverAll([wsFolder(folderA), wsFolder(folderB)]);

    const squadAgents = result.filter(i => i.id === 'squad' && i.type === 'agent');
    // Only one should survive (first wins dedup)
    expect(squadAgents).toHaveLength(1);
  });

  it('handles case-insensitive path matching for squad.agent.md dedup on Windows', () => {
    // The squad discovery path is lowercase internally — verify mixed-case paths still dedup
    const wsDir = path.join(tmpDir, 'MySquad');
    writeFixture('MySquad/.squad/team.md', '# My Squad\n> A squad.\n**Universe:** dev\n');
    writeFixture('MySquad/.github/agents/squad.agent.md', '# Squad\n> Governance.\n');


    const result = discoverAll([wsFolder(wsDir)]);

    // squad.agent.md should still be filtered even with mixed-case folder name
    const squadAgentMd = result.find(i => i.type === 'agent' && path.basename(i.path) === 'squad.agent.md');
    expect(squadAgentMd).toBeUndefined();
    // The squad itself should exist
    expect(result.find(i => i.type === 'squad')).toBeDefined();
  });

  it('discovers squads in nested subdirectories', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/client/my-app/.squad/team.md', '# Nested App Squad\n> Found at depth 2.\n**Universe:** nested\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'my-app');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.universe).toBe('nested');
  });

  it('discovers legacy .ai-team squad in nested subdirectories', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/org/legacy-project/.ai-team/team.md', '# Legacy Squad\n> Uses legacy .ai-team format.\n**Universe:** legacy\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.id === 'legacy-project');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('legacy');
  });

  it('does NOT recurse into node_modules', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/node_modules/some-pkg/.squad/team.md', '# Hidden Squad\n> Should not be found.\n**Universe:** hidden\n');
    // Positive control: a sibling non-excluded squad that IS found
    writeFixture('workspace/legit-squad/.squad/team.md', '# Legit Squad\n> Should be found.\n**Universe:** legit\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const hidden = result.find(i => i.name === 'Hidden Squad');
    expect(hidden).toBeUndefined();
    const legit = result.find(i => i.name === 'Legit Squad');
    expect(legit).toBeDefined();
  });

  it('does not discover squads inside .squad metadata dirs', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/.squad/malicious-squad/.squad/team.md', '# Malicious Squad\n> Should not be found.\n**Universe:** evil\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const malicious = result.find(i => i.name === 'Malicious Squad');
    expect(malicious).toBeUndefined();
  });

  it('does NOT recurse beyond maxDepth', () => {
    // discoverAgentTeams has maxDepth=4 by default. A squad at depth 5 should not be found.
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/a/b/c/d/e/deep-squad/.squad/team.md', '# Deep Squad\n> Too deep.\n**Universe:** deep\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const squad = result.find(i => i.name === 'Deep Squad');
    expect(squad).toBeUndefined();
  });

  it('does NOT recurse into discovered squad directories', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/outer-squad/.squad/team.md', '# Outer Squad\n> The outer squad.\n**Universe:** outer\n');
    writeFixture('workspace/outer-squad/inner-squad/.squad/team.md', '# Inner Squad\n> Should not be found.\n**Universe:** inner\n');


    const result = discoverAll([wsFolder(workspaceDir)]);

    const outer = result.find(i => i.name === 'Outer Squad');
    expect(outer).toBeDefined();
    const inner = result.find(i => i.name === 'Inner Squad');
    expect(inner).toBeUndefined();
  });

  it('discovers squads regardless of casing (no registry exclusion)', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/CasedSquad/.squad/team.md', '# Cased Squad\n> desc.\n**Universe:** test\n');

    const result = discoverAll([wsFolder(workspaceDir)]);

    // Discovery returns everything — no registry exclusion
    expect(result.find(i => i.name === 'Cased Squad')).toBeDefined();
  });

  // --- Regression tests: squad.agent.md discovery bug ---

  it('filters squad.agent.md when .squad/ exists but team.md is missing', () => {
    const ws = path.join(tmpDir, 'my-project');
    // .squad directory exists but NO team.md inside it
    fs.mkdirSync(path.join(ws, '.squad'), { recursive: true });
    writeFixture('my-project/.github/agents/squad.agent.md', '# Squad Coordinator\n> Untriaged issues.\n');
    writeFixture('my-project/.github/agents/helper.agent.md', '# Helper\n> Should survive.\n');

    const result = discoverAll([wsFolder(ws)]);

    // squad.agent.md should be filtered — .squad/ signals it's a squad project
    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
    // A squad item should be discovered from the .squad/ directory
    expect(result.find(i => i.type === 'squad')).toBeDefined();
    expect(result.find(i => i.type === 'squad')!.name).toBe('my-project');
    // Other agents should survive
    expect(result.find(i => i.id === 'helper')).toBeDefined();
  });

  it('filters squad.agent.md when .ai-team/ exists but team.md is missing', () => {
    const ws = path.join(tmpDir, 'legacy-project');
    // .ai-team directory exists but NO team.md inside it
    fs.mkdirSync(path.join(ws, '.ai-team'), { recursive: true });
    writeFixture('legacy-project/.github/agents/squad.agent.md', '# Squad\n> Legacy governance.\n');

    const result = discoverAll([wsFolder(ws)]);

    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
    expect(result.find(i => i.type === 'squad')).toBeDefined();
  });

  it('discovers squad with folder name when team.md is missing', () => {
    const ws = path.join(tmpDir, 'MySquadProject');
    fs.mkdirSync(path.join(ws, '.squad'), { recursive: true });

    const result = discoverAll([wsFolder(ws)]);

    const squad = result.find(i => i.type === 'squad');
    expect(squad).toBeDefined();
    expect(squad!.id).toBe('my-squad-project');
    expect(squad!.name).toBe('MySquadProject');
    expect(squad!.universe).toBe('unknown');
  });

  it('prefers team.md metadata over fallback when both exist', () => {
    const ws = path.join(tmpDir, 'my-squad');
    writeFixture('my-squad/.squad/team.md', '# Named Squad\n> Has description.\n**Universe:** prod\n');
    writeFixture('my-squad/.github/agents/squad.agent.md', '# Squad\n> Governance.\n');

    const result = discoverAll([wsFolder(ws)]);

    const squad = result.find(i => i.type === 'squad');
    expect(squad).toBeDefined();
    expect(squad!.name).toBe('Named Squad');
    expect(squad!.description).toBe('Has description.');
    expect(squad!.universe).toBe('prod');
    // Agent still filtered
    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
  });

  it('keeps squad.agent.md when root has no .squad/ or .ai-team/ directory', () => {
    // No squad directory at all — squad.agent.md is a legitimate standalone agent
    writeFixture('plain/.github/agents/squad.agent.md', '# Squad Agent\n> Standalone.\n');

    const result = discoverAll([wsFolder(path.join(tmpDir, 'plain'))]);

    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeDefined();
  });
});

// toAgentTeamConfig — empty string handling
// ---------------------------------------------------------------------------

import { toAgentTeamConfig } from '../unified-discovery';

describe('toAgentTeamConfig', () => {
  const baseDisc: DiscoveredItem = {
    id: 'test-agent',
    name: 'Test Agent',
    type: 'agent',
    source: 'workspace',
    path: '/path/to/agent.md',
  };

  it('falls back to discovery name when settings name is empty string', () => {
    const cfg = toAgentTeamConfig(baseDisc, { name: '' });
    expect(cfg.name).toBe('Test Agent');
  });

  it('falls back to default icon when settings icon is empty string', () => {
    const cfg = toAgentTeamConfig(baseDisc, { icon: '' });
    expect(cfg.icon).toBe('🤖');
  });

  it('treats empty string model as undefined', () => {
    const cfg = toAgentTeamConfig(baseDisc, { model: '' });
    expect(cfg.model).toBeUndefined();
  });

  it('treats empty string additionalArgs as undefined', () => {
    const cfg = toAgentTeamConfig(baseDisc, { additionalArgs: '' });
    expect(cfg.additionalArgs).toBeUndefined();
  });

  it('uses settings values when non-empty', () => {
    const cfg = toAgentTeamConfig(baseDisc, { name: 'Custom', icon: '⚡', model: 'o4-mini', additionalArgs: '--yolo' });
    expect(cfg.name).toBe('Custom');
    expect(cfg.icon).toBe('⚡');
    expect(cfg.model).toBe('o4-mini');
    expect(cfg.additionalArgs).toBe('--yolo');
  });
});

// ---------------------------------------------------------------------------
// enrichWithWorktrees
// ---------------------------------------------------------------------------

// We need to mock the worktree-discovery functions used by enrichWithWorktrees
vi.mock('../worktree-discovery', () => ({
  isGitRepo: vi.fn(() => false),
  discoverWorktrees: vi.fn(() => []),
}));

import { enrichWithWorktrees } from '../unified-discovery';
import { isGitRepo, discoverWorktrees } from '../worktree-discovery';

const mockIsGitRepo = vi.mocked(isGitRepo);
const mockDiscoverWorktrees = vi.mocked(discoverWorktrees);

describe('enrichWithWorktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGitRepo.mockReturnValue(false);
    mockDiscoverWorktrees.mockReturnValue([]);
  });

  it('returns items unchanged when no git repos', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-agent', name: 'My Agent', type: 'agent', source: 'workspace', path: '/ws/agent.md' },
    ];

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);
    expect(result).toEqual(items);
  });

  it('sets branch and isMainWorktree on parent for main worktree', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/ws/my-squad-wt/feat', branch: 'feat/auth', isMain: false, commitHash: 'def456' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);

    const parent = result.find(i => i.id === 'my-squad');
    expect(parent?.branch).toBe('main');
    expect(parent?.isMainWorktree).toBe(true);
  });

  it('creates child items for non-main worktrees inside workspace', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad', universe: 'dev' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/ws/my-squad-wt/feat', branch: 'feat/auth', isMain: false, commitHash: 'def456' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);

    const child = result.find(i => i.parentId === 'my-squad');
    expect(child).toBeDefined();
    expect(child!.id).toBe('my-squad:wt:feat/auth');
    expect(child!.name).toBe('feat/auth');
    expect(child!.branch).toBe('feat/auth');
    expect(child!.isMainWorktree).toBe(false);
    expect(child!.type).toBe('squad');
    expect(child!.source).toBe('workspace');
    expect(child!.universe).toBe('dev');
    expect(child!.path).toBe('/ws/my-squad-wt/feat');
  });

  it('excludes worktrees outside workspace when includeOutsideWorkspace is false', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/outside/feat', branch: 'feat/outside', isMain: false, commitHash: 'def456' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')], false);

    expect(result.find(i => i.parentId === 'my-squad')).toBeUndefined();
  });

  it('includes worktrees outside workspace when includeOutsideWorkspace is true', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/outside/feat', branch: 'feat/outside', isMain: false, commitHash: 'def456' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')], true);

    const child = result.find(i => i.parentId === 'my-squad');
    expect(child).toBeDefined();
    expect(child!.branch).toBe('feat/outside');
  });

  it('deduplicates: converts existing discovered item to a child', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
      { id: 'feat-squad', name: 'Feat Squad', type: 'squad', source: 'workspace', path: '/ws/feat-squad' },
    ];
    mockIsGitRepo.mockImplementation((p: string) => p === '/ws/my-squad');
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/ws/feat-squad', branch: 'feat/auth', isMain: false, commitHash: 'def456' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);

    // feat-squad should be converted to a child, not duplicated
    const featItems = result.filter(i => i.path.replace(/\\/g, '/').toLowerCase() === '/ws/feat-squad');
    expect(featItems).toHaveLength(1);
    expect(featItems[0].parentId).toBe('my-squad');
    expect(featItems[0].branch).toBe('feat/auth');
    expect(featItems[0].isMainWorktree).toBe(false);
  });

  it('handles detached HEAD worktree (empty branch)', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
      { path: '/ws/my-squad-wt/detached', branch: '', isMain: false, commitHash: 'deadbeef' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);

    const child = result.find(i => i.parentId === 'my-squad');
    expect(child).toBeDefined();
    // For detached, uses first 8 chars of commit hash as slug
    expect(child!.id).toBe('my-squad:wt:deadbeef');
    expect(child!.name).toBe('deadbeef');
    expect(child!.branch).toBe('');
  });

  it('does not process items that already have a parentId', () => {
    const items: DiscoveredItem[] = [
      { id: 'parent', name: 'Parent', type: 'squad', source: 'workspace', path: '/ws/parent' },
      { id: 'child', name: 'Child', type: 'squad', source: 'workspace', path: '/ws/child', parentId: 'parent' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([]);

    enrichWithWorktrees(items, [wsFolder('/ws')]);

    // discoverWorktrees should only be called for 'parent', not 'child'
    expect(mockDiscoverWorktrees).toHaveBeenCalledTimes(1);
    expect(mockDiscoverWorktrees).toHaveBeenCalledWith('/ws/parent');
  });

  it('does not modify items array when only main worktree exists', () => {
    const items: DiscoveredItem[] = [
      { id: 'my-squad', name: 'My Squad', type: 'squad', source: 'workspace', path: '/ws/my-squad' },
    ];
    mockIsGitRepo.mockReturnValue(true);
    mockDiscoverWorktrees.mockReturnValue([
      { path: '/ws/my-squad', branch: 'main', isMain: true, commitHash: 'abc123' },
    ]);

    const result = enrichWithWorktrees(items, [wsFolder('/ws')]);

    // Only main worktree → no children added, just returns original length
    expect(result).toHaveLength(1);
  });
});
