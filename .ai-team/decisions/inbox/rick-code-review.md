# Pre-Release Code Quality Review

**By:** Rick (Lead)
**Date:** 2026-02-16
**Scope:** Full codebase review — all source files in `src/`, `src/__tests__/`, `package.json`, config files
**Trigger:** Pre-release quality gate for Monday evening internal distribution

---

## Executive Summary

EditLess is well-structured for an MVP. The architecture is clean — modules are focused, dependency graph flows one direction (extension → managers → providers), types are shared through a single types.ts file, and test coverage is solid (200 tests passing across 11 test suites). Two areas need attention before go-live: **blocking calls in the activation path** and a **still-unfixed enum mismatch** from the previous audit. The rest is cleanup work that should happen this week.

---

## 🔴 MUST FIX Before Go-Live

### 1. `execSync` blocks extension activation path
**Issue:** [#107](https://github.com/cirvine-MSFT/editless/issues/107)
**File:** `src/cli-provider.ts:34`, called from `src/extension.ts:38`
**What:** `probeCliVersion()` uses `execSync` with a 5-second timeout, called for each of 3 CLI providers during `activate()`. Worst case: 15 seconds of blocking the extension host thread.
**Impact:** VS Code shows "Extension host unresponsive" dialog. All other extensions freeze.
**Fix:** Replace with async `execFile` + `promisify`. Run `probeAllProviders()` after activation returns (e.g., `setTimeout(probeAllProviders, 0)` or fire-and-forget promise).

### 2. Missing `custom` provider profile in KNOWN_PROFILES
**Issue:** [#109](https://github.com/cirvine-MSFT/editless/issues/109)
**File:** `src/cli-provider.ts:16-27`
**What:** `package.json` declares `"custom"` as a valid enum value for `editless.cli.provider`, but `KNOWN_PROFILES` has no `custom` entry. When user selects "custom", `resolveActiveProvider()` silently falls back to the first detected provider.
**Impact:** Confusing UX — user explicitly sets a preference and it's ignored.
**Fix:** Add `{ name: 'custom', command: '', versionCommand: '' }` to KNOWN_PROFILES. This was flagged in the previous audit (#87) but never fixed.

### 3. `activate()` doesn't return API for integration tests
**Issue:** [#110](https://github.com/cirvine-MSFT/editless/issues/110)
**File:** `src/extension.ts:32`
**What:** `activate()` returns `void` but decisions.md requires it to return `{ terminalManager, context }`. Integration tests depend on this.
**Fix:** Return the API object. Non-breaking — the export is additive.

---

## 🟡 SHOULD FIX

### 4. Vitest picks up compiled integration test JS files
**Issue:** [#112](https://github.com/cirvine-MSFT/editless/issues/112)
**File:** `vitest.config.ts:7`
**What:** `out/integration/*.test.js` compiled files are picked up by vitest, causing 2 false failures ("Cannot find module 'vscode'"). Config excludes `src/__integration__/**` but not `out/**`.
**Fix:** Add `'out/**'` to vitest exclude array.

### 5. Private field access via bracket notation
**Issue:** [#114](https://github.com/cirvine-MSFT/editless/issues/114)
**File:** `src/editless-tree.ts:262`
**What:** `this.terminalManager['_lastActivityAt'].get(terminal)` bypasses TypeScript private visibility. Fragile to refactoring.
**Fix:** Add `getLastActivityAt(terminal)` public getter to `TerminalManager`.

### 6. Event listener leaks in EditlessTreeProvider
**Issue:** [#116](https://github.com/cirvine-MSFT/editless/issues/116)
**File:** `src/editless-tree.ts:83-88`
**What:** Subscriptions to `terminalManager.onDidChange` and `labelManager.onDidChange` are created but never tracked or disposed. Class doesn't implement `Disposable`.
**Fix:** Implement `Disposable`, track subscriptions, push to `context.subscriptions`.

### 7. Dead prototype types in types.ts
**Issue:** [#117](https://github.com/cirvine-MSFT/editless/issues/117)
**File:** `src/types.ts:177-205`
**What:** `DashboardState`, `WebSocketMessage`, `LaunchRequest`, `TerminalSession` — never imported anywhere. Leftover from prototype webview/websocket architecture.
**Fix:** Remove.

### 8. Unused `promptRenameSession` export
**Issue:** [#119](https://github.com/cirvine-MSFT/editless/issues/119)
**File:** `src/session-labels.ts:54-69`
**What:** Exported but never imported. Rename logic was inlined in `extension.ts`.
**Fix:** Remove the dead function.

---

## 🟢 NICE TO HAVE

### 9. Synchronous fs calls in registry.ts
**File:** `src/registry.ts:13,44,59`
`loadSquads()` uses `readFileSync`. Acceptable for a local JSON file, but async reads would be better practice for extension host health.

### 10. Extension.ts is 780 lines
The `activate()` function is very long. Command registration could be extracted to a `commands.ts` module for readability.

### 11. Model choices hardcoded
**File:** `src/extension.ts:201-218`
The model choices list is hardcoded inline. Could be extracted to a constant or eventually a configuration setting.

### 12. `any` types in test mock files
**File:** `src/__tests__/mocks/vscode.ts` (throughout), `src/__tests__/session-context.test.ts:162`
Test infrastructure uses `any` extensively. Low risk since it's test-only code, but could mask type regressions.

### 13. Unsafe cast in resolveTerminal
**File:** `src/extension.ts:315`
`return arg as vscode.Terminal | undefined` — if `arg` is neither `EditlessTreeItem` nor `Terminal`, this silently passes through. Add a type guard.

---

## Security / Sensitive Content Scan ✅

| Check | Result |
|-------|--------|
| "openai" in source | ✅ Clean — not found |
| "coeus" in source | ✅ Clean — not found |
| Microsoft-internal references | ✅ Clean — no .internal, .corp, or microsoft.com URLs |
| Hardcoded URLs | ✅ Only `https://nodejs.org/` (public, appropriate) |
| Hardcoded tokens/keys | ✅ Clean — none found |
| Test fixture names | ✅ Generic names only |

---

## Architecture Assessment ✅

| Aspect | Assessment |
|--------|------------|
| Module focus | ✅ Each module handles one concern |
| Circular dependencies | ✅ None detected |
| Dependency direction | ✅ extension → managers → providers → types |
| TypeScript strict mode | ✅ Enabled (`strict: true`) |
| Disposable management | ⚠️ TreeProvider has leaks (see #116) |
| Package.json wiring | ✅ All commands, menus, keybindings correct |
| activationEvents | ✅ `onStartupFinished` — correct for this extension |
| Deprecated API usage | ✅ Only `checkAgencyOnStartup` (internal, properly marked) |
| Test coverage | ✅ 200 tests, 11 suites, all critical paths covered |

---

## Verdict

**Conditional go-live.** Fix the 3 🔴 items and this ships clean. The `execSync` blocker is the most important — it's the only one that can cause a user-visible hang. The custom provider and activate API fixes are 5-minute patches.
