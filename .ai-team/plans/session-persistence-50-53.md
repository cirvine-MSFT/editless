# Plan: Session Persistence & State Detection (#50, #53)

> Linked issues: [#53](https://github.com/cirvine-MSFT/editless/issues/53) (persistence testing), [#50](https://github.com/cirvine-MSFT/editless/issues/50) (state detection UX)

## Problem

Two related issues in the `area:session-persistence` cluster:

1. **#53**: We don't know if session persistence actually works across real VS Code lifecycle events (reload, close/reopen, crash). Unit tests cover reconciliation logic but not real scenarios.
2. **#50**: Users can't tell at a glance which sessions are active, idle, or need attention. The current tree view has basic time-based state but no rich detection.

These must be tackled in order: #53 establishes reliability, #50 builds UX on top.

## Current State (from code exploration)

### What exists
- **TerminalManager** persists `PersistedTerminalInfo` in `workspaceState` (`editless.terminalSessions`)
- **Reconciliation** matches saved entries to live terminals by `terminal.name`
- **Pending retry**: Unmatched entries stored in `_pendingSaved` for late-arriving terminals
- **Tree view** derives session state: `active` (<10min), `idle` (<60min), `stale` (>60min)
- **SquadStatus** at squad level: `active`, `idle`, `needs-attention` (from scanner.ts)
- **TerminalSession.activity** field: `idle`, `busy`, `running-command`, `copilot-session`, `waiting-for-input`, `orphan`
- **400 lines of unit tests** covering reconciliation, counter restoration, ghost entries

### Key constraint
**`onDidWriteTerminalData` is NOT stable** (deprecated, marketplace-blocked). We CANNOT read arbitrary terminal output. Available stable APIs:
- `onDidOpenTerminal` / `onDidCloseTerminal` — lifecycle events
- `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` — shell integration (VS Code 1.93+, stable)
- `Terminal.processId` — process alive check
- `Pseudoterminal` — full I/O control, but only for terminals we create ourselves

---

## Phase 1: #53 — Session Persistence Verification

### Deliverable
A verified test matrix with expected behaviors documented, plus any bugs found and fixed.

### Test Matrix

| Scenario | Expected Behavior | How to Verify |
|----------|------------------|---------------|
| Reload Window (`Developer: Reload Window`) | Sessions survive in tree. Terminals reconnect via name matching. | Manual + automated |
| Close VS Code → Reopen | Session metadata persists in workspaceState. Terminals are GONE (VS Code doesn't persist them by default). Tree shows sessions as "stale/orphaned" until user re-launches. | Manual |
| VS Code crash / force quit | Same as close/reopen — workspaceState survives (it's backed by SQLite). | Manual |
| Switch workspace → return | Sessions persist per-workspace (workspaceState is workspace-scoped). Returning restores them. | Manual |
| Multiple squads with sessions → reload | Each session retains correct squad association via `squadId` in persisted data. | Manual + unit test |

### Implementation Tasks

**Task 1a: Set up `@vscode/test-electron` infrastructure**
- Add `@vscode/test-electron` and `@vscode/test-cli` as dev dependencies
- Create `src/__integration__/` directory for integration tests (separate from unit tests in `src/__tests__/`)
- Add `npm run test:integration` script (separate from `npm run test` which stays vitest-only)
- Add GitHub Actions workflow step: run integration tests on `ubuntu-latest` with `xvfb-run` for headless display
- Write a "hello world" integration test that activates the extension and verifies the tree view registers
- This is reusable infrastructure — all future integration tests build on this

**Task 1b: Persistence integration tests**
- Test: create terminal → reload window → verify session survives in tree (name-match reconciliation)
- Test: create terminals for 2 squads → reload → verify correct squad association
- Test: verify `workspaceState` data shape after persist (schema stability)

**Task 1c: Unit tests for new logic (vitest)**
- Test: orphan cleanup — entry unmatched for >24h gets marked `orphaned`
- Test: `rebootCount` tracking — orphan survives 1st reboot, auto-cleaned on 2nd
- Test: defensive persist — `_persist()` called on dispose/deactivate
- Test: re-launch creates new terminal with correct squad association
- Test: dismiss removes orphan from persistence

**Task 1d: Code changes**
- Fix: orphan cleanup — add TTL to `_pendingSaved`. Track `rebootCount` per entry in persisted data
- Fix: defensive persist — ensure `_persist()` is called on `deactivate()` so close/crash doesn't lose in-flight state
- Add orphan UX — dimmed ghost sessions in tree with "re-launch" and "dismiss" (X) actions. Add "re-launch all" command. Auto-clean on second reboot.

### What the coding agent needs to know
- `workspaceState` survives reload and close/reopen (it's SQLite-backed by VS Code)
- VS Code does NOT re-create terminals on reopen unless `terminal.integrated.persistentSessionReviveProcess` is enabled — don't depend on it
- The `_pendingSaved` retry pattern is already there but needs a TTL bound
- Integration tests use `@vscode/test-electron` — run with `xvfb-run` on Linux CI
- Keep integration tests in `src/__integration__/` separate from vitest unit tests in `src/__tests__/`
- Integration test pipeline step should be a separate job in CI (slower, don't block unit tests)

---

## Phase 2: #50 — Session State Detection UX

### Deliverable
Clear visual indicators on each session in the tree view: 🟢 active, 🟡 idle, 🔴 needs attention.

### Detection Strategy (working within API constraints)

| Signal | Source | Maps To |
|--------|--------|---------|
| Terminal process alive | `Terminal.processId` (poll) | active or idle |
| Shell command running | `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` | active (during), idle (after) |
| Terminal recently opened | `onDidOpenTerminal` timestamp | active |
| Terminal closed | `onDidCloseTerminal` | remove / mark closed |
| No matching terminal | Persistence without live terminal | stale/orphaned |
| Squad inbox has items | Scanner inbox count for this squad | needs-attention |

**NOT available** (can't use):
- ~~Terminal output monitoring~~ (no stable API)
- ~~Detecting "waiting for input" prompts~~ (would need output parsing)
- ~~Detecting error states from output~~ (same limitation)

### Implementation Tasks

1. **Add `SessionState` enum** to types.ts:
   ```typescript
   export type SessionState = 'active' | 'idle' | 'stale' | 'needs-attention' | 'orphaned';
   ```

2. **Shell Integration listener** — subscribe to `onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution` to track command activity per terminal. This is the best signal we have for "is the agent doing something right now?"

3. **State computation** in TerminalManager:
   - `active`: shell execution in progress OR last activity <5 min
   - `idle`: no shell execution, last activity 5-60 min
   - `stale`: last activity >60 min, terminal still alive
   - `needs-attention`: squad inbox has items for this squad
   - `orphaned`: persisted session with no live terminal (post-reopen)

4. **Tree view icons** — update `editless-tree.ts` to show state:
   - 🟢 `terminal-active` icon → active
   - 🟡 `terminal` icon → idle
   - 🔴 `warning` icon → needs-attention
   - 👻 dimmed `terminal` → orphaned/stale
   - Description suffix: `· active`, `· idle 23m`, `· needs attention (2 inbox items)`, `· stale — re-launch?`

5. **Polling interval** — DEFERRED. Shell integration events are reliable regardless of sidebar visibility. Add processId polling only if testing reveals gaps with externally killed processes.

6. **Squad inbox integration** — when scanner detects inbox items for a squad, propagate `needs-attention` to that squad's sessions

### Design Decisions (resolved)

**Q1: Shell Integration → REQUIRE IT.** VS Code 1.93 is 18 months old; 85-95% of users auto-update within weeks. Set `engines.vscode` to `^1.93.0` minimum. No time-based fallback — shell integration is the primary detection mechanism.

**Q2: Orphaned sessions → SHOW WITH RE-LAUNCH, ONE REBOOT ONLY.**
- After close/reopen, show orphaned sessions dimmed with individual "re-launch" and a "re-launch all" action
- User can dismiss individual orphans with X (close without re-launching)
- If orphaned sessions survive a SECOND reboot without being re-launched or dismissed, auto-clean them
- Re-launch creates a fresh terminal with same squad association and name pattern

**Q3: Polling → SKIP FOR NOW.** Shell integration events (`onDidStart/EndTerminalShellExecution`) and lifecycle events (`onDidClose/OpenTerminal`) fire globally regardless of sidebar visibility. No polling needed. Revisit only if testing reveals gaps with externally killed processes.

---

## Dependency Order

```
#53 (persistence verification) → #50 (state detection)
```

#53 should land first — it establishes the persistence foundation and fixes orphan handling. #50 then builds the state detection UX on top of reliable persistence.

## Scope Boundaries

**In scope:** Lifecycle testing, orphan handling, shell integration listeners, tree view state icons, squad inbox integration.

**Out of scope:** Terminal output parsing (API blocked), pseudoterminal rewrite (too large), session history/replay, cost tracking (#46 is separate).
