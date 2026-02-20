# Design Review — 2026-02-19
**Facilitator:** Rick
**Participants:** Morty, Meeseeks
**Context:** Pre-implementation review for issue #303 — Remove squad update detection

## Decisions

### 1. Keep module named `squad-upgrader.ts` (don't create squad-utils.ts)
**By:** Rick, based on Meeseeks feedback
**What:** The plan originally proposed extracting utilities to a new `squad-utils.ts` module. Instead, keep `squad-upgrader.ts` but gut the upgrade detection code, leaving only the shared utilities.
**Why:** Simpler migration path. No mock updates needed across test files. File already exists and is correctly imported. Can rename later if desired, but not blocking.

### 2. Remove toast notification for already-initialized squads in addSquad
**By:** Rick, based on Morty feedback
**What:** When `addSquad` detects a squad is already initialized, silently skip terminal creation AND the "Squad upgrade started" toast. Proceed directly to discovery/registration flow.
**Why:** Cleaner UX — no notification for something that isn't happening. Discovery flow is synchronous and fast, doesn't need user feedback.

### 3. Preserve getLocalSquadVersion for tooltip display
**By:** Rick (confirming plan)
**What:** Keep `getLocalSquadVersion()` in `squad-upgrader.ts` even though upgrade detection is removed.
**Why:** Used by `editless-tree.ts` line 235 for displaying Squad version in tooltip (informational, not upgrade-related).

## Action Items

| Owner | Action |
|-------|--------|
| **Morty** | Update package.json: remove `editless.upgradeSquad` and `editless.upgradeAllSquads` command definitions (lines ~103-113), menu entries referencing those commands (lines ~326, ~339), and `editless.squadUpgradeAvailable` context checks |
| **Morty** | extension.ts: Remove upgrade imports (line 10), delete command registration block (lines 182-194), delete startup check (lines 202-205), remove context setting for `editless.squadUpgradeAvailable` (line 134) |
| **Morty** | extension.ts addSquad: Remove toast for already-initialized squads (lines 1140-1144 logic update) |
| **Morty** | editless-tree.ts: Remove `_upgradeAvailable` map (line 78), `setUpgradeAvailable()` method (lines 114-117), upgrade indicator logic (lines 218-227) |
| **Morty** | squad-upgrader.ts: Delete upgrade detection code (`getLatestSquadVersion`, `fetchLatestSquadVersion`, `clearLatestVersionCache`, `isNewerVersion`, `checkSquadUpgradesOnStartup`, `runSquadUpgrade`, `registerSquadUpgradeCommand`, `registerSquadUpgradeAllCommand`, `isAgentTeamConfig`, `getSquadIdFromArgs`, caches, https import, exec/execAsync imports, EditlessRegistry import). Keep utilities: `checkNpxAvailable`, `promptInstallNode`, `isSquadInitialized`, `getLocalSquadVersion` |
| **Meeseeks** | squad-upgrader.test.ts: Delete upgrade test blocks (`checkSquadUpgradesOnStartup`, `registerSquadUpgradeCommand`, `registerSquadUpgradeAllCommand`, `isNewerVersion`). Keep utility tests (`checkNpxAvailable`, `isSquadInitialized`, `getLocalSquadVersion`) |
| **Meeseeks** | tree-providers.test.ts: Delete "EditlessTreeProvider — upgrade indicator" describe block (lines 737-797) |
| **Meeseeks** | extension-commands.test.ts: Delete upgrade tests ("should run squad upgrade command for existing squad directory" lines 1770-1784, "should show success notification for squad upgrade" lines 1796-1804). Add test for "already initialized" path (no terminal, no upgrade) |
| **Meeseeks** | Update mocks in auto-refresh.test.ts and extension-commands.test.ts: Remove upgrade-related function mocks from `vi.mock('../squad-upgrader')` blocks (keep utility mocks: `checkNpxAvailable`, `promptInstallNode`, `isSquadInitialized`) |
| **Either** | Update CHANGELOG.md: Note the removal of squad update detection |

## Notes

### Blocking Issues Found (Fixed in Action Items)

1. **package.json cleanup missing from original plan** — Commands, menu entries, and context checks for upgrade functionality must be removed or users will see broken commands
2. **Mock migration was incorrect** — Original plan said "switch from squad-upgrader to squad-utils" but squad-utils doesn't exist. Solution: keep module named squad-upgrader.ts, just remove upgrade code
3. **addSquad test behavior change** — Tests assume upgrade path runs; need to update for silent skip behavior

### Risks Identified

- **Discovery flow may be broken** (separate bug #288 context) — addSquad changes won't fix this, but they won't make it worse
- **Context key orphaning** — If package.json cleanup is missed, `editless.squadUpgradeAvailable` context will remain set in extension.ts with no consumers (harmless but sloppy)

### Implementation Order (Dependencies)

1. **First:** squad-upgrader.ts cleanup (removes upgrade functions)
2. **Second:** extension.ts wiring removal (depends on squad-upgrader changes)
3. **Second:** editless-tree.ts cleanup (parallel with extension.ts)
4. **Second:** package.json cleanup (parallel with code changes)
5. **Third:** Test updates (depends on all code changes)
6. **Fourth:** CHANGELOG update
7. **Final:** Verify with `npm run lint && npm run test && npm run build`

### Morty Concerns Summary

- ✅ squad-utils extraction → **Decision: Don't extract, keep squad-upgrader.ts**
- ✅ addSquad behavior change → **Approved, no VS Code API concerns**
- 🔴 extension.ts wiring → **Blocking: package.json cleanup was missing**
- ✅ editless-tree.ts cleanup → **Approved as-is**

### Meeseeks Concerns Summary

- ✅ Test scope → **Approved with minor notes**
- ⚠️ Mock updates → **Concerns: squad-utils doesn't exist; resolved by keeping squad-upgrader.ts**
- ⚠️ addSquad test changes → **Needs revision: update tests for silent skip behavior**
- 🔴 Edge cases → **Blocking: context key cleanup, import cleanup, TreeProvider method removal**
