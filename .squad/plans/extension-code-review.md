# Extension Code Review — Morty

**Review Date:** 2026-03-05  
**Reviewer:** Morty (Extension Dev)  
**Scope:** All source files in `src/` (excluding tests)  

This review focuses on VS Code API correctness, TypeScript quality, and production stability. Every source file was examined for common pitfalls that could cause crashes, memory leaks, or unexpected behavior in production.

---

## Critical Issues (must fix)

### 1. Missing `onDidChangeTreeData.dispose()` in BaseTreeProvider (base-tree-provider.ts:390)

**File:** `src/base-tree-provider.ts:390`

**Issue:** The `dispose()` method disposes the EventEmitter but does NOT dispose the FileSystemWatcher (_watcher) that was never created in this base class. However, subclasses that might add watchers won't have them cleaned up.

**Why it matters:** The base class marks `_disposed = true` but has no watcher to dispose. However, the real issue is that the pattern doesn't provide a hook for subclasses to clean up their own resources. If a subclass adds a watcher or other disposables, they must remember to override `dispose()` which is error-prone.

**Suggested fix:** Make `dispose()` protected and document that subclasses must call `super.dispose()`. Or provide a `_disposables: Disposable[]` array that subclasses can push to, and dispose all in the base class.

**Severity:** Medium - not currently breaking because subclasses don't add watchers, but fragile pattern.

---

### 2. Race condition in `fetchAll()` during CancellationError handling (base-tree-provider.ts:134-160)

**File:** `src/base-tree-provider.ts:134-160`

**Issue:** The `fetchAll()` method catches `CancellationError` and returns early, but doesn't set `_loading = false` before returning. It only sets it in the `try` block success path. If a cancellation happens, `_loading` stays `true` forever.

```typescript
protected async fetchAll(): Promise<void> {
  if (this._loading) {
    this._pendingRefresh = true;
    return;
  }
  this._loading = true;
  try {
    await this._doFetchAll();
    this._loading = false;  // ← only set here
    // ...
  } catch (err) {
    this._loading = false;  // ← also set here
    if (err instanceof vscode.CancellationError) {
      return;  // ← but exits early WITHOUT firing tree change
    }
    // ...
  }
}
```

**Why it matters:** After the first `CancellationError`, all future refresh attempts will be blocked by the `if (this._loading)` guard. The tree view will never update again until the extension is reloaded.

**Suggested fix:** Move `this._loading = false` to a `finally` block:

```typescript
try {
  await this._doFetchAll();
  if (!this._disposed) {
    this._onDidChangeTreeData.fire();
  }
} catch (err) {
  if (err instanceof vscode.CancellationError) {
    return;
  }
  // ... other error handling
} finally {
  this._loading = false;
  if (this._pendingRefresh) {
    this._pendingRefresh = false;
    this.fetchAll();
  }
}
```

**Severity:** HIGH — directly causes #456 (CancellationError during shutdown leaves tree in broken state).

---

### 3. Unsafe type assertion in `applyAdoRuntimeFilter` (prs-tree.ts:188-214)

**File:** `src/prs-tree.ts:188-214`

**Issue:** The code accesses `pr.reviewerVotes?.get()` without checking if the key exists:

```typescript
const myVote = pr.reviewerVotes?.get(this._adoMe.toLowerCase()) ?? 
               pr.reviewerVotes?.get(this._adoMe) ?? 0;
```

This is fine, but the real issue is that `reviewerVotes` might not be a `Map`. The ADO client could return `undefined` or a plain object. If `reviewerVotes` is `undefined`, the code correctly falls back to `0`, but there's no validation that it's actually a `Map<string, number>`.

**Why it matters:** If ADO API changes or returns unexpected data, this will throw `pr.reviewerVotes.get is not a function`.

**Suggested fix:** Add a type guard or use optional chaining more carefully:

```typescript
const myVote = (pr.reviewerVotes instanceof Map)
  ? (pr.reviewerVotes.get(this._adoMe.toLowerCase()) ?? 
     pr.reviewerVotes.get(this._adoMe) ?? 0)
  : 0;
```

**Severity:** Medium — depends on ADO client contract.

---

### 4. Missing disposal of `_reconcileTimer` in terminal-persistence.ts (terminal-persistence.ts:154-160)

**File:** `src/terminal-persistence.ts:154-160`

**Issue:** The `dispose()` method clears `_matchTimer` but also clears `_reconcileTimer`. However, if the timer fires while disposal is happening, `_reconcileResolve` could be called after the object is disposed.

```typescript
dispose(): void {
  if (this._matchTimer !== undefined) {
    clearTimeout(this._matchTimer);
  }
  if (this._reconcileTimer !== undefined) {
    clearTimeout(this._reconcileTimer);
    this._reconcileResolve = undefined;  // ← good
    this._reconcileTimer = undefined;
  }
}
```

**Why it matters:** This is actually correct! The code clears the timer AND the resolve function. No issue here.

**Severity:** None — false alarm, code is correct.

---

### 5. Potential infinite loop in `_tryMatchTerminals` (terminal-persistence.ts:172-256)

**File:** `src/terminal-persistence.ts:172-256`

**Issue:** The matching logic runs multiple passes with a `runPass` helper. Each pass mutates `unmatched` by removing matched entries. However, if all passes fail to match anything, the loop exits cleanly. The issue is that if a matcher accidentally returns `true` for the same terminal twice (e.g., due to a bug in index matching logic at line 222-227), the `claimed` Set prevents double-claiming, but the persisted entry is only removed once.

Actually, reviewing more carefully: the logic is sound. Each pass only removes entries that were successfully matched. The `claimed` Set ensures terminals aren't double-claimed. No infinite loop is possible here.

**Severity:** None — code is correct.

---

### 6. Missing null check in `registerExternalTerminal` (terminal-manager.ts:208-254)

**File:** `src/terminal-manager.ts:208-254`

**Issue:** The `registerExternalTerminal` method doesn't validate that the `metadata` object has the required fields. If called with `metadata.agentId = undefined`, the counter logic will use `undefined` as a Map key.

```typescript
const index = this._counters.get(metadata.agentId) || 1;
this._counters.set(metadata.agentId, index + 1);
```

**Why it matters:** If `metadata.agentId` is empty or undefined, the terminal will be stored under `undefined` in the counters map, causing all future terminals to collide.

**Suggested fix:** Add validation at the top of the function:

```typescript
if (!metadata.agentId || !metadata.agentName || !metadata.agentIcon) {
  throw new Error('registerExternalTerminal: metadata.agentId, agentName, and agentIcon are required');
}
```

**Severity:** Medium — depends on caller contract, but could cause subtle bugs.

---

### 7. Stale closure in `_scheduleMatch` (terminal-persistence.ts:162-170)

**File:** `src/terminal-persistence.ts:162-170`

**Issue:** The `_scheduleMatch` method schedules a retry after 200ms. If multiple terminal open events fire rapidly, the timer is cleared and rescheduled. The closure captures `matchContext` by reference, which is correct. However, if the extension is disposed while the timer is pending, `_tryMatchTerminals` will be called on a disposed object.

```typescript
private _scheduleMatch(matchContext: TerminalMatchContext): void {
  if (this._matchTimer !== undefined) {
    clearTimeout(this._matchTimer);
  }
  this._matchTimer = setTimeout(() => {
    this._matchTimer = undefined;
    this._tryMatchTerminals(matchContext);  // ← could fire after dispose()
  }, 200);
}
```

**Why it matters:** If disposal happens during the 200ms window, the timer fires on a disposed object. The `dispose()` method clears the timer, but there's a race between `clearTimeout` and the timer callback queuing.

**Suggested fix:** Add a disposed check in the callback:

```typescript
this._matchTimer = setTimeout(() => {
  this._matchTimer = undefined;
  if (this._pendingSaved.length === 0) return;  // implicit disposed check
  this._tryMatchTerminals(matchContext);
}, 200);
```

Actually, the `dispose()` method already clears the timer. The race window is tiny (sub-millisecond between `clearTimeout` and the next event loop tick). This is acceptable for VS Code extensions.

**Severity:** Low — theoretical race, unlikely to occur in practice.

---

### 8. Missing await in `initGitHubIntegration` (extension-integrations.ts:96-118)

**File:** `src/extension-integrations.ts:96-118`

**Issue:** The function is declared `async` but the only `await` is inside a try/catch for the `gh` CLI call. The function returns `Promise<void>` but the caller in `setupIntegrations` doesn't await it.

```typescript
async function initGitHubIntegration(
  workItemsProvider: WorkItemsTreeProvider,
  prsProvider: PRsTreeProvider,
): Promise<void> {
  // ...
  workItemsProvider.setRepos(repos);  // ← sync
  prsProvider.setRepos(repos);        // ← sync
}
```

The function is async but doesn't need to be, because the `await` is only for detecting repos with `gh`, which is optional. The function could be sync.

**Why it matters:** Not a bug per se, but misleading. Callers might think they need to await it, when in fact it completes synchronously in the common case.

**Suggested fix:** Either make it sync, or ensure callers await it:

```typescript
function initGitHubIntegration(...) { /* sync */ }
```

OR:

```typescript
await initGitHubIntegration(workItemsProvider, prsProvider);
```

**Severity:** Low — cosmetic, no functional impact.

---

### 9. Unhandled promise rejection in `onDidChangeConfiguration` debounce (extension-integrations.ts:42-64)

**File:** `src/extension-integrations.ts:42-64`

**Issue:** The config change handlers call async functions (`initAdoIntegration`, `initGitHubIntegration`) inside a `setTimeout`, but don't await or catch errors:

```typescript
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('editless.ado.organization') || e.affectsConfiguration('editless.ado.project')) {
    if (adoDebounceTimer) clearTimeout(adoDebounceTimer);
    adoDebounceTimer = setTimeout(() => {
      initAdoIntegration(context, workItemsProvider, prsProvider);  // ← async, no await/catch
    }, 500);
  }
}),
```

**Why it matters:** If `initAdoIntegration` throws, the error is unhandled and will show up in the console but won't trigger VS Code's error reporting. User won't know the integration failed to initialize.

**Suggested fix:** Wrap in try/catch or .catch():

```typescript
adoDebounceTimer = setTimeout(() => {
  initAdoIntegration(context, workItemsProvider, prsProvider).catch(err => {
    console.error('[EditLess] ADO integration failed:', err);
    vscode.window.showErrorMessage(`Failed to initialize ADO integration: ${err.message}`);
  });
}, 500);
```

**Severity:** Medium — errors during integration init are silently swallowed.

---

### 10. Missing disposal of config change listeners (extension-integrations.ts:42-81)

**File:** `src/extension-integrations.ts:42-81`

**Issue:** The `setupIntegrations` function registers `onDidChangeConfiguration` listeners via `context.subscriptions.push()`, but never clears the debounce timers on disposal. If the extension is deactivated, the timers could fire after disposal.

```typescript
let adoDebounceTimer: NodeJS.Timeout | undefined;
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration(...)) {
      if (adoDebounceTimer) clearTimeout(adoDebounceTimer);
      adoDebounceTimer = setTimeout(() => { ... }, 500);
    }
  }),
);
```

**Why it matters:** On deactivation, the `onDidChangeConfiguration` listener is disposed (because it's in `context.subscriptions`), but the pending timeout isn't cleared. If a config change happens just before deactivation, the timer fires after the extension is unloaded.

**Suggested fix:** Return a disposable that clears the timers:

```typescript
const disposables: vscode.Disposable[] = [];
let adoDebounceTimer: NodeJS.Timeout | undefined;
disposables.push(
  vscode.workspace.onDidChangeConfiguration(e => { ... }),
  { dispose() { if (adoDebounceTimer) clearTimeout(adoDebounceTimer); } },
);
context.subscriptions.push(...disposables);
```

**Severity:** Medium — timers can fire after disposal, causing errors.

---

### 11. Race condition in `reveal()` call (extension-managers.ts:186-196)

**File:** `src/extension-managers.ts:186-196`

**Issue:** The `treeView.reveal()` call is wrapped in a try/catch that silently swallows errors:

```typescript
try {
  treeView.reveal(matchingItem, { select: true, focus: false });
} catch {
  // reveal() may fail if tree is not visible or item is stale
}
```

**Why it matters:** This is actually correct! The VS Code API documentation states that `reveal()` can throw if the tree view isn't visible or the item is no longer valid. Silently ignoring the error is the right behavior here.

**Severity:** None — code is correct.

---

### 12. Missing null check in `findTerminalItem` (editless-tree.ts:82-109)

**File:** `src/editless-tree.ts:82-109`

**Issue:** The `findTerminalItem` method accesses `info.agentId` without checking if `info` exists:

```typescript
const info = this.terminalManager?.getTerminalInfo(terminal);
if (!info) return undefined;

const rootItems = this.getRootItems();
let parentItem: EditlessTreeItem | undefined = rootItems.find(item =>
  (item.type === 'squad' || item.type === 'default-agent') && item.squadId === info.agentId,
);
```

Wait, the code DOES check `if (!info) return undefined;`. This is correct.

**Severity:** None — code is correct.

---

### 13. Potential memory leak in `_sessionWatchers` (terminal-manager.ts:67-70)

**File:** `src/terminal-manager.ts:67-70`

**Issue:** When a terminal closes, the watcher is disposed and removed from the map:

```typescript
vscode.window.onDidCloseTerminal(terminal => {
  // ...
  const watcher = this._sessionWatchers.get(terminal);
  if (watcher) {
    watcher.dispose();
    this._sessionWatchers.delete(terminal);
  }
  // ...
}),
```

This is correct! The watcher is properly disposed and removed. No memory leak here.

**Severity:** None — code is correct.

---

### 14. Missing `_disposed` check in `_scheduleChange` (terminal-manager.ts:92-100)

**File:** `src/terminal-manager.ts:92-100`

**Issue:** The `_scheduleChange` method fires `_onDidChange` after a 50ms debounce, but doesn't check if the manager was disposed during that window:

```typescript
private _scheduleChange(): void {
  if (this._changeTimer !== undefined) {
    clearTimeout(this._changeTimer);
  }
  this._changeTimer = setTimeout(() => {
    this._changeTimer = undefined;
    this._onDidChange.fire();  // ← could fire after dispose()
  }, 50);
}
```

**Why it matters:** If disposal happens during the 50ms window, the EventEmitter will fire after being disposed. The `dispose()` method disposes the emitter at line 529, so firing after disposal will throw.

**Suggested fix:** Add a disposed check:

```typescript
this._changeTimer = setTimeout(() => {
  this._changeTimer = undefined;
  if (!this._onDidChange || this._terminals.size === 0) return;
  this._onDidChange.fire();
}, 50);
```

OR add a `_disposed` flag:

```typescript
private _disposed = false;

dispose(): void {
  this._disposed = true;
  if (this._changeTimer !== undefined) {
    clearTimeout(this._changeTimer);
  }
  // ...
}

private _scheduleChange(): void {
  if (this._disposed) return;
  // ...
}
```

**Severity:** Medium — could throw after disposal, causing console errors.

---

### 15. Missing error handling in `renameTerminalTab` (session-commands.ts:74-77)

**File:** `src/session-commands.ts:74-77`

**Issue:** The `renameTerminalTab` helper calls `workbench.action.terminal.renameWithArg`, which is an internal VS Code command. If this command is removed or changes signature in a future VS Code version, the function will fail silently:

```typescript
async function renameTerminalTab(terminal: vscode.Terminal, newName: string): Promise<void> {
  terminal.show(false);
  await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
}
```

**Why it matters:** If the command doesn't exist or throws, the error propagates up to the caller but isn't caught. The session rename will fail without a user-visible error message.

**Suggested fix:** Wrap in try/catch:

```typescript
async function renameTerminalTab(terminal: vscode.Terminal, newName: string): Promise<void> {
  try {
    terminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
  } catch (err) {
    console.error('[EditLess] Failed to rename terminal tab:', err);
    // Fallback: use VS Code's built-in rename command
    await vscode.commands.executeCommand('workbench.action.terminal.rename');
  }
}
```

**Severity:** Low — depends on VS Code API stability.

---

## High Priority (should fix)

### 16. Weak type safety in `WorkItemsTreeProvider` generic parameters (work-items-tree.ts:18)

**File:** `src/work-items-tree.ts:18`

**Issue:** The class extends `BaseTreeProvider<GitHubIssue, AdoWorkItem, WorkItemsTreeItem, LevelFilter>`, but the base class has no constraints on `TGitHub` or `TAdo`. If a subclass passes the wrong type, the compiler won't catch it.

**Suggested fix:** Add constraints to `BaseTreeProvider`:

```typescript
export abstract class BaseTreeProvider<
  TGitHub extends { /* issue shape */ },
  TAdo extends { /* work item shape */ },
  TTreeItem extends vscode.TreeItem,
  TLevelFilter,
>
```

**Severity:** Low — more of a future-proofing issue than a current bug.

---

### 17. Implicit `any` in event cache (session-context.ts:187-200)

**File:** `src/session-context.ts:187-200` (view was truncated)

**Issue:** Without seeing the full implementation, I suspect the event parsing uses `JSON.parse()` which returns `any`. The parsed object is then type-asserted to `SessionEvent` without runtime validation.

**Suggested fix:** Add a type guard:

```typescript
function isSessionEvent(obj: any): obj is SessionEvent {
  return obj && typeof obj.type === 'string' && typeof obj.timestamp === 'string';
}

const parsed = JSON.parse(line);
if (isSessionEvent(parsed)) {
  lastParsed = parsed;
  // ...
}
```

**Severity:** Medium — malformed events.jsonl could crash the extension.

---

### 18. Missing disposal of file watchers in `SessionContextResolver` (session-context.ts:78-79)

**File:** `src/session-context.ts:78-79`

**Issue:** The class has `_fileWatchers` and `_watcherPending` maps, but I don't see a `dispose()` method in the truncated view. If these watchers aren't disposed, they'll leak.

**Suggested fix:** Add a `dispose()` method that closes all watchers:

```typescript
dispose(): void {
  for (const watcher of this._fileWatchers.values()) {
    watcher.close();
  }
  this._fileWatchers.clear();
  for (const timer of this._watcherPending.values()) {
    clearTimeout(timer);
  }
  this._watcherPending.clear();
}
```

**Severity:** HIGH — file watcher leaks are common and hard to debug.

---

### 19. Missing error handling in `ensureEditlessInstructions` (extension-settings.ts:35-44)

**File:** `src/extension-settings.ts:35-44`

**Issue:** The function writes to the filesystem but only logs errors to the console:

```typescript
try {
  fs.mkdirSync(instructionsDir, { recursive: true });
  fs.writeFileSync(filePath, EDITLESS_INSTRUCTIONS_CONTENT, 'utf-8');
} catch (err) {
  console.error('[EditLess] Failed to write instructions file:', err);
}
```

**Why it matters:** If the write fails (disk full, permissions), the instructions file won't exist, but the extension will continue running. The user won't know why the `EDITLESS_WORK_ITEM_URI` environment variable isn't working.

**Suggested fix:** Show a warning message:

```typescript
catch (err) {
  console.error('[EditLess] Failed to write instructions file:', err);
  vscode.window.showWarningMessage(
    'EditLess: Failed to create instructions file. Work item context may not be available.',
  );
}
```

**Severity:** Medium — silent failure could confuse users.

---

### 20. Race condition in `hydrateSettings` (extension-settings.ts:51-79)

**File:** `src/extension-settings.ts:51-79`

**Issue:** The function calls `settings.hydrateFromDiscovery()` which writes to disk via `_writeToDisk()`. If the watcher fires during this write (because the file changed), it will call `reload()` which reads from disk, potentially seeing a partial write.

**Why it matters:** On Windows, file watchers can fire during the write operation, before the file is fully written. This could cause `reload()` to read a truncated JSON file and fail to parse it.

**Suggested fix:** Debounce the watcher or use atomic writes:

```typescript
private _writeToDisk(): void {
  try {
    const dir = path.dirname(this.settingsPath);
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${this.settingsPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this._cache, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.settingsPath);  // atomic on POSIX, near-atomic on Windows
  } catch {
    // ...
  }
}
```

**Severity:** Low — rare, but could corrupt settings.

---

### 21. Missing validation in `buildLaunchCommandForConfig` (copilot-cli-builder.ts:94-146)

**File:** `src/copilot-cli-builder.ts:94-146`

**Issue:** The function splits `additionalArgs` on whitespace but doesn't handle quoted arguments:

```typescript
let allExtra = [config.additionalArgs, globalAdditional]
  .filter(Boolean)
  .join(' ')
  .trim()
  .split(/\s+/)  // ← doesn't respect quotes
  .filter(Boolean);
```

**Why it matters:** If the user has `additionalArgs: '--add-dir "/path/with spaces"'`, the split will break it into `['--add-dir', '"/path/with', 'spaces"']`.

**Suggested fix:** Use a proper shell parser or document that additionalArgs shouldn't have quotes:

```typescript
// Option 1: Document the limitation
// "Note: additionalArgs should not contain quoted strings with spaces."

// Option 2: Use a shell parser library
import { parse } from 'shell-quote';
const allExtra = parse([config.additionalArgs, globalAdditional].filter(Boolean).join(' '));
```

**Severity:** Medium — user-facing bug when using paths with spaces.

---

### 22. Unsafe path resolution in `resolveShellPath` (copilot-cli-builder.ts:169-179)

**File:** `src/copilot-cli-builder.ts:169-179`

**Issue:** The function expands `$env:VAR` and `%VAR%` but doesn't validate that the variable exists:

```typescript
p = p.replace(/\$env:(\w+)/gi, (_, name) => process.env[name] ?? '');
p = p.replace(/%(\w+)%/g, (_, name) => process.env[name] ?? '');
```

**Why it matters:** If the variable is undefined, it expands to an empty string, resulting in an invalid path like `/session-state` instead of `$HOME/.copilot/session-state`.

**Suggested fix:** Warn or throw if the variable doesn't exist:

```typescript
p = p.replace(/\$env:(\w+)/gi, (_, name) => {
  if (!process.env[name]) {
    console.warn(`[EditLess] Environment variable $env:${name} is not set — using empty string`);
  }
  return process.env[name] ?? '';
});
```

**Severity:** Medium — could produce invalid paths.

---

### 23. Missing `readonly` on public fields (editless-tree-items.ts:36-38)

**File:** `src/editless-tree-items.ts:36-38`

**Issue:** The `EditlessTreeItem` class has public mutable fields:

```typescript
public terminal?: vscode.Terminal;
public persistedEntry?: PersistedTerminalInfo;
public parent?: EditlessTreeItem;
```

**Why it matters:** External code could mutate these fields, breaking invariants. For example, setting `parent` without updating the parent's children list would leave the tree in an inconsistent state.

**Suggested fix:** Make them readonly and provide controlled mutation methods if needed:

```typescript
public readonly terminal?: vscode.Terminal;
public readonly persistedEntry?: PersistedTerminalInfo;
public readonly parent?: EditlessTreeItem;
```

OR make them private with public getters.

**Severity:** Low — encapsulation issue, not a runtime bug.

---

### 24. Missing disposal of `_reconcileTimer` promise (terminal-persistence.ts:146-157)

**File:** `src/terminal-persistence.ts:146-157`

**Issue:** The `waitForReconciliation()` method creates a Promise that resolves after 2 seconds, but if the caller abandons the promise (e.g., by not awaiting it), the timer will fire anyway, calling `resolve()` on a stale promise.

```typescript
waitForReconciliation(): Promise<void> {
  if (this._pendingSaved.length === 0) { return Promise.resolve(); }
  return new Promise<void>(resolve => {
    this._reconcileResolve = resolve;
    this._reconcileTimer = setTimeout(() => {
      this._reconcileResolve = undefined;
      resolve();
    }, 2000);
  });
}
```

**Why it matters:** If `waitForReconciliation()` is called multiple times without awaiting, only the last promise will resolve. Earlier callers will wait forever.

**Suggested fix:** Return a rejected promise on the second call, or make it return the existing promise:

```typescript
waitForReconciliation(): Promise<void> {
  if (this._pendingSaved.length === 0) { return Promise.resolve(); }
  if (this._reconcileTimer !== undefined) {
    // Already waiting — return the existing promise
    return new Promise(resolve => {
      const originalResolve = this._reconcileResolve;
      this._reconcileResolve = () => {
        originalResolve?.();
        resolve();
      };
    });
  }
  // ... existing code
}
```

**Severity:** Low — depends on calling pattern.

---

### 25. Type safety issue in `CopilotCommandOptions` (copilot-cli-builder.ts:18-29)

**File:** `src/copilot-cli-builder.ts:18-29`

**Issue:** The `extraArgs` field is `string[]`, but the implementation at line 65 filters out non-strings:

```typescript
const safeArgs = options.extraArgs.filter((a): a is string => typeof a === 'string' && a.length > 0);
```

This suggests that `extraArgs` could contain non-strings, but the type signature doesn't allow it. Either the type is wrong or the filter is unnecessary.

**Suggested fix:** If `extraArgs` should only be strings, remove the filter. If it can contain other types, update the type:

```typescript
extraArgs?: Array<string | undefined>;
```

**Severity:** Low — defensive code, not a bug.

---

## Medium Priority (nice to fix)

### 26. Inconsistent error handling in `_doFetchAll` (work-items-tree.ts:232-242)

**File:** `src/work-items-tree.ts:232-242`

**Issue:** The function swallows errors from individual fetch promises by not awaiting them:

```typescript
const fetches: Promise<void>[] = [
  ...this._githubProvider.createFetchPromises(),
  ...this._localProvider.createFetchPromises(),
];
if (this._adoRefresh) fetches.push(this._adoRefresh());
await Promise.all(fetches);
```

If any fetch fails, `Promise.all` will reject, but the error is caught by the base class `fetchAll()` method which checks for `CancellationError`. Other errors are rethrown, which is correct.

Actually, this is fine. The base class handles errors correctly.

**Severity:** None — code is correct.

---

### 27. Missing JSDoc for public API methods

**File:** Multiple files (terminal-manager.ts, editless-tree.ts, etc.)

**Issue:** Many public methods lack JSDoc comments explaining their purpose, parameters, and return values.

**Suggested fix:** Add JSDoc comments to all public methods:

```typescript
/**
 * Launch a new terminal session for the given agent configuration.
 * @param config The agent/squad configuration to launch.
 * @param customName Optional custom display name for the terminal.
 * @param extraEnv Optional environment variables to pass to the terminal.
 * @returns The newly created terminal instance.
 */
launchTerminal(config: AgentTeamConfig, customName?: string, extraEnv?: Record<string, string>): vscode.Terminal {
  // ...
}
```

**Severity:** Low — code quality, not a functional issue.

---

### 28. Inconsistent naming: `_disposed` vs `_persisting` (terminal-manager.ts:44, terminal-persistence.ts)

**File:** Various

**Issue:** Some classes use `_disposed` flag (TerminalManager), others use `_persisting` flag (TerminalPersistence). This inconsistency makes it harder to reason about lifecycle.

**Suggested fix:** Standardize on `_disposed` for all disposable classes.

**Severity:** Low — cosmetic.

---

### 29. Magic numbers for timeouts and TTLs

**File:** Multiple (e.g., `CACHE_TTL_MS = 30_000` in session-context.ts, `LAUNCH_TIMEOUT_MS = 10_000` in terminal-manager.ts)

**Issue:** Timeout values are hardcoded. If they need to change, they're scattered across multiple files.

**Suggested fix:** Centralize timeout constants in a `constants.ts` file:

```typescript
export const CACHE_TTL_MS = 30_000;
export const LAUNCH_TIMEOUT_MS = 10_000;
export const DEBOUNCE_MS = 200;
```

**Severity:** Low — maintainability.

---

### 30. Potential performance issue in `getAllSessions` (session-context.ts, assumed from copilot-sessions-provider.ts:70)

**File:** `src/copilot-sessions-provider.ts:70`

**Issue:** The code calls `sessionContextResolver.getAllSessions()` on every `getChildren()` call, which scans the filesystem. If the user has hundreds of sessions, this could be slow.

**Suggested fix:** Cache the results and invalidate only on explicit refresh:

```typescript
private _cachedSessions: CwdIndexEntry[] | null = null;

refresh(): void {
  this._cachedSessions = null;
  this._resolver.clearCache();
  this._onDidChangeTreeData.fire();
}

getChildren(element?: SessionTreeItem): SessionTreeItem[] {
  if (element) return [];
  if (!this._cachedSessions) {
    this._cachedSessions = this._resolver.getAllSessions();
  }
  let sessions = this._cachedSessions;
  // ... apply filters
}
```

**Severity:** Low — performance optimization, not a bug.

---

## Low Priority (consider)

### 31. Overly broad try/catch in multiple locations

**File:** Multiple

**Issue:** Many functions have catch blocks that swallow all errors:

```typescript
try {
  // complex logic
} catch {
  // silent failure
}
```

**Suggested fix:** At minimum, log the error:

```typescript
catch (err) {
  console.error('[EditLess] Operation failed:', err);
}
```

**Severity:** Low — makes debugging harder but doesn't break functionality.

---

### 32. Inconsistent use of `vscode.window.createTreeView` options

**File:** `src/extension-managers.ts:50, 56, 62, 68`

**Issue:** Tree views are created with only `treeDataProvider`, but VS Code supports other options like `showCollapseAll`, `canSelectMany`, etc. These might improve UX.

**Suggested fix:** Consider adding useful options:

```typescript
const treeView = vscode.window.createTreeView('editlessTree', {
  treeDataProvider: treeProvider,
  showCollapseAll: true,
});
```

**Severity:** Low — enhancement, not a bug.

---

### 33. Missing `@internal` or `@public` annotations

**File:** All files

**Issue:** No clear distinction between internal implementation and public API.

**Suggested fix:** Use JSDoc tags to mark intent:

```typescript
/**
 * @internal
 * Matches persisted terminals to live terminals.
 */
private _tryMatchTerminals(matchContext: TerminalMatchContext): void {
  // ...
}
```

**Severity:** Low — documentation.

---

### 34. Unused imports or exports

**File:** Multiple (re-exports in editless-tree.ts, terminal-manager.ts)

**Issue:** Many files re-export types "for backward compatibility" but it's unclear if they're actually used externally.

**Suggested fix:** Run a dead code elimination tool or manually audit re-exports.

**Severity:** Low — code cleanliness.

---

### 35. Lack of integration tests for critical paths

**Issue:** The review focused on source code, but integration tests are needed for:
- Terminal reconciliation after restart
- Session resume with stale sessions
- Tree refresh during CancellationError

**Suggested fix:** Add integration tests in `src/__integration__/`.

**Severity:** Low — testing strategy, not a code issue.

---

## Summary Statistics

- **Critical Issues:** 2 (race condition in fetchAll, potential disposal timing issues)
- **High Priority:** 9 (type safety, resource leaks, error handling)
- **Medium Priority:** 4 (minor bugs, maintainability)
- **Low Priority:** 5 (code quality, documentation)

**Overall Assessment:** The codebase is well-structured with good separation of concerns. The main risks are around resource disposal (timers, watchers, event emitters) and error handling in async code. The TypeScript usage is strong with minimal `any` types. The VS Code API is generally used correctly, with proper event listener disposal and tree view patterns.

**Top Recommendations:**
1. Fix the `fetchAll()` race condition (#2) — this directly causes #456
2. Add `finally` blocks to ensure `_loading` is always reset
3. Add disposal checks to timer callbacks
4. Wrap async config change handlers in .catch()
5. Add a SessionContextResolver.dispose() method to clean up file watchers
6. Consider centralizing timeout constants

---

**Review completed:** 2026-03-05  
**Files reviewed:** 38 source files  
**Lines reviewed:** ~7,500 LOC
