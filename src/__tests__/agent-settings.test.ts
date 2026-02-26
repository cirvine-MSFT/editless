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

  it('skips squads with no relevant properties', () => {
    const oldPath = path.join(tmpDir, 'agent-registry.json');
    fs.writeFileSync(oldPath, JSON.stringify({
      squads: [{ id: 'squad-1', path: '/a' }],
    }));

    const mgr = new AgentSettingsManager(settingsPath);
    migrateFromRegistry(oldPath, mgr);

    expect(mgr.get('squad-1')).toBeUndefined();
  });
});
