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
import type { EditlessRegistry } from '../registry';
import type { AgentTeamConfig } from '../types';

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

function makeRegistry(squads: AgentTeamConfig[] = []): EditlessRegistry {
  return {
    loadSquads: () => squads,
    getSquad: (id: string) => squads.find(s => s.id === id),
    addSquads: vi.fn(),
    updateSquad: vi.fn(),
    registryPath: '/mock/registry.json',
  } as unknown as EditlessRegistry;
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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.id === 'my-squad');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('dev');
    expect(squad!.path).toBe(workspaceDir);
  });

  it('discovers squads from immediate children of workspace folders', () => {
    // Workspace folder contains a child directory that is a squad
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/child-squad/.squad/team.md', '# Child Squad\n> A child squad.\n**Universe:** test\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.id === 'sibling-squad');
    expect(squad).toBeUndefined();
  });

  it('excludes already-registered items by id', () => {
    writeFixture('ws/.github/agents/my-agent.agent.md', '# My Agent\n');
    const registered: AgentTeamConfig = {
      id: 'my-agent', name: 'My Agent', path: '/somewhere',
      icon: '🤖', universe: 'standalone',
    };
    const registry = makeRegistry([registered]);

    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))], registry);

    expect(result.find(i => i.id === 'my-agent')).toBeUndefined();
  });

  it('excludes already-registered squads by path', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    const squadPath = path.resolve(tmpDir, 'projects', 'existing-squad');
    writeFixture('projects/existing-squad/.squad/team.md', '# Existing\n> Already registered.\n**Universe:** prod\n');

    const registered: AgentTeamConfig = {
      id: 'existing-squad', name: 'Existing', path: squadPath,
      icon: '🔷', universe: 'prod',
    };
    const registry = makeRegistry([registered]);

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    expect(result.find(i => i.id === 'existing-squad')).toBeUndefined();
  });

  it('deduplicates items by id', () => {
    // Same agent in two workspace folders
    writeFixture('ws1/.github/agents/shared.agent.md', '# Shared Agent\n');
    writeFixture('ws2/.github/agents/shared.agent.md', '# Shared Agent Copy\n');
    const registry = makeRegistry();

    const result = discoverAll([
      wsFolder(path.join(tmpDir, 'ws1')),
      wsFolder(path.join(tmpDir, 'ws2')),
    ], registry);

    const shared = result.filter(i => i.id === 'shared');
    expect(shared).toHaveLength(1);
  });

  it('returns both agents and squads in a single result', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(path.join(workspaceDir, '.github', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, '.github', 'agents', 'helper.agent.md'), '# Helper\n> Helps.\n');
    writeFixture('projects/team-squad/.squad/team.md', '# Team Squad\n> A team.\n**Universe:** dev\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const agents = result.filter(i => i.type === 'agent');
    const squads = result.filter(i => i.type === 'squad');
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(squads.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array when nothing to discover', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty'), { recursive: true });
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(path.join(tmpDir, 'empty'))], registry);

    // May include copilot-dir agents from real home dir, but no workspace items
    const wsItems = result.filter(i => i.source === 'workspace');
    expect(wsItems).toEqual([]);
  });

  it('returns empty array for empty workspace folders list', () => {
    const registry = makeRegistry();
    const result = discoverAll([], registry);
    // Only copilot-dir agents possible
    const wsItems = result.filter(i => i.source === 'workspace');
    expect(wsItems).toEqual([]);
  });

  it('sets correct DiscoveredItem fields for agents', () => {
    writeFixture('ws/.github/agents/bot.agent.md', '# Bot\n> Does bot things.\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    // squad.agent.md should be filtered out (it's governance for the discovered squad)
    expect(result.find(i => i.id === 'squad' && i.type === 'agent')).toBeUndefined();
    // The squad itself should be present
    expect(result.find(i => i.type === 'squad')).toBeDefined();
    // Other agents in the same folder should survive
    expect(result.find(i => i.id === 'helper')).toBeDefined();
  });

  it('keeps squad.agent.md when no squad is discovered in that folder', () => {
    writeFixture('ws/.github/agents/squad.agent.md', '# Squad\n> Standalone agent, no squad here.\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(path.join(tmpDir, 'ws'))], registry);

    expect(result.find(i => i.id === 'squad')).toBeDefined();
  });

  it('keeps squad.agent.md when squad is discovered from a different workspace root', () => {
    // ws1 has a squad, ws2 has squad.agent.md but no squad
    const ws1 = path.join(tmpDir, 'ws1');
    const ws2 = path.join(tmpDir, 'ws2');
    writeFixture('ws1/.squad/team.md', '# WS1 Squad\n> Squad in ws1.\n**Universe:** test\n');
    writeFixture('ws2/.github/agents/squad.agent.md', '# Squad Agent\n> Governance in ws2.\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(ws1), wsFolder(ws2)], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(ws)], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

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

    const registry = makeRegistry();
    const result = discoverAll([wsFolder(folderA), wsFolder(folderB)], registry);

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

    const registry = makeRegistry();
    const result = discoverAll([wsFolder(folderA), wsFolder(folderB)], registry);

    const squadAgents = result.filter(i => i.id === 'squad' && i.type === 'agent');
    // Only one should survive (first wins dedup)
    expect(squadAgents).toHaveLength(1);
  });

  it('handles case-insensitive path matching for squad.agent.md dedup on Windows', () => {
    // The squad discovery path is lowercase internally — verify mixed-case paths still dedup
    const wsDir = path.join(tmpDir, 'MySquad');
    writeFixture('MySquad/.squad/team.md', '# My Squad\n> A squad.\n**Universe:** dev\n');
    writeFixture('MySquad/.github/agents/squad.agent.md', '# Squad\n> Governance.\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(wsDir)], registry);

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
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.id === 'my-app');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.universe).toBe('nested');
  });

  it('does NOT recurse into node_modules', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/node_modules/some-pkg/.squad/team.md', '# Hidden Squad\n> Should not be found.\n**Universe:** hidden\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.name === 'Hidden Squad');
    expect(squad).toBeUndefined();
  });

  it('does NOT recurse beyond maxDepth', () => {
    // discoverAgentTeams has maxDepth=4 by default. A squad at depth 5 should not be found.
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/a/b/c/d/e/deep-squad/.squad/team.md', '# Deep Squad\n> Too deep.\n**Universe:** deep\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.name === 'Deep Squad');
    expect(squad).toBeUndefined();
  });

  it('does NOT recurse into discovered squad directories', () => {
    const workspaceDir = path.join(tmpDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('workspace/outer-squad/.squad/team.md', '# Outer Squad\n> The outer squad.\n**Universe:** outer\n');
    writeFixture('workspace/outer-squad/inner-squad/.squad/team.md', '# Inner Squad\n> Should not be found.\n**Universe:** inner\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const outer = result.find(i => i.name === 'Outer Squad');
    expect(outer).toBeDefined();
    const inner = result.find(i => i.name === 'Inner Squad');
    expect(inner).toBeUndefined();
  });

  it('excludes registered squad by path with different casing', () => {
    const workspaceDir = path.join(tmpDir, 'projects');
    fs.mkdirSync(workspaceDir, { recursive: true });
    const squadDir = path.resolve(tmpDir, 'projects', 'CasedSquad');
    writeFixture('projects/CasedSquad/.squad/team.md', '# Cased Squad\n> desc.\n**Universe:** test\n');

    // Register with different casing
    const registered: AgentTeamConfig = {
      id: 'casedsquad', name: 'Cased Squad', path: squadDir.toUpperCase(),
      icon: '🔷', universe: 'test',
    };
    const registry = makeRegistry([registered]);

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    // Should be excluded because path matches case-insensitively
    expect(result.find(i => i.name === 'Cased Squad')).toBeUndefined();
  });
});
