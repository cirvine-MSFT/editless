# Plan: Handle npx Not Installed + Squad Init vs Upgrade Awareness (#83)

> Linked issue: [#83](https://github.com/cirvine-MSFT/editless/issues/83)

## Problem

Squad commands (`squad init`, `squad upgrade`) shell out to `npx` without checking availability. If npx isn't on PATH, the user gets a raw error or silent failure. Additionally, `addSquad` always runs `squad init` even if the selected folder already has `.ai-team/` — it should detect the state and route to the correct command.

## Approach

Five changes: (1) npx detection utility with cached result + lazy refresh, (2) guard all squad commands with a helpful message when npx is missing, (3) smart routing in addSquad based on `.ai-team/` existence with background init via `exec()`, (4) "needs setup" indicator for freshly-scaffolded squads, (5) tests.

## Decisions

- **D1:** npx check is cached at activation, refreshed if user installs Node through our UX (e.g., after clicking "Install Node.js" button in the toast, we invalidate cache so next attempt re-probes).
- **D2:** "Add Squad" smart-routes: no `.ai-team/` → `squad init`, `.ai-team/` exists → register in EditLess + offer `squad upgrade`.
- **D3:** Reuse `probeCliVersion` pattern from `cli-provider.ts` for npx detection (execSync with timeout + error catch).
- **D4:** Agency detection remains passive per decisions.md — do NOT offer to install Agency. Only guard npx.
- **D5:** Squad init runs in background via `exec()` + `withProgress()` (no terminal). On success, explicitly register the squad in the registry + start watcher (SquadWatcher only watches already-registered squads).
- **D6:** "Needs setup" state determined by agent subdirectory count: `.ai-team/agents/` has zero subdirectories → needs setup. Template-proof, simple fs check.

## Tasks

### T1: npx detection utility
**Files:** `src/npx-utils.ts` (new), `src/extension.ts`

Create a small utility module:
- `probeNpx(): boolean` — uses `execSync('npx --version', { timeout: 5000 })`, returns true/false
- `isNpxAvailable(): boolean` — returns cached result
- `refreshNpxCache(): void` — re-runs probe, updates cache
- `ensureNpx(): boolean` — checks cache; if unavailable, shows info message: *"Squad requires npx (comes with Node.js). Install Node.js to use squad features."* with an "Install Node.js" button that opens `https://nodejs.org`. Returns false if missing so callers can bail.

Call `probeNpx()` during activation (non-blocking — fire and forget via async wrapper). Set a context key `editless.npxAvailable` so toolbar/menus can react if needed later.

### T2: Guard squad commands with npx check
**Files:** `src/extension.ts`, `src/squad-upgrader.ts`

Add `ensureNpx()` guard at the top of:
- `editless.addSquad` command handler (extension.ts ~line 599)
- `upgradeSquad()` function (squad-upgrader.ts ~line 30)
- `upgradeAllSquads()` function (squad-upgrader.ts ~line 69)

Pattern:
```typescript
if (!ensureNpx()) { return; }
```

Cache invalidation: when user clicks "Install Node.js" in the toast, set cached value to `null` so the next squad command re-probes instead of using stale cache. (Installing Node requires a new shell anyway, so lazy re-probe on next attempt is sufficient.)

### T3: Smart routing — addSquad init vs upgrade
**Files:** `src/extension.ts`, `src/squad-upgrader.ts`

In the `editless.addSquad` command handler, after folder selection and npx guard:

1. Check if `<selectedDir>/.ai-team/` exists (use `fs.existsSync`)
2. If NO `.ai-team/`:
   - Run `exec('npx github:bradygaster/squad init', { cwd: dirPath })` wrapped in `withProgress()` — same pattern as upgrade
   - Progress notification: *"Initializing squad in {name}..."*
   - On success: **explicitly register the squad** in the registry + refresh tree (SquadWatcher only watches already-registered squads, so we can't rely on it for initial detection). Then start a watcher for the new squad.
   - On failure: show error message with stderr
   - No terminal created — entirely background
3. If `.ai-team/` EXISTS:
   - Register the squad in EditLess immediately (it's already initialized)
   - Show info toast: *"'{name}' already has a squad — registered in EditLess."* with an **"Upgrade Squad"** button
     - User clicks "Upgrade Squad" → run `npx github:bradygaster/squad upgrade` (via squad-upgrader)
     - User dismisses → squad is registered, no upgrade attempted

Note: the init path no longer runs `git init` automatically. If the folder isn't a git repo, `squad init` should handle that (or we check beforehand and run `git init` via exec first).

### T4: "Needs setup" squad state in tree
**Files:** `src/editless-tree.ts`, `src/watcher.ts` or `src/registry.ts`

Add a `populated` flag to squad state, derived from:
```typescript
const agentsDir = path.join(squadPath, '.ai-team', 'agents');
const populated = fs.existsSync(agentsDir) 
  && fs.readdirSync(agentsDir).some(f => fs.statSync(path.join(agentsDir, f)).isDirectory());
```

Tree rendering for unpopulated squads:
- Show squad name with a subtle indicator (e.g., suffix `"(new)"` or a different icon/badge)
- Collapse the roster/decisions/activity sections (nothing to show yet)
- No action item needed — user just created the squad and knows they need to run a session to populate it

File watcher already watches `.ai-team/**/*` — when agents get created during first session, watcher fires → tree refreshes → "(new)" indicator disappears automatically.

### T5: Tests
**Files:** `src/__tests__/npx-utils.test.ts` (new), updates to existing test files

- **npx-utils tests:**
  - `probeNpx()` returns true when execSync succeeds
  - `probeNpx()` returns false when execSync throws
  - `ensureNpx()` shows message when unavailable
  - `ensureNpx()` returns true silently when available
  - Cache invalidation: after invalidation, next call re-probes
- **addSquad routing tests:**
  - Folder without `.ai-team/` → runs init via exec (no terminal)
  - Folder with `.ai-team/` → registers + shows toast with upgrade button
  - npx unavailable → shows message, does not attempt command
- **"Needs setup" state tests:**
  - Squad with empty `agents/` dir → `populated` is false
  - Squad with agent subdirectories → `populated` is true
  - Tree renders "(new)" indicator for unpopulated squads

## Out of Scope

- Agency install prompts (per decisions.md — passive detection only)
- Squad version comparison (future enhancement)
- npx alternatives (e.g., `npm exec`) — npx is the standard
