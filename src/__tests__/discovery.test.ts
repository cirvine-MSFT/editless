import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverAgentTeams, readUniverseFromRegistry } from '../discovery';
import type { AgentTeamConfig } from '../types';

// vscode mock (discovery.ts no longer imports vscode directly, but vitest
// requires the mock to be present so transitive imports don't break)
vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, defaultValue?: unknown) => defaultValue,
    }),
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

  it('sets universe for discovered agent teams', () => {
    writeFixture('squad/.ai-team/team.md', `# Squad
> Squad desc.
**Universe:** test
`);

    const result = discoverAgentTeams(tmpDir, []);
    
    expect(result[0].universe).toBe('test');
  });

  it('discovers squads in nested child directories', () => {
    // Squad at depth 2 — should be found via recursive scan
    writeFixture('parent/child/nested-squad/.squad/team.md', `# Nested Squad
> A deeply nested squad.
**Universe:** nested
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Nested Squad');
    expect(result[0].universe).toBe('nested');
  });

  it('discovers legacy .ai-team squad in nested child directories', () => {
    // Legacy format (.ai-team/) at depth 2 — resolveTeamMd() checks before hidden-dir exclusion
    writeFixture('org/projects/legacy-project/.ai-team/team.md', `# Legacy Squad
> A squad using the legacy .ai-team directory format.
**Universe:** legacy
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Legacy Squad');
    expect(result[0].universe).toBe('legacy');
    expect(result[0].path).toBe(path.resolve(tmpDir, 'org/projects/legacy-project'));
  });

  it('skips node_modules directories', () => {
    writeFixture('node_modules/some-pkg/.squad/team.md', `# Hidden Squad
> Should not be found.
**Universe:** hidden
`);
    // Positive control: a sibling non-excluded squad that IS found
    writeFixture('legit-squad/.squad/team.md', `# Legit Squad
> Should be found.
**Universe:** legit
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Legit Squad');
  });

  it('case-insensitive exclusion on Windows', () => {
    writeFixture('Node_Modules/squad/.squad/team.md', `# NM Squad
> Should not be found.
**Universe:** hidden
`);
    // Positive control
    writeFixture('real-squad/.squad/team.md', `# Real Squad
> Should be found.
**Universe:** real
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Real Squad');
  });

  it('does not recurse into .squad metadata directories', () => {
    writeFixture('.squad/malicious-squad/.squad/team.md', `# Malicious Squad
> Should not be found.
**Universe:** evil
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(0);
  });

  it('skips hidden directories', () => {
    writeFixture('.hidden/nested-squad/.squad/team.md', `# Hidden Nested Squad
> Should not be found.
**Universe:** hidden
`);

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(0);
  });

  it('respects maxDepth parameter', () => {
    // Create a squad at depth 5 — beyond default maxDepth of 4
    writeFixture('a/b/c/d/e/deep-squad/.squad/team.md', `# Deep Squad
> Too deep.
**Universe:** deep
`);

    // Default maxDepth (4) should not find it
    const resultDefault = discoverAgentTeams(tmpDir, []);
    expect(resultDefault.find(s => s.name === 'Deep Squad')).toBeUndefined();

    // Explicit maxDepth of 6 should find it
    const resultDeep = discoverAgentTeams(tmpDir, [], 6);
    expect(resultDeep.find(s => s.name === 'Deep Squad')).toBeDefined();
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
// Universe auto-detection from registry.json
// ---------------------------------------------------------------------------

describe('readUniverseFromRegistry', () => {
  it('reads universe from .squad/casting/registry.json', () => {
    writeFixture('squad-a/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Rick and Morty', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-a'))).toBe('Rick and Morty');
  });

  it('reads universe from .ai-team/casting/registry.json as fallback', () => {
    writeFixture('squad-b/.ai-team/casting/registry.json', JSON.stringify({
      agents: {
        homer: { persistent_name: 'Homer', universe: 'The Simpsons', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-b'))).toBe('The Simpsons');
  });

  it('returns undefined when registry.json does not exist', () => {
    fs.mkdirSync(path.join(tmpDir, 'squad-c'), { recursive: true });
    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-c'))).toBeUndefined();
  });

  it('returns undefined when registry.json is malformed', () => {
    writeFixture('squad-d/.squad/casting/registry.json', 'not valid json {{{');
    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-d'))).toBeUndefined();
  });

  it('skips inactive agents', () => {
    writeFixture('squad-e/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Inactive Universe', status: 'inactive' },
        morty: { persistent_name: 'Morty', universe: 'Active Universe', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-e'))).toBe('Active Universe');
  });

  it('returns undefined when all agents are inactive', () => {
    writeFixture('squad-f/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Rick and Morty', status: 'inactive' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-f'))).toBeUndefined();
  });

  it('reads top-level universe field (members-array schema)', () => {
    writeFixture('squad-g/.squad/casting/registry.json', JSON.stringify({
      version: 1,
      universe: 'Futurama',
      created_at: '2026-02-22T02:52:58Z',
      members: [
        { persistent_name: 'Leela', folder: 'leela', role: 'Lead' },
        { persistent_name: 'Bender', folder: 'bender', role: 'Backend' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-g'))).toBe('Futurama');
  });

  it('prefers top-level universe over per-agent universe', () => {
    writeFixture('squad-h/.squad/casting/registry.json', JSON.stringify({
      universe: 'Top Level',
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Per Agent', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-h'))).toBe('Top Level');
  });

  it('reads universe from persistent_names array', () => {
    writeFixture('squad-pn1/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', role: 'Lead', status: 'active' },
        { persistent_name: 'Poncho', universe: 'predator', role: 'Frontend Dev', status: 'active' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-pn1'))).toBe('predator');
  });

  it('skips inactive agents in persistent_names array', () => {
    writeFixture('squad-pn2/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'retired-universe', status: 'inactive' },
        { persistent_name: 'Poncho', universe: 'predator', status: 'active' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-pn2'))).toBe('predator');
  });

  it('reads universe from persistent_names when status is absent', () => {
    writeFixture('squad-pn3/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', role: 'Lead' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-pn3'))).toBe('predator');
  });

  it('returns undefined when all persistent_names agents are inactive', () => {
    writeFixture('squad-pn4/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', status: 'inactive' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-pn4'))).toBeUndefined();
  });

  it('prefers top-level universe over persistent_names', () => {
    writeFixture('squad-pn5/.squad/casting/registry.json', JSON.stringify({
      universe: 'Top Level',
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', status: 'active' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'squad-pn5'))).toBe('Top Level');
  });

  // ---------------------------------------------------------------------------
  // Schema 1 edge cases (top-level universe)
  // ---------------------------------------------------------------------------

  it('falls through when top-level universe is empty string', () => {
    writeFixture('schema1-empty/.squad/casting/registry.json', JSON.stringify({
      universe: '',
      agents: {
        rick: { universe: 'fallback', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'schema1-empty'))).toBe('fallback');
  });

  it('falls through when top-level universe is null', () => {
    writeFixture('schema1-null/.squad/casting/registry.json', JSON.stringify({
      universe: null,
      agents: {
        rick: { universe: 'fallback', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'schema1-null'))).toBe('fallback');
  });

  it('top-level universe wins when all three schema fields are present', () => {
    writeFixture('schema-priority/.squad/casting/registry.json', JSON.stringify({
      universe: 'top-level-wins',
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'persistent-names', status: 'active' },
      ],
      agents: {
        rick: { universe: 'agents-record', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'schema-priority'))).toBe('top-level-wins');
  });

  // ---------------------------------------------------------------------------
  // Schema 2 edge cases (persistent_names array)
  // ---------------------------------------------------------------------------

  it('returns first active universe when persistent_names have different universes', () => {
    writeFixture('pn-mixed-uni/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', status: 'active' },
        { persistent_name: 'Ripley', universe: 'alien', status: 'active' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-mixed-uni'))).toBe('predator');
  });

  it('falls through when persistent_names entries lack universe field', () => {
    writeFixture('pn-no-uni/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', status: 'active' },
      ],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-no-uni'))).toBeUndefined();
  });

  it('falls through when persistent_names array is empty', () => {
    writeFixture('pn-empty/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [],
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-empty'))).toBeUndefined();
  });

  it('does not crash when persistent_names is not an array', () => {
    writeFixture('pn-malformed/.squad/casting/registry.json', JSON.stringify({
      persistent_names: 'not-an-array',
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-malformed'))).toBeUndefined();
  });

  it('prefers persistent_names over agents Record', () => {
    writeFixture('pn-over-agents/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', universe: 'predator', status: 'active' },
      ],
      agents: {
        rick: { universe: 'agents-record', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-over-agents'))).toBe('predator');
  });

  it('falls through persistent_names to agents when no active persistent_names have universe', () => {
    writeFixture('pn-fallthrough/.squad/casting/registry.json', JSON.stringify({
      persistent_names: [
        { persistent_name: 'Dutch', status: 'inactive', universe: 'predator' },
      ],
      agents: {
        rick: { universe: 'agents-fallback', status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'pn-fallthrough'))).toBe('agents-fallback');
  });

  // ---------------------------------------------------------------------------
  // Schema 3 edge cases (agents Record)
  // ---------------------------------------------------------------------------

  it('returns undefined when agents record is empty', () => {
    writeFixture('agents-empty/.squad/casting/registry.json', JSON.stringify({
      agents: {},
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'agents-empty'))).toBeUndefined();
  });

  it('returns undefined when agents have no universe field', () => {
    writeFixture('agents-no-uni/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { status: 'active' },
      },
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'agents-no-uni'))).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Cross-cutting edge cases
  // ---------------------------------------------------------------------------

  it('returns undefined for completely empty object', () => {
    writeFixture('empty-obj/.squad/casting/registry.json', JSON.stringify({}));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'empty-obj'))).toBeUndefined();
  });

  it('returns undefined when file has unrelated fields only', () => {
    writeFixture('unrelated/.squad/casting/registry.json', JSON.stringify({
      version: 1,
      created_at: '2026-01-01',
    }));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'unrelated'))).toBeUndefined();
  });

  it('does not crash when JSON parses to null', () => {
    writeFixture('null-data/.squad/casting/registry.json', 'null');

    expect(readUniverseFromRegistry(path.join(tmpDir, 'null-data'))).toBeUndefined();
  });

  it('does not crash when JSON parses to a string', () => {
    writeFixture('string-data/.squad/casting/registry.json', JSON.stringify('just a string'));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'string-data'))).toBeUndefined();
  });

  it('does not crash when JSON parses to a number', () => {
    writeFixture('number-data/.squad/casting/registry.json', '42');

    expect(readUniverseFromRegistry(path.join(tmpDir, 'number-data'))).toBeUndefined();
  });

  it('does not crash when JSON parses to an array', () => {
    writeFixture('array-data/.squad/casting/registry.json', JSON.stringify([1, 2, 3]));

    expect(readUniverseFromRegistry(path.join(tmpDir, 'array-data'))).toBeUndefined();
  });
});

describe('discoverAgentTeams universe fallback',() => {
  it('auto-detects universe from registry.json when team.md lacks Universe marker', () => {
    writeFixture('squad-a/.squad/team.md', '# Alpha Squad\n> The alpha team.\n');
    writeFixture('squad-a/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Rick and Morty', status: 'active' },
      },
    }));

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].universe).toBe('Rick and Morty');
  });

  it('team.md Universe marker takes priority over registry.json', () => {
    writeFixture('squad-a/.squad/team.md', '# Alpha Squad\n> The alpha team.\n**Universe:** Explicit Universe\n');
    writeFixture('squad-a/.squad/casting/registry.json', JSON.stringify({
      agents: {
        rick: { persistent_name: 'Rick', universe: 'Rick and Morty', status: 'active' },
      },
    }));

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].universe).toBe('Explicit Universe');
  });

  it('falls back to unknown when registry.json is malformed', () => {
    writeFixture('squad-a/.squad/team.md', '# Alpha Squad\n> The alpha team.\n');
    writeFixture('squad-a/.squad/casting/registry.json', 'not valid json');

    const result = discoverAgentTeams(tmpDir, []);

    expect(result).toHaveLength(1);
    expect(result[0].universe).toBe('unknown');
  });
});
