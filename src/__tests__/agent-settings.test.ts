import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', () => ({
  EventEmitter: class { event = vi.fn(); fire = vi.fn(); dispose = vi.fn(); },
  Uri: { file: (s: string) => ({ fsPath: s }) },
  RelativePattern: class { constructor(public base: unknown, public pattern: string) {} },
  workspace: {
    createFileSystemWatcher: () => ({
      onDidChange: vi.fn(),
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}));

import { AgentSettingsManager, migrateFromRegistry } from '../agent-settings';

let tmpDir: string;
let settingsPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-settings-test-'));
  settingsPath = path.join(tmpDir, 'agent-settings.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Constructor & reload
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — constructor', () => {
  it('starts empty when settings file does not exist', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.getAll()).toEqual({});
  });

  it('loads existing settings from disk', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ agents: { 'squad-1': { name: 'Alpha' } } }));
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha' });
  });

  it('handles malformed JSON gracefully', () => {
    fs.writeFileSync(settingsPath, 'NOT VALID JSON');
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.getAll()).toEqual({});
  });

  it('handles missing agents key gracefully', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ other: 'data' }));
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.getAll()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// get / getAll
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — get / getAll', () => {
  it('get returns undefined for unknown id', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.get('nonexistent')).toBeUndefined();
  });

  it('getAll returns a shallow copy', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ agents: { a: { name: 'A' } } }));
    const mgr = new AgentSettingsManager(settingsPath);
    const all = mgr.getAll();
    all['b'] = { name: 'B' };
    expect(mgr.get('b')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — update', () => {
  it('creates a new entry', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha', icon: '🔷' });
    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha', icon: '🔷' });
  });

  it('merges with existing entry', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ agents: { 'squad-1': { name: 'Alpha', model: 'gpt-5' } } }));
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { model: 'claude-sonnet-4' });
    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha', model: 'claude-sonnet-4' });
  });

  it('persists to disk', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha' });
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(raw.agents['squad-1'].name).toBe('Alpha');
  });

  it('creates parent directories if needed', () => {
    const nested = path.join(tmpDir, 'sub', 'dir', 'settings.json');
    const mgr = new AgentSettingsManager(nested);
    mgr.update('squad-1', { name: 'Alpha' });
    expect(fs.existsSync(nested)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — remove', () => {
  it('removes an existing entry', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ agents: { 'squad-1': { name: 'Alpha' } } }));
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.remove('squad-1');
    expect(mgr.get('squad-1')).toBeUndefined();
  });

  it('no-ops for unknown id', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.remove('nonexistent');
    expect(mgr.getAll()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// isHidden / hide / show / getHiddenIds / showAll
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — visibility', () => {
  it('isHidden returns false for unknown id', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    expect(mgr.isHidden('squad-1')).toBe(false);
  });

  it('hide marks agent as hidden', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hide('squad-1');
    expect(mgr.isHidden('squad-1')).toBe(true);
  });

  it('show removes hidden property (does not set to false)', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hide('squad-1');
    mgr.show('squad-1');
    expect(mgr.isHidden('squad-1')).toBe(false);
    expect(mgr.get('squad-1')).toBeDefined();
    expect(mgr.get('squad-1')!.hidden).toBeUndefined();
  });

  it('show no-ops for unknown id', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.show('nonexistent');
    expect(mgr.get('nonexistent')).toBeUndefined();
  });

  it('getHiddenIds returns all hidden ids', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hide('squad-1');
    mgr.hide('squad-2');
    mgr.update('squad-3', { name: 'Visible' });
    expect(mgr.getHiddenIds().sort()).toEqual(['squad-1', 'squad-2']);
  });

  it('showAll unhides all agents', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hide('squad-1');
    mgr.hide('squad-2');
    mgr.showAll();
    expect(mgr.getHiddenIds()).toEqual([]);
    expect(mgr.isHidden('squad-1')).toBe(false);
    expect(mgr.isHidden('squad-2')).toBe(false);
  });

  it('hide preserves other settings', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha', model: 'gpt-5' });
    mgr.hide('squad-1');
    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha', model: 'gpt-5', hidden: true });
  });
});

// ---------------------------------------------------------------------------
// reload
// ---------------------------------------------------------------------------

describe('AgentSettingsManager — reload', () => {
  it('picks up changes written externally', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha' });

    // Simulate external write
    fs.writeFileSync(settingsPath, JSON.stringify({ agents: { 'squad-1': { name: 'Beta' } } }));
    mgr.reload();

    expect(mgr.get('squad-1')!.name).toBe('Beta');
  });

  it('handles file disappearing between writes', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('squad-1', { name: 'Alpha' });

    fs.unlinkSync(settingsPath);
    mgr.reload();

    expect(mgr.getAll()).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// migrateFromRegistry
// ---------------------------------------------------------------------------

describe('migrateFromRegistry', () => {
  it('migrates squad data from old registry format', () => {
    const oldPath = path.join(tmpDir, 'agent-registry.json');
    fs.writeFileSync(oldPath, JSON.stringify({
      squads: [
        { id: 'squad-1', name: 'Alpha', icon: '🚀', model: 'gpt-5', path: '/a' },
        { id: 'squad-2', name: 'Beta', icon: '🔷', additionalArgs: '--verbose', path: '/b' },
      ],
    }));

    const mgr = new AgentSettingsManager(settingsPath);
    const result = migrateFromRegistry(oldPath, mgr);

    expect(result).toBe(true);
    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha', icon: '🚀', model: 'gpt-5' });
    expect(mgr.get('squad-2')).toEqual({ name: 'Beta', icon: '🔷', additionalArgs: '--verbose' });
  });

  it('returns false for empty squads array', () => {
    const oldPath = path.join(tmpDir, 'agent-registry.json');
    fs.writeFileSync(oldPath, JSON.stringify({ squads: [] }));

    const mgr = new AgentSettingsManager(settingsPath);
    expect(migrateFromRegistry(oldPath, mgr)).toBe(false);
  });

  it('returns false for missing file', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    expect(migrateFromRegistry('/nonexistent/file.json', mgr)).toBe(false);
  });

  it('skips squads without id', () => {
    const oldPath = path.join(tmpDir, 'agent-registry.json');
    fs.writeFileSync(oldPath, JSON.stringify({
      squads: [
        { name: 'NoId', icon: '🔷' },
        { id: 'squad-1', name: 'Alpha', icon: '🚀' },
      ],
    }));

    const mgr = new AgentSettingsManager(settingsPath);
    migrateFromRegistry(oldPath, mgr);

    expect(mgr.get('squad-1')).toEqual({ name: 'Alpha', icon: '🚀' });
    expect(Object.keys(mgr.getAll())).toHaveLength(1);
  });

  it('creates stub entry for squads with no relevant properties', () => {
    const oldPath = path.join(tmpDir, 'agent-registry.json');
    fs.writeFileSync(oldPath, JSON.stringify({
      squads: [{ id: 'squad-1', path: '/a' }],
    }));

    const mgr = new AgentSettingsManager(settingsPath);
    migrateFromRegistry(oldPath, mgr);

    expect(mgr.get('squad-1')).toEqual({});
  });
});

// hydrateFromDiscovery
// ---------------------------------------------------------------------------

describe('hydrateFromDiscovery', () => {
  it('creates entries for new agents with all default fields', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'Agent One', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
      { id: 'squad-1', defaults: { name: 'Squad One', icon: '🔷', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    expect(mgr.get('agent-1')).toEqual({ name: 'Agent One', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' });
    expect(mgr.get('squad-1')).toEqual({ name: 'Squad One', icon: '🔷', hidden: false, model: '', additionalArgs: '', command: '' });
  });

  it('does not overwrite existing user-customized values', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('agent-1', { name: 'My Custom Name', icon: '⚡', additionalArgs: '--yolo' });

    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'Agent One', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    const entry = mgr.get('agent-1');
    expect(entry?.name).toBe('My Custom Name');
    expect(entry?.icon).toBe('⚡');
    expect(entry?.additionalArgs).toBe('--yolo');
    // Missing fields filled in
    expect(entry?.hidden).toBe(false);
    expect(entry?.model).toBe('');
    expect(entry?.command).toBe('');
  });

  it('fills in missing fields on existing entries', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('agent-1', { hidden: true });

    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'Agent One', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    const entry = mgr.get('agent-1');
    expect(entry?.hidden).toBe(true); // user value preserved
    expect(entry?.name).toBe('Agent One'); // default filled in
    expect(entry?.icon).toBe('🤖');
  });

  it('does not write to disk when nothing changed', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'A', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    const statBefore = fs.statSync(settingsPath).mtimeMs;
    // Small delay to ensure mtime would change if written
    const start = Date.now();
    while (Date.now() - start < 50) { /* busy-wait */ }

    // Same hydration — nothing new
    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'A', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    const statAfter = fs.statSync(settingsPath).mtimeMs;
    expect(statAfter).toBe(statBefore);
  });

  it('writes to disk in a single batch', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.hydrateFromDiscovery([
      { id: 'a', defaults: { name: 'A', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
      { id: 'b', defaults: { name: 'B', icon: '🔷', hidden: false, model: '', additionalArgs: '', command: '' } },
      { id: 'c', defaults: { name: 'C', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    // Verify all were written by reloading from disk
    const mgr2 = new AgentSettingsManager(settingsPath);
    expect(mgr2.get('a')).toBeDefined();
    expect(mgr2.get('b')).toBeDefined();
    expect(mgr2.get('c')).toBeDefined();
  });

  it('does not write to disk when given empty array', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    // First ensure file exists with known mtime
    mgr.hydrateFromDiscovery([
      { id: 'x', defaults: { name: 'X', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);
    const statBefore = fs.statSync(settingsPath).mtimeMs;
    const start = Date.now();
    while (Date.now() - start < 50) { /* busy-wait */ }

    mgr.hydrateFromDiscovery([]);

    const statAfter = fs.statSync(settingsPath).mtimeMs;
    expect(statAfter).toBe(statBefore);
  });

  it('repeated hydration calls preserve user values even with changing defaults', () => {
    const mgr = new AgentSettingsManager(settingsPath);
    mgr.update('agent-1', { icon: '⚡' });

    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'Agent', icon: '🤖', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    mgr.hydrateFromDiscovery([
      { id: 'agent-1', defaults: { name: 'Agent', icon: '🔷', hidden: false, model: '', additionalArgs: '', command: '' } },
    ]);

    expect(mgr.get('agent-1')?.icon).toBe('⚡');
  });
});
