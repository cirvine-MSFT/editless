# Plan: Toolbar UX — Unified Updates & Persistent Icons (#60, #64)

> Linked issues: [#60](https://github.com/cirvine-MSFT/editless/issues/60) (toolbar icons disappear), [#64](https://github.com/cirvine-MSFT/editless/issues/64) (distinguish update actions)
> Also closes: [#52](https://github.com/cirvine-MSFT/editless/issues/52) (toast dedup — closing as phantom, re-file if seen again)

## Problem

Two related toolbar UX issues:

1. **#60**: Toolbar icons (refresh, show hidden, +, update) disappear when the mouse leaves the AGENTS section header. Users can't see available actions at a glance.
2. **#64**: When both agency and squad updates are available, the update buttons are hard to distinguish. Agency uses `$(cloud-download)`, squads use `$(arrow-up)` — but visually they blur together, especially with multiple squads.

## Approach

### #64 — Unified "Check for Updates" button (follows the #59 "Add..." pattern)

Replace the separate `updateAgency` and `upgradeAllSquads` toolbar icons with a **single unified update button** that:

- Uses a new `editless.checkForUpdates` command with icon `$(cloud-download)`
- **Only appears when at least one update is available** (controlled by a `editless.updatesAvailable` context key)
- Opens a **multi-select QuickPick** listing all available updates:
  ```
  ☐ 🔄 Agency: v1.2.3 → v1.3.0
  ☐ 🔄 Squad "EditLess": v0.8.1 → v0.9.0
  ```
- Selected items are updated in parallel
- If clicked with no updates (edge case — context key race), shows "Everything is up to date"

This mirrors the existing `editless.addNew` pattern (single `+` button → QuickPick → action).

**What changes:**
- Remove `editless.updateAgency` from `view/title` toolbar
- Remove `editless.upgradeAllSquads` from `view/title` toolbar
- Add `editless.checkForUpdates` to `view/title` navigation with `when: editless.updatesAvailable`
- Keep `editless.upgradeSquad` on context menu (per-squad inline upgrade still useful)
- Keep `editless.updateAgency` command registered (used internally + by toast "Update" action) but remove from toolbar
- Generalize update availability tracking: currently only agency sets `editless.agencyUpdateAvailable` — extend to track squad updates too

**Squad update detection:**
Currently squads don't have update detection — `upgradeAllSquads` just runs `npx github:bradygaster/squad upgrade` blindly. For the unified QuickPick to show meaningful info (current → available version), we need basic version comparison:
- We already have `getLocalSquadVersion()` in squad-upgrader.ts (reads frontmatter from squad.agent.md)
- We need a `getLatestSquadVersion()` that checks the npm registry or runs `npx github:bradygaster/squad --version` to get the latest
- **MVP simplification:** For now, just list squads as "Upgrade available (check)" without version comparison — the command already works, we just need to surface it in the unified picker. Full version comparison can come later.

### #60 — Make important toolbar icons persistent

Analysis of current `view/title` for `editlessTree`:

| Command | Icon | Group | Visible? |
|---------|------|-------|----------|
| `updateAgency` | `$(cloud-download)` | `navigation@1` | When update available |
| `upgradeAllSquads` | `$(arrow-up)` | `navigation@2` | Always |
| `showHiddenAgents` | none | `1_visibility` | Overflow ("...") menu |
| `addNew` | `$(add)` | `navigation@4` | Always |

**VS Code behavior:** Icons in the `navigation` group ARE persistent — they don't disappear on hover-out. Icons in other groups (like `1_visibility`) go into the overflow "..." menu and are only visible when clicked. So `upgradeAllSquads` and `addNew` should already be persistent.

**What's likely happening:** The user sees icons appearing/disappearing because:
1. `updateAgency` conditionally shows (when clause) — appears when update detected, gone when not
2. `showHiddenAgents` is in overflow, not navigation
3. The cluster of 2-3 dynamic icons shifting around feels unstable

**Fix:**
After the #64 changes (unified update button), the toolbar simplifies to:

| Command | Icon | Group | Visible? |
|---------|------|-------|----------|
| `checkForUpdates` | `$(cloud-download)` | `navigation@1` | When any update available |
| `addNew` | `$(add)` | `navigation@3` | Always |
| `refresh` | `$(refresh)` | `navigation@4` | Always |

Changes:
- Move `editless.refresh` into toolbar as a navigation icon (currently only registered as a command, not in toolbar)
- Remove `upgradeAllSquads` from toolbar (replaced by unified update button)
- Keep `showHiddenAgents` in overflow — it's a less-frequent action
- Net result: 2 always-visible icons (add, refresh) + 1 conditional (updates). Stable toolbar.

## Implementation Tasks

### Task 1: Unified update availability tracking

**Files:** `src/cli-provider.ts`, `src/extension.ts`

- Rename `setAgencyUpdateAvailable` → generalize to track ANY provider update availability
- Add `setUpdatesAvailable(available: boolean)` that sets `editless.updatesAvailable` context key
- Track which providers have updates in a module-level `Map<string, UpdateInfo>` where `UpdateInfo = { provider: CliProvider, availableVersion?: string }`
- `checkSingleProviderUpdate` populates this map when it detects an update, and calls `setUpdatesAvailable(map.size > 0)`
- Export `getPendingUpdates(): UpdateInfo[]` for the QuickPick to consume

### Task 2: Unified "Check for Updates" command

**Files:** `src/cli-provider.ts` (or new `src/update-manager.ts`), `src/extension.ts`, `src/squad-upgrader.ts`

- Register new command `editless.checkForUpdates`
- Implementation:
  1. Collect pending CLI updates from `getPendingUpdates()`
  2. Collect squads from registry (always offer "check for upgrade" for registered squads)
  3. Build QuickPick items with `canPickMany: true`:
     - CLI updates: `🔄 Agency: v1.2.3 → v1.3.0` (or similar for other providers)
     - Squad upgrades: `🔄 Squad "{name}": check for upgrade`
  4. On selection: run `runProviderUpdate()` for CLI items, `runSquadUpgrade()` for squad items — in parallel
  5. After all complete: re-check and update `editless.updatesAvailable` context
- **Filter rules:** Only show agency if detected (`provider.detected === true`). Only show squad upgrades if registry has squads. The unified button itself only appears when at least one actionable update exists — if nothing is installed, nothing shows.
- If no updates and no squads: show info message "Everything is up to date"

### Task 3: Update package.json menus

**Files:** `package.json`

- Add `editless.checkForUpdates` command definition with icon `$(cloud-download)` and category "EditLess"
- Add to `view/title`: `{ "command": "editless.checkForUpdates", "when": "view == editlessTree && editless.updatesAvailable", "group": "navigation@1" }`
- Remove `editless.updateAgency` from `view/title` (keep command registered for toast button)
- Remove `editless.upgradeAllSquads` from `view/title` (keep command registered)
- Add `editless.refresh` to `view/title`: `{ "command": "editless.refresh", "when": "view == editlessTree", "group": "navigation@4" }`
- Add `editless.checkForUpdates` to `commandPalette` exclusion if desired, or keep it discoverable
- Keep `editless.upgradeSquad` in `view/item/context` (per-squad inline still useful)

### Task 4: Close #52

Close issue #52 with a comment explaining the toast dedup logic is correct and #51 (version display) now makes it self-diagnosable.

### Task 5: Tests

**Files:** `src/__tests__/cli-provider.test.ts` (update existing), possibly new test file

- Update existing cli-provider tests for renamed/refactored functions
- Test: `getPendingUpdates()` returns correct items when updates are detected
- Test: `checkForUpdates` command presents QuickPick with correct items
- Test: unified context key `editless.updatesAvailable` is set/cleared correctly
- Test: selecting items triggers the correct update functions

## Dependency Order

```
Task 1 (update tracking) → Task 2 (unified command) → Task 3 (package.json) → Task 5 (tests)
Task 4 (close #52) — independent, can happen anytime
```

Tasks 1-3 are tightly coupled and should ship as one commit/PR. Task 5 alongside or immediately after.

## Scope Boundaries

**In scope:** Unified update button, toolbar cleanup, refresh in toolbar, close #52.

**Out of scope:** Squad version comparison (MVP just offers "check for upgrade"), showHiddenAgents promotion to toolbar (keeping in overflow — less frequent action), toast dedup rework.

## Design Decisions

**D1:** Unified update button follows the #59 "Add..." pattern — single icon → multi-select QuickPick.
**D2:** Button only appears when updates are available (Casey confirmed).
**D3:** Squad updates listed as "check for upgrade" without version comparison (MVP — full comparison deferred).
**D4:** Refresh icon added to toolbar as always-visible navigation item.
**D5:** #52 closed as phantom — re-file if toast duplication observed with version display.
**D6:** Don't show agency update if agency CLI is not installed (filter by `provider.detected`).
**D7:** Don't show squad upgrades if no squads are registered (filter by `registry.loadSquads().length > 0`).
