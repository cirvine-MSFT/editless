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

  it('discovers squads from workspace parent directories', () => {
    // Create a workspace folder inside a parent that contains sibling squads
    const workspaceDir = path.join(tmpDir, 'projects', 'my-project');
    fs.mkdirSync(workspaceDir, { recursive: true });
    writeFixture('projects/sibling-squad/.squad/team.md', '# Sibling Squad\n> A sibling squad.\n**Universe:** test\n');
    const registry = makeRegistry();

    const result = discoverAll([wsFolder(workspaceDir)], registry);

    const squad = result.find(i => i.id === 'sibling-squad');
    expect(squad).toBeDefined();
    expect(squad!.type).toBe('squad');
    expect(squad!.source).toBe('workspace');
    expect(squad!.universe).toBe('test');
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
    const workspaceDir = path.join(tmpDir, 'projects', 'my-project');
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
    const workspaceDir = path.join(tmpDir, 'projects', 'my-project');
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

  it('sets correct DiscoveredItem fields for squads', () => {
    const workspaceDir = path.join(tmpDir, 'projects', 'my-project');
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
});
