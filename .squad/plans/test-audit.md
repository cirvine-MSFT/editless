# Test Suite Audit — Meeseeks

**Date:** 2026-01-15  
**Auditor:** Meeseeks (Tester)  
**Test Framework:** Vitest 4.0.18  
**Codebase:** EditLess VS Code Extension

---

## Test Suite Status

✅ **ALL TESTS PASSING**: 1198/1198 tests pass (37 test files)  
⏱️ **Execution Time**: 9.16s total, 21.38s in tests  
📊 **Coverage**: 47.3% (26/55 source files tested)

### Health Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Test Pass Rate | 100% | ✅ Excellent |
| Source File Coverage | 47.3% (26/55) | 🟡 Needs Work |
| Command Coverage | 0% (0/7) | 🔴 Critical Gap |
| Extension Core Coverage | 0% (0/6) | 🔴 Critical Gap |
| Test Suite Speed | 9.16s | ✅ Good |
| Flaky Tests Detected | 2 files | 🟡 Needs Fix |

**Overall Assessment**: The test suite is comprehensive where it exists, with good quality tests in many files. However, **critical gaps** exist in core extension files, commands, and error path coverage. Several anti-patterns and fragile tests need attention.

---

## Critical Issues (must fix)

### 1. ❌ Extension Core Completely Untested (Zero Coverage)

**Files Affected:**
- `extension.ts` — **MAIN ENTRY POINT** (no tests)
- `extension-discovery.ts` (no tests)
- `extension-integrations.ts` (no tests)
- `extension-managers.ts` (no tests)
- `extension-settings.ts` (no tests)
- `extension-watchers.ts` (no tests)

**Why Critical:** The extension activation, deactivation, and lifecycle are never tested. If `activate()` throws, we won't know until runtime. These are the glue that holds the entire extension together.

**Impact:** Production bugs in core initialization, registration failures, memory leaks on deactivation.

**Fix:** Create `extension.test.ts`:
```typescript
describe('Extension Activation', () => {
  it('should register all commands on activate', async () => {
    const context = makeMockExtensionContext();
    await activate(context);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith('editless.launchAgent', expect.any(Function));
    // ... verify all commands registered
  });

  it('should dispose all resources on deactivate', async () => {
    const context = makeMockExtensionContext();
    await activate(context);
    await deactivate();
    expect(allDisposables.every(d => d.dispose.called)).toBe(true);
  });

  it('should handle activation errors gracefully', async () => {
    mockTreeProvider.mockImplementation(() => { throw new Error('init fail'); });
    await expect(activate(context)).rejects.toThrow();
    // Extension should log error, not crash VS Code
  });
});
```

---

### 2. ❌ All Command Files Untested (0% Coverage)

**Files Affected (7 files):**
- `commands/agent-commands.ts`
- `commands/agent-file-manager.ts`
- `commands/git-worktree-service.ts`
- `commands/level-filter-picker.ts`
- `commands/session-commands.ts`
- `commands/work-item-commands.ts`
- `commands/work-item-launcher.ts`

**Why Critical:** Commands are **user-facing functionality**. These are what users click in the UI. No tests means every command could break without warning.

**Impact:** Users file bugs. Commands fail silently. Edge cases (empty workspace, no git repo, etc.) crash the extension.

**Fix:** Create `commands/agent-commands.test.ts`, etc. Test each command handler:
```typescript
describe('launchAgentCommand', () => {
  it('should show quick pick when multiple agents available', async () => {
    mockGetDiscoveredItems.mockReturnValue([agent1, agent2]);
    await launchAgentCommand();
    expect(vscode.window.showQuickPick).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: agent1.name }),
        expect.objectContaining({ label: agent2.name }),
      ])
    );
  });

  it('should show error when no agents discovered', async () => {
    mockGetDiscoveredItems.mockReturnValue([]);
    await launchAgentCommand();
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('No agents found')
    );
  });

  it('should launch terminal with correct command', async () => {
    mockShowQuickPick.mockResolvedValue(agentPick);
    await launchAgentCommand();
    expect(mockLaunchTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'copilot --agent my-agent' })
    );
  });
});
```

---

### 3. 🔴 Flaky Tests Using Real Timers

**File:** `session-context.test.ts`  
**Lines:** 142, 150, 200, 300+ occurrences

**Issue:**
```typescript
await new Promise(resolve => setTimeout(resolve, 50));
```

**Why Critical:**
- Tests use **real setTimeout**, not mocked timers
- 50ms waits accumulate → test suite takes 7+ seconds for this one file
- **Flaky in CI** with throttled CPUs
- No guarantee 50ms is sufficient; timing-dependent race conditions

**Impact:**
- Intermittent failures in CI/CD
- Slow test runs
- False negatives when timing changes

**Fix:**
```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Replace all setTimeout waits:
// OLD: await new Promise(resolve => setTimeout(resolve, 50));
// NEW:
vi.advanceTimersByTime(50);
await vi.runOnlyPendingTimersAsync();
```

---

### 4. 🔴 Testing Private Implementation Details (Breaks on Refactoring)

**File:** `status-bar.test.ts`  
**Lines:** 58-60, 69-71, 89-90

**Issue:**
```typescript
const item = (bar as any)._item;  // ← Accessing private property!
expect(item.text).toContain('2 agents');
```

**Why Critical:**
- Uses `as any` to bypass TypeScript protection
- Tests internal `_item` property, not public behavior
- If refactored to `_statusBarItem`, **all tests break** even though behavior is correct
- Violates encapsulation

**Impact:** Tests fail on safe refactorings. False positives when implementation changes but behavior doesn't.

**Fix:**
```typescript
// In status-bar.ts, add public getter:
public getText(): string {
  return this._item.text;
}

// In tests:
expect(bar.getText()).toContain('2 agents');
```

---

### 5. ❌ Terminal Persistence Untested (Session Recovery at Risk)

**Files Affected:**
- `terminal-persistence.ts` (no tests)
- `terminal-state.ts` (no tests)
- `session-recovery.ts` (no tests)

**Why Critical:**
- Session recovery is a **core feature** of EditLess
- If persistence breaks, users lose their work context
- Filesystem I/O errors, corrupt state files, schema changes — all untested

**Impact:** Data loss. Corrupted session state. Terminal connections lost on restart.

**Fix:** Create `terminal-persistence.test.ts`:
```typescript
describe('Terminal Persistence', () => {
  it('should save terminal state to disk', async () => {
    const state = { terminals: [{ id: '1', label: 'Test' }] };
    await saveTerminalState(state);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('terminals.json'),
      JSON.stringify(state, null, 2)
    );
  });

  it('should handle corrupted state file gracefully', async () => {
    mockReadFileSync.mockReturnValue('{{{{not json');
    const state = await loadTerminalState();
    expect(state).toEqual({ terminals: [] }); // fallback to empty
  });

  it('should recover terminal state on extension restart', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({ terminals: [{ id: '1' }] }));
    const recovered = await recoverTerminals();
    expect(recovered).toHaveLength(1);
  });
});
```

---

## High Priority (should fix)

### 6. 🟡 Missing Error Path Tests in Network Calls

**File:** `github-client.test.ts`  
**Missing Scenarios:**
- ❌ Connection timeouts
- ❌ DNS resolution failures
- ❌ Partial data received before error
- ❌ Retry logic failures
- ❌ HTTP 401 (auth expired mid-request)
- ❌ HTTP 500 (server error)

**Current Coverage:**
- ✅ `gh auth status` failure (line 36)
- ✅ Malformed JSON (line 100)
- ✅ Empty results

**Why Important:** Network failures are common. Code should handle them gracefully, not crash.

**Fix:**
```typescript
it('should timeout after 30s waiting for gh response', async () => {
  vi.useFakeTimers();
  mockExecFileAsync.mockImplementation(() => 
    new Promise(resolve => setTimeout(resolve, 40000))
  );
  const promise = fetchAssignedIssues('owner/repo');
  vi.advanceTimersByTime(30000);
  expect(await promise).toEqual([]); // timeout → empty, not throw
});

it('should return empty array on network error', async () => {
  mockExecFileAsync.mockRejectedValue(new Error('ECONNREFUSED'));
  expect(await fetchAssignedIssues('owner/repo')).toEqual([]);
});

it('should handle HTTP 401 by clearing cached credentials', async () => {
  mockExecFileAsync.mockRejectedValue({ statusCode: 401 });
  await fetchAssignedIssues('owner/repo');
  expect(mockClearGhAuthCache).toHaveBeenCalled();
});
```

---

### 7. 🟡 ADO Client Missing Auth Error Tests

**File:** `ado-client.test.ts`  
**Lines:** 86-97 (only tests network error, not auth errors)

**Missing:**
- ❌ HTTP 401 (token expired)
- ❌ HTTP 403 (insufficient permissions)
- ❌ HTTP 500 (ADO server error)
- ❌ Malformed WIQL response
- ❌ Timeout on long-running queries

**Current Coverage:**
- ✅ Network error (line 87)
- ✅ Empty results (line 92)

**Fix:**
```typescript
it('should return empty array on 401 Unauthorized', async () => {
  setupRequestResponse(401, '{"error":"Unauthorized"}');
  const items = await fetchAdoWorkItems('org', 'proj', 'bad-token');
  expect(items).toEqual([]);
  expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('401'));
});

it('should retry on HTTP 500 server error', async () => {
  setupRequestResponse(500, '{"error":"Internal Server Error"}');
  await fetchAdoWorkItems('org', 'proj', 'token');
  expect(mockHttpsRequest).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
});

it('should handle malformed WIQL JSON', async () => {
  setupRequestResponse(200, '{{{invalid json');
  expect(await fetchAdoWorkItems('org', 'proj', 'token')).toEqual([]);
});
```

---

### 8. 🟡 Fragile Tests Using Array Indices

**File:** `extension-commands.test.ts`  
**Pattern:** `mockShowQuickPick.mock.calls[0][0]` (dozens of occurrences)

**Issue:**
```typescript
const picks = mockShowQuickPick.mock.calls[0][0];
expect(picks).toHaveLength(3);
expect(picks[0].label).toBe('Launch Squad');
```

**Why Problematic:**
- Assumes first call is the right call
- If another test pollutes state, wrong call is checked
- Depends on call order
- If implementation adds a second quickpick earlier, tests break

**Fix:**
```typescript
// Use .toHaveBeenCalledWith() matcher:
expect(mockShowQuickPick).toHaveBeenCalledWith(
  expect.arrayContaining([
    expect.objectContaining({ label: 'Launch Squad' }),
    expect.objectContaining({ label: 'Refresh' }),
  ]),
  expect.any(Object) // options
);

// Or use helper to find the right call:
function getQuickPickCall(matcher: (items: any[]) => boolean) {
  const call = mockShowQuickPick.mock.calls.find(c => matcher(c[0]));
  return call?.[0];
}

const picks = getQuickPickCall(items => items.some(i => i.label === 'Launch Squad'));
expect(picks).toBeDefined();
```

---

### 9. 🟡 Bad Test: Only Checking Truthy, Not Content

**File:** `ado-client.test.ts`  
**Line:** 156

**Issue:**
```typescript
expect(capturedPath).toBeTruthy();
```

**Why Bad:**
- Test passes if `capturedPath = "x"` or `capturedPath = "wrong/path"`
- Doesn't verify **what** is in the path
- No assertion on actual expected value

**Fix:**
```typescript
expect(capturedPath).toContain('/_apis/wit/wiql');
expect(capturedPath).toContain('api-version=7.0');
expect(capturedPath).toContain('$top=50');
```

---

### 10. 🟡 TODO Comment Indicates Missing Test Coverage

**File:** `status-bar.test.ts`  
**Lines:** 99-104

**Issue:**
```typescript
// TODO: status-bar.ts update() has no try-catch around agentSettings.isHidden().
// Once error handling is added (graceful degradation), add a test here that:
//   1. Calls bar.setDiscoveredItems([...]) with at least one item
//   2. Provides an agentSettings whose isHidden() throws
//   3. Asserts bar.update() does not throw and renders a fallback count
```

**Why Problematic:**
- Test is **documented as needed** but not written
- Code is known to lack error handling
- Technical debt marker will be missed in reviews

**Fix:** Don't defer—add the test immediately:
```typescript
it('should handle agentSettings.isHidden() throwing gracefully', () => {
  const throwingSettings = {
    isHidden: vi.fn(() => { throw new Error('Settings corrupted'); }),
    getHiddenIds: vi.fn(() => []),
  };
  const bar = new EditlessStatusBar(throwingSettings as any, makeTerminalManager(0));
  bar.setDiscoveredItems([makeItem('a'), makeItem('b')]);
  
  expect(() => bar.update()).not.toThrow();
  expect(bar.getText()).toContain('2 agents'); // Should fall back to showing all
});
```

---

### 11. 🟡 Overly Permissive Mock (Hides Bugs)

**File:** `config-refresh.test.ts`  
**Lines:** 89-95

**Issue:**
```typescript
mockGetConfiguration.mockReturnValue({
  get: vi.fn((_key: string, defaultValue?: unknown) => {
    if (_key === 'refreshInterval') return refreshMinutes;
    return defaultValue;  // ← Silently accepts ANY key!
  }),
});
```

**Why Problematic:**
- If code reads `editless.typo.interval` by mistake, mock returns `undefined` (default)
- Test passes even though code reads wrong config key
- Masks typos in config key names

**Fix:**
```typescript
get: vi.fn((_key: string, defaultValue?: unknown) => {
  const validKeys: Record<string, unknown> = {
    'editless.refreshInterval': refreshMinutes,
    'editless.autoRefresh': true,
  };
  if (_key in validKeys) return validKeys[_key];
  throw new Error(`Test error: Unexpected config key "${_key}"`);
})
```

---

### 12. 🟡 Test Suite Missing Null/Undefined Input Tests

**File:** `agent-discovery.test.ts`  
**Missing Edge Cases:**
- ❌ `workspaceFolders = null`
- ❌ `workspaceFolders = undefined`
- ❌ Malformed `.agent.md` files (invalid YAML)
- ❌ File permission errors (EACCES)
- ❌ Symlink loops
- ❌ Unicode/emoji in filenames

**Current Coverage:**
- ✅ Empty workspace folders (line 135-140)
- ✅ Unreadable files (#474 regression test at line 167)

**Fix:**
```typescript
it('should handle null workspaceFolders gracefully', () => {
  expect(() => discoverAgentsInWorkspace(null as any)).not.toThrow();
  expect(discoverAgentsInWorkspace(null as any)).toEqual([]);
});

it('should skip agent files with invalid YAML frontmatter', () => {
  writeFixture('ws/.github/agents/bad.agent.md', '---\ninvalid: {{{yaml\n---\n# Agent');
  const result = discoverAgentsInWorkspace([wsFolder(...)]);
  expect(result).toHaveLength(0); // Skipped, not crashed
});

it('should handle file permission errors without crashing', () => {
  const readonlyFile = writeFixture('ws/.github/agents/readonly.agent.md', '# Test');
  fs.chmodSync(readonlyFile, 0o000); // make unreadable
  expect(() => discoverAgentsInWorkspace([wsFolder(...)])).not.toThrow();
});
```

---

## Medium Priority (nice to fix)

### 13. 🟢 Exact String Matching (Brittle to UI Changes)

**File:** `status-bar.test.ts`  
**Lines:** 59-60

**Issue:**
```typescript
expect(item.text).toContain('2 agents');
expect(item.text).toContain('3 sessions');
```

**Why Problematic:**
- If UX team changes wording to "Agents" (capitalized) or "Squad Members", tests fail
- Couples tests to exact UI text, not structure

**Suggested Fix:**
```typescript
expect(item.text).toMatch(/\d+\s+agents/i); // case-insensitive regex
// Or better: test structure, not exact wording
expect(item.text).toMatch(/^\d+\s+\w+\s+\|\s+\d+\s+\w+$/);
```

---

### 14. 🟢 Incomplete VS Code API Mock

**File:** `status-bar.test.ts`  
**Lines:** 7-23

**Issue:**
```typescript
createStatusBarItem: vi.fn(() => ({
  text: '',
  command: undefined,
  tooltip: undefined,
  show: mockShow,
  dispose: mockDispose,
})),
```

**Missing Properties:**
- `alignment` - never tested
- `priority` - never tested
- `color` - never tested
- `backgroundColor` - never tested
- `name` - never tested
- `accessibilityInformation` - never tested

**Why Problematic:**
- If code sets `item.color = new ThemeColor('red')`, test silently ignores it
- Tests won't catch when code tries to use these properties

**Fix:**
```typescript
createStatusBarItem: vi.fn((alignment, priority) => {
  const item = {
    text: '',
    command: undefined,
    tooltip: undefined,
    alignment,
    priority,
    color: undefined,
    backgroundColor: undefined,
    name: undefined,
    show: mockShow,
    dispose: mockDispose,
  };
  return item;
}),
```

---

### 15. 🟢 No Cleanup of Event Listeners Between Tests

**File:** `debounce-behavior.test.ts`  
**Lines:** 144-151

**Issue:**
```typescript
let capturedCloseListener: CloseListener | undefined;
let capturedShellStartListener: ShellStartListener | undefined;

mockOnDidCloseTerminal.mockImplementation((listener: CloseListener) => {
  capturedCloseListener = listener;  // ← Module-level variable!
  return { dispose: vi.fn() };
});
```

**Why Problematic:**
- Module-level state shared across tests
- If test N fails mid-execution, state from N affects test N+1
- **Test order dependency** — running tests in different order causes failures
- No guarantee that listeners are disposed

**Fix:**
```typescript
beforeEach(() => {
  capturedCloseListener = undefined;
  capturedShellStartListener = undefined;
  vi.clearAllMocks();
});

afterEach(() => {
  // Verify cleanup
  if (capturedCloseListener) {
    expect(mockOnDidCloseTerminal.mock.results[0].value.dispose).toHaveBeenCalled();
  }
});
```

---

### 16. 🟢 Agent Discovery Missing Symlink Tests

**File:** `agent-discovery.test.ts`  
**Line:** 371-394 (symlink test exists, but limited)

**Issue:**
- Test creates symlinks but skips on Windows (requires elevated perms)
- **Symlink cycles** not tested
- **Deeply nested symlinks** not tested
- **Broken symlinks** (pointing to non-existent target) not tested

**Fix:**
```typescript
it('should detect and break symlink cycles', () => {
  const targetDir = path.join(tmpDir, 'target');
  const linkDir = path.join(tmpDir, 'link');
  fs.mkdirSync(targetDir);
  
  // Create cycle: link -> target -> link
  try {
    fs.symlinkSync(targetDir, linkDir, 'junction');
    fs.symlinkSync(linkDir, path.join(targetDir, 'back'), 'junction');
  } catch { /* Skip on Windows without perms */ return; }
  
  // Should not hang or stack overflow
  expect(() => discoverAgentsInCopilotDir(tmpDir)).not.toThrow();
});

it('should skip broken symlinks gracefully', () => {
  const brokenLink = path.join(tmpDir, 'broken-link');
  try {
    fs.symlinkSync('/nonexistent/path', brokenLink, 'junction');
  } catch { return; }
  
  expect(() => discoverAgentsInCopilotDir(tmpDir)).not.toThrow();
});
```

---

### 17. 🟢 Test Names Don't Describe Expected Behavior

**File:** `auto-refresh.test.ts`  
**Line:** 114

**Issue:**
```typescript
it('should return a disposable', () => {
  const disposable = initAutoRefresh(workItems, prs);
  expect(disposable).toBeDefined();
  expect(typeof disposable.dispose).toBe('function');
});
```

**Why Problematic:**
- Test name says what it checks (`returns a disposable`), not **why** or **what should happen**
- Better name: `should register event listeners and return cleanup disposable`

**Fix:**
```typescript
it('should register event listeners for auto-refresh and return cleanup disposable', () => {
  const disposable = initAutoRefresh(workItems, prs);
  
  expect(mockOnDidChangeWindowState).toHaveBeenCalled();
  expect(mockOnDidChangeConfiguration).toHaveBeenCalled();
  expect(disposable.dispose).toBeInstanceOf(Function);
  
  // Verify disposal cleans up listeners
  disposable.dispose();
  expect(mockOnDidChangeWindowState.mock.results[0].value.dispose).toHaveBeenCalled();
});
```

---

### 18. 🟢 Missing Concurrency/Race Condition Tests

**Files:** Multiple (terminal-manager, session-context, work-items-tree)

**Issue:**
- No tests for concurrent operations:
  - User launches 2 agents simultaneously
  - Multiple terminals closing at once
  - Refresh triggered while previous refresh is in progress
  - Watcher events firing during discovery

**Why Problematic:**
- Real users trigger concurrent operations all the time
- Race conditions only appear in production
- State corruption, duplicate terminals, missed events

**Fix:**
```typescript
describe('Race Conditions', () => {
  it('should handle concurrent agent launches without duplication', async () => {
    const promise1 = launchAgent('squad');
    const promise2 = launchAgent('squad'); // Same agent, concurrent
    
    await Promise.all([promise1, promise2]);
    
    const terminals = getAllTerminals();
    // Should create ONE terminal, not two
    expect(terminals.filter(t => t.label.includes('squad'))).toHaveLength(1);
  });

  it('should handle refresh triggered during in-progress refresh', async () => {
    const slowRefresh = vi.fn(() => new Promise(r => setTimeout(r, 100)));
    mockFetchAssignedIssues.mockImplementation(slowRefresh);
    
    provider.refresh(); // Start first refresh
    await new Promise(r => setTimeout(r, 10)); // Small delay
    provider.refresh(); // Trigger second refresh while first is running
    
    await vi.advanceTimersByTime(200);
    
    // Should debounce, not run twice
    expect(slowRefresh).toHaveBeenCalledTimes(1);
  });
});
```

---

## Coverage Gaps

### Source Files → Test File Mapping

| Source File | Test File | Status |
|-------------|-----------|--------|
| **EXTENSION CORE** | | |
| extension.ts | ❌ NONE | 🔴 Critical |
| extension-discovery.ts | ❌ NONE | 🔴 Critical |
| extension-integrations.ts | ❌ NONE | 🔴 Critical |
| extension-managers.ts | ❌ NONE | 🔴 Critical |
| extension-settings.ts | ❌ NONE | 🔴 Critical |
| extension-watchers.ts | ❌ NONE | 🔴 Critical |
| **COMMANDS** | | |
| commands/agent-commands.ts | ❌ NONE | 🔴 Critical |
| commands/agent-file-manager.ts | ❌ NONE | 🔴 Critical |
| commands/git-worktree-service.ts | ❌ NONE | 🔴 Critical |
| commands/level-filter-picker.ts | ❌ NONE | 🔴 Critical |
| commands/session-commands.ts | ❌ NONE | 🔴 Critical |
| commands/work-item-commands.ts | ❌ NONE | 🔴 Critical |
| commands/work-item-launcher.ts | ❌ NONE | 🔴 Critical |
| **TERMINAL/SESSION** | | |
| terminal-persistence.ts | ❌ NONE | 🔴 Critical |
| terminal-state.ts | ❌ NONE | 🟡 High |
| terminal-types.ts | ❌ NONE | 🟢 Low (types only) |
| session-id-detector.ts | ❌ NONE | 🟡 High |
| session-recovery.ts | ❌ NONE | 🔴 Critical |
| **UI TREE** | | |
| editless-tree.ts | ❌ NONE | 🟡 High |
| editless-tree-data.ts | ❌ NONE | 🟡 High |
| editless-tree-items.ts | ❌ NONE | 🟢 Medium |
| **WORK ITEMS** | | |
| ado-workitems-provider.ts | ❌ NONE | 🟡 High |
| github-workitems-provider.ts | ❌ NONE | 🟡 High |
| local-tasks-provider.ts | ❌ NONE | 🟡 High |
| **UTILITIES** | | |
| emoji-utils.ts | ❌ NONE | 🟢 Low |
| cwd-resolver.ts | ❌ NONE | 🟢 Medium |
| **TYPES** | | |
| types.ts | ❌ NONE | 🟢 Low (types only) |
| work-item-types.ts | ❌ NONE | 🟢 Low (types only) |
| copilot-sdk-types.ts | ❌ NONE | 🟢 Low (types only) |
| **TESTED FILES** | | |
| ado-auth.ts | ✅ ado-auth.test.ts | ✅ Good |
| ado-client.ts | ✅ ado-client.test.ts | ✅ Good |
| agent-discovery.ts | ✅ agent-discovery.test.ts | ✅ Excellent |
| agent-settings.ts | ✅ agent-settings.test.ts | ✅ Good |
| agent-state-manager.ts | ✅ agent-state-manager.test.ts | ✅ Excellent |
| base-tree-provider.ts | ✅ base-tree-provider.test.ts | ✅ Good |
| copilot-cli-builder.ts | ✅ copilot-cli-builder.test.ts | ✅ Excellent |
| copilot-sessions-provider.ts | ✅ copilot-sessions-provider.test.ts | ✅ Good |
| discovery.ts | ✅ discovery.test.ts | ✅ Excellent |
| github-client.ts | ✅ github-client.test.ts | ✅ Good |
| launch-utils.ts | ✅ launch-utils.test.ts | ✅ Good |
| local-tasks-client.ts | ✅ local-tasks-client.test.ts | ✅ Good |
| prs-tree.ts | ✅ prs-tree.test.ts | ✅ Good |
| scanner.ts | ✅ scanner.test.ts | ✅ Good |
| session-context.ts | ✅ session-context.test.ts | ⚠️ Flaky (real timers) |
| session-labels.ts | ✅ session-labels.test.ts | ✅ Good |
| squad-ui-integration.ts | ✅ squad-ui-integration.test.ts | ✅ Good |
| squad-utils.ts | ✅ squad-utils.test.ts | ✅ Good |
| status-bar.ts | ✅ status-bar.test.ts | ⚠️ Tests private state |
| team-dir.ts | ✅ team-dir.test.ts | ✅ Good |
| terminal-manager.ts | ✅ terminal-manager.test.ts | ✅ Excellent |
| unified-discovery.ts | ✅ unified-discovery.test.ts | ✅ Good |
| vscode-compat.ts | ✅ vscode-compat.test.ts | ✅ Good |
| watcher.ts | ✅ watcher.test.ts | ✅ Good |
| work-items-tree.ts | ✅ work-items-tree.test.ts | ✅ Good |
| worktree-discovery.ts | ✅ worktree-discovery.test.ts | ✅ Good |

### Coverage Summary by Category

| Category | Tested | Untested | Coverage % |
|----------|--------|----------|------------|
| Extension Core | 0 | 6 | 0% 🔴 |
| Commands | 0 | 7 | 0% 🔴 |
| Terminal/Session | 1 | 4 | 20% 🔴 |
| UI Tree | 0 | 3 | 0% 🔴 |
| Work Item Providers | 1 | 3 | 25% 🔴 |
| Discovery/Config | 6 | 1 | 86% ✅ |
| Client Libraries | 4 | 0 | 100% ✅ |
| Utilities | 8 | 2 | 80% ✅ |
| Types | 0 | 3 | N/A (types only) |
| **TOTAL** | **26** | **29** | **47.3%** |

---

## Recommended New Tests

### Top 10 Critical Tests (Priority Order)

#### 1. **Extension Activation/Deactivation**
**File:** `extension.test.ts` (create new)  
**Why:** Main entry point has zero coverage. Activation failures crash the entire extension.  
**Tests:**
- ✅ Should register all commands on activate
- ✅ Should dispose all resources on deactivate
- ✅ Should handle activation errors gracefully
- ✅ Should initialize tree providers with correct configuration
- ✅ Should not leak memory on repeated activate/deactivate cycles

---

#### 2. **Command Handlers**
**File:** `commands/agent-commands.test.ts` (create new)  
**Why:** User-facing functionality. Every command is a potential crash point.  
**Tests:**
- ✅ Should show quick pick when multiple agents available
- ✅ Should show error when no agents discovered
- ✅ Should launch terminal with correct command
- ✅ Should handle user cancellation gracefully
- ✅ Should pass --add-dir flags for workspace folders

---

#### 3. **Terminal Persistence**
**File:** `terminal-persistence.test.ts` (create new)  
**Why:** Session recovery is a core value prop. Data loss would be catastrophic.  
**Tests:**
- ✅ Should save terminal state to disk on change
- ✅ Should recover terminal state on extension restart
- ✅ Should handle corrupted state file gracefully
- ✅ Should migrate old state format to new format
- ✅ Should not lose state on filesystem write failure

---

#### 4. **Session Recovery**
**File:** `session-recovery.test.ts` (create new)  
**Why:** Users depend on session continuity across VS Code restarts.  
**Tests:**
- ✅ Should restore terminal state from persisted data
- ✅ Should skip recovery for terminals that no longer exist
- ✅ Should handle recovery errors without blocking startup
- ✅ Should preserve terminal ordering on recovery
- ✅ Should cleanup stale recovery data after successful restore

---

#### 5. **Work Item Providers**
**File:** `ado-workitems-provider.test.ts` (create new)  
**Why:** ADO integration is a key feature. Provider orchestrates fetch + tree rendering.  
**Tests:**
- ✅ Should fetch work items from ADO client
- ✅ Should filter work items by configured query
- ✅ Should handle ADO auth failures gracefully
- ✅ Should debounce rapid refresh calls
- ✅ Should emit onDidChangeTreeData when items update

---

#### 6. **Error Path: Network Failures**
**File:** `github-client.test.ts` (add to existing)  
**Why:** Network calls are most common failure point. Need graceful degradation.  
**Tests:**
- ✅ Should timeout after 30s waiting for gh response
- ✅ Should return empty array on ECONNREFUSED
- ✅ Should clear cached credentials on HTTP 401
- ✅ Should retry on HTTP 500 server error
- ✅ Should handle DNS resolution failures

---

#### 7. **Error Path: ADO Auth Failures**
**File:** `ado-client.test.ts` (add to existing)  
**Why:** ADO auth is complex (VS Code auth → PAT → az CLI). Many failure modes.  
**Tests:**
- ✅ Should return empty array on HTTP 401 Unauthorized
- ✅ Should retry on HTTP 500 server error
- ✅ Should handle malformed WIQL JSON response
- ✅ Should timeout on long-running queries
- ✅ Should log auth errors to output channel

---

#### 8. **Session Context Watcher**
**File:** `session-context.test.ts` (refactor existing)  
**Why:** Currently uses real timers (flaky). Need to test timing guarantees.  
**Tests:**
- ✅ Should debounce rapid file changes (using fake timers)
- ✅ Should parse events.jsonl incrementally
- ✅ Should handle corrupt last line gracefully
- ✅ Should fire callback on workspace.yaml changes
- ✅ Should cleanup file watchers on dispose

---

#### 9. **Race Condition: Concurrent Operations**
**File:** `terminal-manager.test.ts` (add to existing)  
**Why:** Users can trigger concurrent operations. Need to prevent duplicates/corruption.  
**Tests:**
- ✅ Should handle concurrent agent launches without duplication
- ✅ Should handle terminal close during launch
- ✅ Should serialize terminal state updates
- ✅ Should queue pending refreshes during active refresh
- ✅ Should handle rapid terminal open/close cycles

---

#### 10. **UI Tree Integration**
**File:** `editless-tree.test.ts` (create new)  
**Why:** Main UI surface. Tree rendering bugs affect user experience directly.  
**Tests:**
- ✅ Should render agent groups correctly
- ✅ Should show terminal children under active agents
- ✅ Should handle tree refresh during user interaction
- ✅ Should preserve expanded/collapsed state on refresh
- ✅ Should show correct icons and labels for each item type

---

## Summary & Recommendations

### 🎯 Key Findings

1. **Strong Foundation**: 1198 passing tests with 100% pass rate
2. **Critical Gaps**: Extension core (0%), commands (0%), terminal persistence (0%)
3. **Quality Issues**: 15 specific anti-patterns identified
4. **Flaky Tests**: 2 files using real timers (session-context, debounce-behavior)
5. **Good Examples**: discovery.test.ts, agent-state-manager.test.ts, auto-refresh.test.ts

### 📋 Action Items (Prioritized)

**Week 1 - Critical (Must Fix)**
- [ ] Add extension.test.ts (activation/deactivation)
- [ ] Add commands/*.test.ts files (7 files)
- [ ] Add terminal-persistence.test.ts
- [ ] Add session-recovery.test.ts
- [ ] Fix flaky tests in session-context.test.ts (use fake timers)

**Week 2 - High Priority**
- [ ] Add work item provider tests (ado-workitems-provider, github-workitems-provider)
- [ ] Add editless-tree.test.ts
- [ ] Add network error path tests to github-client.test.ts
- [ ] Add ADO auth error tests to ado-client.test.ts
- [ ] Fix private state testing in status-bar.test.ts

**Week 3 - Medium Priority**
- [ ] Add session-id-detector.test.ts
- [ ] Add cwd-resolver.test.ts
- [ ] Refactor array index dependencies in extension-commands.test.ts
- [ ] Add race condition tests for concurrent operations
- [ ] Fix overly permissive mocks (config-refresh.test.ts)

**Week 4 - Polish**
- [ ] Add symlink edge case tests
- [ ] Improve test naming conventions
- [ ] Add null/undefined input tests across all modules
- [ ] Document mock patterns in contributing.md
- [ ] Set up coverage reporting (target 80%+)

### 🏆 Well-Written Tests (Use as Templates)

1. **agent-state-manager.test.ts** - Clean, independent tests, good mocking
2. **discovery.test.ts** - Real filesystem testing, proper cleanup
3. **auto-refresh.test.ts** - Fake timers, helper functions, edge cases
4. **github-client.test.ts** - Error scenarios, realistic data
5. **terminal-manager.test.ts** - Comprehensive coverage, good organization

### 🚨 Tests to Refactor (Technical Debt)

1. **session-context.test.ts** - Replace real timers with fake timers
2. **status-bar.test.ts** - Stop testing private state, add public API
3. **extension-commands.test.ts** - Remove array index dependencies
4. **debounce-behavior.test.ts** - Add cleanup for event listeners
5. **config-refresh.test.ts** - Make mocks strict (reject unexpected keys)

---

**End of Audit**  
_Generated by Meeseeks on 2026-01-15_  
_All tests passing ✅ | 47.3% coverage | 15 quality issues identified_
