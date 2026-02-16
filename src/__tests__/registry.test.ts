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

import { EditlessRegistry } from '../registry';

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
});
