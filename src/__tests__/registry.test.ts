import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import type { AgentTeamConfig } from '../types';

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(),
    workspaceFolders: [],
    createFileSystemWatcher: vi.fn(),
  },
}));

vi.mock('fs');

vi.mock('../discovery', () => ({
  parseTeamMd: vi.fn(),
  readUniverseFromRegistry: vi.fn(),
}));

vi.mock('../team-dir', () => ({
  resolveTeamMd: vi.fn(),
  resolveTeamDir: vi.fn(),
  TEAM_DIR_NAMES: ['.squad', '.ai-team'],
}));

import { EditlessRegistry } from '../registry';
import { parseTeamMd, readUniverseFromRegistry } from '../discovery';
import { resolveTeamMd } from '../team-dir';

const REGISTRY_PATH = '/tmp/test-registry.json';

function makeSquad(overrides: Partial<AgentTeamConfig> = {}): AgentTeamConfig {
  return {
    id: 'squad-a',
    name: 'Squad A',
    path: '/repos/squad-a',
    icon: '🤖',
    universe: 'rick-and-morty',
    ...overrides,
  };
}

describe('EditlessRegistry', () => {
  let registry: EditlessRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new EditlessRegistry(REGISTRY_PATH);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // loadSquads
  // -------------------------------------------------------------------------

  describe('loadSquads', () => {
    it('reads and parses registry JSON correctly', () => {
      const squads = [makeSquad(), makeSquad({ id: 'squad-b', name: 'Squad B' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));

      const result = registry.loadSquads();

      expect(fs.readFileSync).toHaveBeenCalledWith(REGISTRY_PATH, 'utf-8');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('squad-a');
      expect(result[1].id).toBe('squad-b');
    });

    it('handles missing file (returns empty array)', () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw err; });

      const result = registry.loadSquads();

      expect(result).toEqual([]);
    });

    it('handles malformed JSON gracefully', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('not valid json {{{');

      const result = registry.loadSquads();

      expect(result).toEqual([]);
    });

    it('returns empty array when data.squads is not an array', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads: 'not-array' }));

      const result = registry.loadSquads();

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getSquad
  // -------------------------------------------------------------------------

  describe('getSquad', () => {
    it('returns correct squad by id', () => {
      const squads = [makeSquad(), makeSquad({ id: 'squad-b', name: 'Squad B' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      registry.loadSquads();

      expect(registry.getSquad('squad-b')?.name).toBe('Squad B');
    });

    it('returns undefined for missing id', () => {
      const squads = [makeSquad()];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      registry.loadSquads();

      expect(registry.getSquad('nonexistent')).toBeUndefined();
    });

    it('returns undefined when no squads loaded', () => {
      expect(registry.getSquad('squad-a')).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // updateSquad
  // -------------------------------------------------------------------------

  describe('updateSquad', () => {
    it('persists partial updates', () => {
      const squads = [makeSquad()];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));

      const result = registry.updateSquad('squad-a', { name: 'Updated Name', icon: '🚀' });

      expect(result).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalledOnce();

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.squads[0].name).toBe('Updated Name');
      expect(written.squads[0].icon).toBe('🚀');
      expect(written.squads[0].id).toBe('squad-a');
    });

    it('returns false for missing squad', () => {
      const squads = [makeSquad()];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));

      const result = registry.updateSquad('nonexistent', { name: 'Nope' });

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // addSquads
  // -------------------------------------------------------------------------

  describe('addSquads', () => {
    it('appends new squads and persists', () => {
      const existing = [makeSquad()];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads: existing }));

      const newSquad = makeSquad({ id: 'squad-c', name: 'Squad C' });
      registry.addSquads([newSquad]);

      expect(fs.writeFileSync).toHaveBeenCalledOnce();

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.squads).toHaveLength(2);
      expect(written.squads[1].id).toBe('squad-c');
    });

    it('skips squads whose id already exists in registry', () => {
      const existing = [makeSquad({ id: 'squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads: existing }));

      registry.addSquads([makeSquad({ id: 'squad-a', name: 'Duplicate' })]);

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('adds only non-duplicate squads from a mixed batch', () => {
      const existing = [makeSquad({ id: 'squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads: existing }));

      registry.addSquads([
        makeSquad({ id: 'squad-a', name: 'Dup' }),
        makeSquad({ id: 'squad-b', name: 'New' }),
      ]);

      expect(fs.writeFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.squads).toHaveLength(2);
      expect(written.squads[0].id).toBe('squad-a');
      expect(written.squads[1].id).toBe('squad-b');
    });

    it('creates file structure when registry file does not exist', () => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      vi.mocked(fs.readFileSync).mockImplementation(() => { throw err; });

      const newSquad = makeSquad({ id: 'squad-new' });
      registry.addSquads([newSquad]);

      expect(fs.writeFileSync).toHaveBeenCalledOnce();

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.version).toBe('1.0');
      expect(written.squads.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // loadSquads dedup
  // -------------------------------------------------------------------------

  describe('loadSquads dedup', () => {
    it('deduplicates squads by id, keeping first occurrence', () => {
      const duped = [
        makeSquad({ id: 'squad-a', name: 'First' }),
        makeSquad({ id: 'squad-a', name: 'Second' }),
        makeSquad({ id: 'squad-b', name: 'Unique' }),
      ];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads: duped }));

      const result = registry.loadSquads();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('First');
      expect(result[1].id).toBe('squad-b');
    });
  });

  // -------------------------------------------------------------------------
  // loadSquads universe re-detection (#401)
  // -------------------------------------------------------------------------

  describe('loadSquads universe re-detection (#401)', () => {
    it('re-detects universe from team.md for unknown entries', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue('/repos/squad-a/.squad/team.md');
      vi.mocked(parseTeamMd).mockReturnValue({ name: 'Squad A', universe: 'rick-and-morty' });

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('rick-and-morty');
      expect(resolveTeamMd).toHaveBeenCalledWith('/repos/squad-a');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('falls back to readUniverseFromRegistry when team.md has no universe', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue('/repos/squad-a/.squad/team.md');
      vi.mocked(parseTeamMd).mockReturnValue({ name: 'Squad A', universe: 'unknown' });
      vi.mocked(readUniverseFromRegistry).mockReturnValue('futurama');

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('futurama');
      expect(readUniverseFromRegistry).toHaveBeenCalledWith('/repos/squad-a');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('falls back to readUniverseFromRegistry when no team.md exists', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue(null);
      vi.mocked(readUniverseFromRegistry).mockReturnValue('the-office');

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('the-office');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('leaves universe as unknown when no detection source available', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue(null);
      vi.mocked(readUniverseFromRegistry).mockReturnValue(undefined);

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('unknown');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('only runs detection on first loadSquads() call', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue('/repos/squad-a/.squad/team.md');
      vi.mocked(parseTeamMd).mockReturnValue({ name: 'Squad A', universe: 'rick-and-morty' });

      registry.loadSquads();
      vi.mocked(resolveTeamMd).mockClear();
      vi.mocked(parseTeamMd).mockClear();

      // Second call should NOT trigger detection again
      registry.loadSquads();

      expect(resolveTeamMd).not.toHaveBeenCalled();
      expect(parseTeamMd).not.toHaveBeenCalled();
    });

    it('does not crash when team.md read throws', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      // First call returns registry JSON; second call (team.md read) throws
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(JSON.stringify({ version: '1.0', squads }))
        .mockImplementation(() => { throw new Error('EACCES: permission denied'); });
      vi.mocked(resolveTeamMd).mockReturnValue('/repos/squad-a/.squad/team.md');
      vi.mocked(readUniverseFromRegistry).mockReturnValue(undefined);

      const result = registry.loadSquads();

      expect(result).toHaveLength(1);
      expect(result[0].universe).toBe('unknown');
    });

    it('does not crash when parseTeamMd throws', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'unknown', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue('/repos/squad-a/.squad/team.md');
      vi.mocked(parseTeamMd).mockImplementation(() => { throw new Error('malformed team.md'); });
      vi.mocked(readUniverseFromRegistry).mockReturnValue('futurama');

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('futurama');
    });

    it('handles mixed known/unknown universes across multiple squads', () => {
      const squads = [
        makeSquad({ id: 'squad-a', universe: 'rick-and-morty', path: '/repos/squad-a' }),
        makeSquad({ id: 'squad-b', universe: 'unknown', path: '/repos/squad-b' }),
        makeSquad({ id: 'squad-c', universe: 'unknown', path: '/repos/squad-c' }),
      ];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));
      vi.mocked(resolveTeamMd).mockReturnValue(null);
      vi.mocked(readUniverseFromRegistry)
        .mockReturnValueOnce('futurama')
        .mockReturnValueOnce(undefined);

      const result = registry.loadSquads();

      expect(result[0].universe).toBe('rick-and-morty');
      expect(result[1].universe).toBe('futurama');
      expect(result[2].universe).toBe('unknown');
      // Only squad-b and squad-c should trigger detection
      expect(resolveTeamMd).toHaveBeenCalledTimes(2);
    });

    it('does not re-detect for squads with a known universe', () => {
      const squads = [makeSquad({ id: 'squad-a', universe: 'rick-and-morty', path: '/repos/squad-a' })];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));

      registry.loadSquads();

      expect(resolveTeamMd).not.toHaveBeenCalled();
      expect(readUniverseFromRegistry).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // loadSquads migration persist (#401)
  // -------------------------------------------------------------------------

  describe('loadSquads migration persist (#401)', () => {
    it('persists launchCommand migration to disk', () => {
      const squads = [{
        id: 'squad-a',
        name: 'Squad A',
        path: '/repos/squad-a',
        icon: '🤖',
        universe: 'rick-and-morty',
        launchCommand: 'copilot --agent morty --model gpt-4',
      }];
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ version: '1.0', squads }));

      const result = registry.loadSquads();

      expect(result[0].model).toBe('gpt-4');
      expect((result[0] as any).launchCommand).toBeUndefined();
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
      expect(written.squads[0].model).toBe('gpt-4');
    });
  });
});
