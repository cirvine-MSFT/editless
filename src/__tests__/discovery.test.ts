import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverAgentTeams, autoRegisterWorkspaceSquads } from '../discovery';
import type { AgentTeamConfig } from '../types';

// Mock vscode module
const mockWorkspaceFolders: Array<{ name: string; uri: { fsPath: string } }> = [];
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue?: unknown) => {
        if (key === 'command') return 'copilot';
        if (key === 'defaultAgent') return 'squad';
        return defaultValue;
      },
    }),
    get workspaceFolders() { return mockWorkspaceFolders.length > 0 ? mockWorkspaceFolders : undefined; },
  },
  window: {
    showInformationMessage: async () => undefined,
    showQuickPick: async () => undefined,
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-test-'));
}

function writeFixture(relPath: string, content: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

beforeEach(() => {
  tmpDir = makeTmp();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// discoverAgentTeams
// ---------------------------------------------------------------------------

describe('discoverAgentTeams', () => {
  it('discovers agent teams from child folders with .squad/team.md (new convention)', () => {
    writeFixture('squad-a/.squad/team.md', `# Alpha Squad
> The alpha team.
**Universe:** production
`);
    writeFixture('squad-b/.squad/team.md', `# Bravo Squad
> The bravo team.
**Universe:** testing
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(2);
    expect(result.map(s => s.name)).toContain('Alpha Squad');
    expect(result.map(s => s.name)).toContain('Bravo Squad');
  });

  it('prefers .squad/team.md over .ai-team/team.md when both exist', () => {
    writeFixture('squad-a/.squad/team.md', `# New Name
> New description.
**Universe:** new
`);
    writeFixture('squad-a/.ai-team/team.md', `# Old Name
> Old description.
**Universe:** old
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New Name');
    expect(result[0].universe).toBe('new');
  });

  it('discovers agent teams from child folders with .ai-team/team.md', () => {
    // Create 3 child folders, 2 with .ai-team/team.md
    writeFixture('squad-a/.ai-team/team.md', `# Alpha Squad
> The alpha team.
**Universe:** production
`);
    writeFixture('squad-b/.ai-team/team.md', `# Bravo Squad
> The bravo team.
**Universe:** testing
`);
    // squad-c has no .ai-team/team.md, should be skipped
    fs.mkdirSync(path.join(tmpDir, 'squad-c'), { recursive: true });

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result).toHaveLength(2);
    expect(result.map(s => s.name)).toContain('Alpha Squad');
    expect(result.map(s => s.name)).toContain('Bravo Squad');
  });

  it('parses team.md for name, description, and universe', () => {
    writeFixture('test-squad/.ai-team/team.md', `# My Test Squad
> This is a test squad for validation.
**Universe:** staging
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('My Test Squad');
    expect(result[0].description).toBe('This is a test squad for validation.');
    expect(result[0].universe).toBe('staging');
  });

  it('strips Team Roster prefix from heading names', () => {
    writeFixture('demo/.ai-team/team.md', `# Team Roster — Demo Agent Team
> Team description.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Demo Agent Team');
  });

  it('falls back to folder name when heading is just Team Roster', () => {
    writeFixture('fallback/.ai-team/team.md', `# Team Roster
> Generic heading.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('fallback');
  });

  it('generates kebab-case id from folder name', () => {
    writeFixture('MyTestSquad/.ai-team/team.md', `# Custom Name
> Desc
**Universe:** dev
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].id).toBe('my-test-squad');
  });

  it('skips folders already in existing list (case-insensitive)', () => {
    writeFixture('squad-a/.ai-team/team.md', `# Squad A
> First squad.
**Universe:** prod
`);
    writeFixture('squad-b/.ai-team/team.md', `# Squad B
> Second squad.
**Universe:** staging
`);

    const existingSquads: AgentTeamConfig[] = [{
      id: 'squad-a',
      name: 'Squad A',
      path: path.join(tmpDir, 'squad-a').toLowerCase(),
      icon: '🔷',
      universe: 'prod',
      description: 'First squad.',
    }];

    const result = discoverAgentTeams(tmpDir, existingSquads);
    
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Squad B');
  });

  it('returns empty array for non-existent directory', () => {
    const result = discoverAgentTeams(path.join(tmpDir, 'nonexistent'), []);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', () => {
    const result = discoverAgentTeams(tmpDir, []);
    expect(result).toEqual([]);
  });

  it('sets default icon to 🔷', () => {
    writeFixture('squad/.ai-team/team.md', `# Squad
> Squad desc.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].icon).toBe('🔷');
  });

  it('sets default universe to "unknown" when not specified', () => {
    writeFixture('squad/.ai-team/team.md', `# Squad
> Squad without universe tag.
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].universe).toBe('unknown');
  });

  it('uses folder name as fallback name when team.md has no heading', () => {
    writeFixture('fallback-squad/.ai-team/team.md', `> Just a description.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].name).toBe('fallback-squad');
  });

  it('sets default launchCommand for discovered agent teams', () => {
    writeFixture('squad/.ai-team/team.md', `# Squad
> Squad desc.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].launchCommand).toBe('copilot --agent squad');
  });

  describe('edge cases', () => {
    it('handles malformed team.md files gracefully', () => {
      writeFixture('squad-a/.ai-team/team.md', `This is not proper markdown`);
      writeFixture('squad-b/.ai-team/team.md', `# Valid Squad
> Proper description.
**Universe:** test
`);

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('squad-a');
      expect(result[1].name).toBe('Valid Squad');
    });

    it('ignores files that are not directories', () => {
      writeFixture('squad/.ai-team/team.md', `# Squad
> Desc.
**Universe:** test
`);
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'not a directory');

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result).toHaveLength(1);
    });

    it('handles multiple blockquotes (uses first)', () => {
      writeFixture('squad/.ai-team/team.md', `# Squad
> First description.
> Second description.
**Universe:** test
`);

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result[0].description).toBe('First description.');
    });

    it('handles snake_case folder names', () => {
      writeFixture('my_test_squad/.ai-team/team.md', `# Squad
> Desc.
**Universe:** test
`);

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result[0].id).toBe('my-test-squad');
    });

    it('handles spaces in folder names', () => {
      writeFixture('My Test Squad/.ai-team/team.md', `# Squad
> Desc.
**Universe:** test
`);

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result[0].id).toBe('my-test-squad');
    });

    it('handles very long universe values', () => {
      const longUniverse = 'a'.repeat(100);
      writeFixture('squad/.ai-team/team.md', `# Squad
> Desc.
**Universe:** ${longUniverse}
`);

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result[0].universe).toBe(longUniverse);
    });

    it('discovers multiple agent teams and maintains correct paths', () => {
      for (let i = 0; i < 5; i++) {
        writeFixture(`squad-${i}/.ai-team/team.md`, `# Squad ${i}
> Desc ${i}.
**Universe:** test
`);
      }

      const result = discoverAgentTeams(tmpDir, []);
      
      expect(result).toHaveLength(5);
      result.forEach((squad, idx) => {
        expect(squad.path).toBe(path.resolve(tmpDir, `squad-${idx}`));
      });
    });
  });
});

// ---------------------------------------------------------------------------
// autoRegisterWorkspaceSquads
// ---------------------------------------------------------------------------

describe('autoRegisterWorkspaceSquads', () => {
  beforeEach(() => {
    mockWorkspaceFolders.length = 0;
  });

  it('auto-registers a workspace folder containing .ai-team/team.md', () => {
    writeFixture('project-a/.ai-team/team.md', '# Team Roster\n> A cool squad.');
    mockWorkspaceFolders.push({ name: 'project-a', uri: { fsPath: path.join(tmpDir, 'project-a') } });

    const added: AgentTeamConfig[] = [];
    const registry = {
      loadSquads: () => [] as AgentTeamConfig[],
      addSquads: (squads: AgentTeamConfig[]) => { added.push(...squads); },
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(added).toHaveLength(1);
    expect(added[0].path).toBe(path.join(tmpDir, 'project-a'));
    expect(added[0].name).toBe('project-a');
  });

  it('skips workspace folders already in the registry', () => {
    writeFixture('project-a/.ai-team/team.md', '# Team Roster');
    const folderPath = path.join(tmpDir, 'project-a');
    mockWorkspaceFolders.push({ name: 'project-a', uri: { fsPath: folderPath } });

    const added: AgentTeamConfig[] = [];
    const existing: AgentTeamConfig = {
      id: 'project-a', name: 'Project A', path: folderPath,
      icon: '🔷', universe: 'production', launchCommand: '',
    };
    const registry = {
      loadSquads: () => [existing],
      addSquads: (squads: AgentTeamConfig[]) => { added.push(...squads); },
      updateSquad: () => true,
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(added).toHaveLength(0);
  });

  it('skips workspace folders without .ai-team or .squad', () => {
    fs.mkdirSync(path.join(tmpDir, 'plain-project'), { recursive: true });
    mockWorkspaceFolders.push({ name: 'plain-project', uri: { fsPath: path.join(tmpDir, 'plain-project') } });

    const added: AgentTeamConfig[] = [];
    const registry = {
      loadSquads: () => [] as AgentTeamConfig[],
      addSquads: (squads: AgentTeamConfig[]) => { added.push(...squads); },
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(added).toHaveLength(0);
  });

  it('updates an existing unknown squad when team.md appears', () => {
    writeFixture('project-a/.ai-team/team.md', `# Real Squad Name
> The real description.
**Universe:** production
`);
    const folderPath = path.join(tmpDir, 'project-a');
    mockWorkspaceFolders.push({ name: 'project-a', uri: { fsPath: folderPath } });

    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const existing: AgentTeamConfig = {
      id: 'project-a', name: 'project-a', path: folderPath,
      icon: '🔷', universe: 'unknown', launchCommand: '',
    };
    const registry = {
      loadSquads: () => [existing],
      addSquads: () => {},
      updateSquad: (id: string, data: Record<string, unknown>) => {
        updates.push({ id, data });
        return true;
      },
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('project-a');
    expect(updates[0].data).toEqual({
      name: 'Real Squad Name',
      description: 'The real description.',
      universe: 'production',
    });
  });

  it('does not update an existing squad with known universe', () => {
    writeFixture('project-a/.ai-team/team.md', `# Updated Name
> Updated description.
**Universe:** staging
`);
    const folderPath = path.join(tmpDir, 'project-a');
    mockWorkspaceFolders.push({ name: 'project-a', uri: { fsPath: folderPath } });

    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const existing: AgentTeamConfig = {
      id: 'project-a', name: 'Project A', path: folderPath,
      icon: '🔷', universe: 'production', launchCommand: '',
    };
    const registry = {
      loadSquads: () => [existing],
      addSquads: () => {},
      updateSquad: (id: string, data: Record<string, unknown>) => {
        updates.push({ id, data });
        return true;
      },
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(updates).toHaveLength(0);
  });

  it('does nothing when no workspace folders exist', () => {
    const added: AgentTeamConfig[] = [];
    const registry = {
      loadSquads: () => [] as AgentTeamConfig[],
      addSquads: (squads: AgentTeamConfig[]) => { added.push(...squads); },
    };
    autoRegisterWorkspaceSquads(registry as never);

    expect(added).toHaveLength(0);
  });
});
