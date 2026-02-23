import * as assert from 'assert';
import * as vscode from 'vscode';

// TerminalManager and workspaceState are internal to the extension.
// These tests require the extension to export a test API from activate().
// See .ai-team/decisions/inbox/meeseeks-integration-tests.md for the
// contract that must be fulfilled before these tests can run.

interface EditlessTestApi {
  terminalManager: {
    launchTerminal(config: TestSquadConfig, customName?: string): vscode.Terminal;
    getAllTerminals(): Array<{ terminal: vscode.Terminal; info: Record<string, unknown> }>;
  };
  context: vscode.ExtensionContext;
}

interface TestSquadConfig {
  id: string;
  name: string;
  path: string;
  icon: string;
  universe: string;
  agentFlag?: string;
}

const STORAGE_KEY = 'editless.terminalSessions';

const PERSISTED_FIELDS = [
  'id', 'labelKey', 'displayName', 'squadId', 'squadName',
  'squadIcon', 'index', 'createdAt', 'terminalName',
  'lastSeenAt', 'rebootCount',
] as const;

function makeSquadConfig(overrides: Partial<TestSquadConfig> = {}): TestSquadConfig {
  return {
    id: 'test-squad-alpha',
    name: 'Alpha Squad',
    path: process.cwd(),
    icon: '🧪',
    universe: 'test',
    agentFlag: 'squad',
    ...overrides,
  };
}

async function activateExtension(): Promise<EditlessTestApi> {
  const ext = vscode.extensions.getExtension('cirvine-MSFT.editless');
  assert.ok(ext, 'Extension should be installed');
  const api = await ext.activate();
  assert.ok(api, 'Extension should export an API object (see meeseeks-integration-tests decision)');
  return api as EditlessTestApi;
}

suite('Session Persistence (integration)', () => {
  let api: EditlessTestApi;
  const terminalsToCleanup: vscode.Terminal[] = [];

  suiteSetup(async () => {
    api = await activateExtension();
  });

  teardown(async () => {
    for (const t of terminalsToCleanup) {
      t.dispose();
    }
    terminalsToCleanup.length = 0;
    // Clear persisted state between tests
    await api.context.workspaceState.update(STORAGE_KEY, undefined);
  });

  // -----------------------------------------------------------------------
  // 1. Create terminal → verify session persists in workspaceState
  // -----------------------------------------------------------------------

  test('should persist a session to workspaceState after launchTerminal', async () => {
    const config = makeSquadConfig();
    const terminal = api.terminalManager.launchTerminal(config);
    terminalsToCleanup.push(terminal);

    const persisted = api.context.workspaceState.get<unknown[]>(STORAGE_KEY);
    assert.ok(persisted, 'workspaceState should contain persisted sessions');
    assert.strictEqual(persisted.length, 1, 'Should have exactly one persisted session');
  });

  // -----------------------------------------------------------------------
  // 2. Verify workspaceState data shape after persist
  // -----------------------------------------------------------------------

  test('should persist the correct PersistedTerminalInfo shape', async () => {
    const config = makeSquadConfig();
    const terminal = api.terminalManager.launchTerminal(config);
    terminalsToCleanup.push(terminal);

    const persisted = api.context.workspaceState.get<Record<string, unknown>[]>(STORAGE_KEY);
    assert.ok(persisted && persisted.length > 0, 'Should have persisted data');

    const entry = persisted[0];

    for (const field of PERSISTED_FIELDS) {
      assert.ok(
        field in entry,
        `Persisted entry should have field "${field}" — got keys: ${Object.keys(entry).join(', ')}`,
      );
    }

    // Type assertions for numeric fields
    assert.strictEqual(typeof entry.lastSeenAt, 'number', 'lastSeenAt should be a number');
    assert.strictEqual(typeof entry.rebootCount, 'number', 'rebootCount should be a number');
    assert.strictEqual(typeof entry.index, 'number', 'index should be a number');

    // String fields
    assert.strictEqual(typeof entry.id, 'string', 'id should be a string');
    assert.strictEqual(typeof entry.labelKey, 'string', 'labelKey should be a string');
    assert.strictEqual(typeof entry.displayName, 'string', 'displayName should be a string');
    assert.strictEqual(typeof entry.createdAt, 'string', 'createdAt should be an ISO string');
    assert.strictEqual(typeof entry.terminalName, 'string', 'terminalName should be a string');

    // Freshly persisted entries should have rebootCount 0
    assert.strictEqual(entry.rebootCount, 0, 'New session rebootCount should be 0');

    // Validate squad identity echoes config
    assert.strictEqual(entry.squadId, config.id);
    assert.strictEqual(entry.squadName, config.name);
    assert.strictEqual(entry.squadIcon, config.icon);
  });

  // -----------------------------------------------------------------------
  // 3. Two squads with sessions → verify correct squad association
  // -----------------------------------------------------------------------

  test('should associate sessions with correct squad when multiple squads have terminals', async () => {
    const alphaConfig = makeSquadConfig({
      id: 'test-squad-alpha',
      name: 'Alpha Squad',
      icon: '🅰️',
    });
    const betaConfig = makeSquadConfig({
      id: 'test-squad-beta',
      name: 'Beta Squad',
      icon: '🅱️',
    });

    const alphaTerminal = api.terminalManager.launchTerminal(alphaConfig);
    const betaTerminal = api.terminalManager.launchTerminal(betaConfig);
    terminalsToCleanup.push(alphaTerminal, betaTerminal);

    const persisted = api.context.workspaceState.get<Record<string, unknown>[]>(STORAGE_KEY);
    assert.ok(persisted, 'Should have persisted data');
    assert.strictEqual(persisted.length, 2, 'Should have two persisted sessions');

    const alphaEntry = persisted.find((e: Record<string, unknown>) => e.squadId === 'test-squad-alpha');
    const betaEntry = persisted.find((e: Record<string, unknown>) => e.squadId === 'test-squad-beta');

    assert.ok(alphaEntry, 'Should have an entry for alpha squad');
    assert.ok(betaEntry, 'Should have an entry for beta squad');

    assert.strictEqual(alphaEntry.squadName, 'Alpha Squad');
    assert.strictEqual(alphaEntry.squadIcon, '🅰️');

    assert.strictEqual(betaEntry.squadName, 'Beta Squad');
    assert.strictEqual(betaEntry.squadIcon, '🅱️');

    // IDs should be unique
    assert.notStrictEqual(alphaEntry.id, betaEntry.id, 'Session IDs should be unique');
  });
});
