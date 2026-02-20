# Plan: Dynamic Agent Discovery — Auto-Scan + Configurable Scan Paths (#75)

> Linked issue: [#75](https://github.com/cirvine-MSFT/editless/issues/75)
> Related: [#48](https://github.com/cirvine-MSFT/editless/issues/48) (multi-repo workflow), [#72](https://github.com/cirvine-MSFT/editless/issues/72) (default icons)

## Problem

Discovery is fragmented and manual. Two separate systems (`agent-discovery.ts` for `.agent.md` files, `discovery.ts` for `.ai-team/` squads) scan different locations with different settings. The `editless.discoveryDir` setting is a single string path. Users working across multiple repos have to manually add each agent/squad.

The multi-repo workflow philosophy (#48) says: open VS Code in a central folder, work across repos. Discovery should match — configure your scan paths once, EditLess finds everything automatically.

## Current State

### agent-discovery.ts (standalone agents)
- Scans workspace folders → `.github/agents/*.agent.md` + root `*.agent.md`
- Scans `~/.copilot/` for `.agent.md` files
- Returns `DiscoveredAgent[]` — shown under "Discovered Agents" in tree
- Runs on activation + workspace folder changes
- No persistence — re-discovered every activation
- Dedupes by kebab-case ID from filename
- `DiscoveredAgent.source` is typed as `'workspace' | 'copilot-dir'`

### discovery.ts (squads)
- Scans ONE directory (`editless.discoveryDir` setting) for subdirs containing `.ai-team/team.md`
- Returns `AgentTeamConfig[]` — added to registry JSON
- `checkDiscoveryOnStartup`: if discoveryDir set, scans + prompts "Found N new, add them?"
- `discoverSquads` command: manual scan with folder picker
- Persists to registry JSON via `registry.addSquads()`
- Dedupes by path (case-insensitive)

### Interaction points
- `extension.ts:79` calls `discoverAllAgents()` on activation
- `extension.ts:82-86` re-runs on workspace folder changes
- `extension.ts:132` calls `checkDiscoveryOnStartup()`
- `editless-tree.ts` renders discovered agents as tree items with `$(hubot)` icon
- `visibility.ts` handles hiding agents via `AgentVisibilityManager`

## Approach

### Unified discovery system

Merge the two discovery systems into a single `DiscoveryManager` class that:

1. **Scans multiple sources** in one pass:
   - Workspace folders (existing)
   - `~/.copilot/` directory (existing)
   - User-configured scan paths (new `editless.discovery.scanPaths` array)

2. **Finds both types** in each location:
   - Standalone agents: `*.agent.md` files in root or `.github/agents/`
   - Squads: directories containing `.ai-team/team.md`

3. **Auto-adds silently** on startup + live via file watchers — no prompt. The user configured the paths, they want what's there.

4. **Tracks availability** — if a previously discovered path no longer exists, mark it unavailable (dimmed in tree) rather than removing.

### Removal/hiding UX

**Key insight from Casey:** Hiding is better than removing for auto-discovered items, because removing would just re-discover them on next scan.

| State | Visual | Actions available |
|-------|--------|-------------------|
| **Active** (path exists, files valid) | Normal display | Hide (moves to hidden list, excluded from tree) |
| **Unavailable** (path gone) | Dimmed, tooltip: "Directory not found — was at {path}" | Remove (permanent), Re-scan |
| **Hidden** (user chose to hide) | Not shown in tree | Show via "Show Hidden Agents" (existing) |

- Active agents: **no Remove in context menu**. User must Hide first. To truly remove, go to Settings or edit the registry.
- Unavailable agents: Remove IS available (path is gone anyway, unlikely to auto-rediscover).
- Hidden agents: Stay in registry/discovered list but excluded from tree via `AgentVisibilityManager` (already exists). Auto-scan respects the hidden list — won't re-surface hidden items.

### Suppression window — seamless add flows

When the user adds an agent or squad through our built-in commands (`editless.addAgent`, `editless.addSquad`, `editless.discoverSquads`), the file watcher will immediately detect the new files and try to "discover" what the user just intentionally created. This produces a jarring duplicate notification.

There are actually **two problems** with the watcher + init interaction:

1. **Duplicate toast** — user intentionally added it, watcher re-discovers it and notifies.
2. **Partial discovery** — `squad init` writes files over several seconds (git init, create `.ai-team/`, write team.md, agents/, etc.). The watcher could fire mid-init and discover a half-initialized squad — missing roster, no decisions.md, incomplete team.md.

**Fix:** `DiscoveryManager` exposes a suppression mechanism that handles both:

```typescript
// Called by addAgent/addSquad/discoverSquads commands before creating files
discoveryManager.suppressNextDiscovery(id: string, durationMs?: number): void
discoveryManager.suppressNextDiscoveryForPath(dirPath: string, durationMs?: number): void
```

- The add/discover commands call `suppressNextDiscovery(newAgentId)` before writing files
- **Special case — `addSquad`:** The `squad init` command runs async in a terminal, so the squad ID doesn't exist yet. Suppress by directory path instead: `suppressNextDiscoveryForPath(dirPath)`. When the watcher fires and `scanAll()` finds a new squad at that path, it checks the path-based suppression set.
- When the file watcher fires and `scanAll()` finds a new item, it checks the suppression set
- If the item's ID or path is suppressed: **skip entirely** — don't add to tree, don't notify. The item is invisible to discovery for the duration of the suppression window.
- **`addAgent`** currently writes a `.github/agents/{name}.agent.md` boilerplate — this is the Copilot-compatible default. However, `addAgent` should become **provider-aware**: the active CLI provider determines the creation mechanism:
  - **Copilot (default):** Write `.agent.md` template synchronously (current behavior). Suppression by ID, 5s TTL, push to tree immediately.
  - **Agency:** Could use `agency agent create` or similar (async, terminal-based — same pattern as `addSquad`). Suppression by path, 30s TTL, watcher picks up after init.
  - **Custom/unknown:** Fall back to the `.agent.md` template (Copilot path).
  - The provider-specific creation details are **deferred to a separate issue** — this plan just ensures the suppression mechanism supports both sync (file write) and async (terminal command) creation flows, so we're future-proof.
  - **UX principle:** The public-facing command is always "Add Agent" — never "Add Agency Agent". The provider determines what happens behind the scenes. Agency users configure their provider once in settings; EditLess routes accordingly without exposing internals.
- **`addSquad`** is async (terminal runs `squad init`) — use a **longer TTL (30 seconds)** to cover the full init sequence. When suppression expires, next scan picks up the fully-initialized squad.
- **`addAgent` follow-up:** After writing the `.agent.md` file, the `addAgent` command calls `discoveryManager.scanAll()` explicitly to ensure the agent appears in the tree immediately — not via watcher, not via next startup. This is a "push" model: the command creates the file AND pushes the result into the tree.
- **`addSquad` follow-up:** Since init is async, we can't push immediately. Instead, when the path-based suppression expires, the next watcher event or periodic scan picks up the completed squad. Alternatively, if VS Code's `onDidCloseTerminal` fires when the init terminal closes, use that as a signal to run a targeted scan of that directory.
- Suppression auto-expires after its TTL to avoid permanent leaks
- This keeps the add flows seamless: user clicks "+", agent appears in tree, no redundant toast, no partial state

### Setting migration

`editless.discoveryDir` (string) → `editless.discovery.scanPaths` (string array)

- If `discoveryDir` has a value, auto-migrate it into `scanPaths[0]` on first activation
- Deprecate `discoveryDir` (keep it in schema with `deprecationMessage`)
- `scanPaths` defaults to `[]` (empty = workspace folders + `~/.copilot` only, no extra scan dirs)

## Implementation Tasks

### Task 1: New setting + migration

**Files:** `package.json`, `src/extension.ts`

- Add `editless.discovery.scanPaths` setting (string array, default: `[]`)
- Add `deprecationMessage` to existing `editless.discoveryDir`
- On activation: if `discoveryDir` is set and `scanPaths` is empty, copy value into `scanPaths` and clear `discoveryDir`

### Task 2: DiscoveryManager class

**Files:** new `src/discovery-manager.ts`

A unified discovery orchestrator that replaces the separate agent-discovery and squad-discovery startup flows.

```typescript
export class DiscoveryManager implements vscode.Disposable {
  // Unified scan across all sources
  scanAll(): { agents: DiscoveredAgent[], squads: AgentTeamConfig[] }

  // Individual source scanners (compose into scanAll)
  private scanWorkspaceFolders(): ScanResult
  private scanCopilotDir(): ScanResult
  private scanConfiguredPaths(): ScanResult

  // Availability tracking
  markUnavailable(id: string): void
  getUnavailableIds(): string[]

  // Suppression — prevent duplicate toasts when user adds via built-in commands
  suppressNextDiscovery(id: string, durationMs?: number): void
  suppressNextDiscoveryForPath(dirPath: string, durationMs?: number): void

  // File watchers for scan paths
  private setupWatchers(): void

  // Event
  onDidChange: vscode.Event<void>
}
```

- Calls existing `discoverAgentsInWorkspace()`, `discoverAgentsInCopilotDir()`, and `discoverAgentTeams()` internally — reuses their logic, just orchestrates them
- **Old files stay as utility libraries.** `agent-discovery.ts` and `discovery.ts` keep their scan functions. `DiscoveryManager` calls them. `checkDiscoveryOnStartup()` is removed. `discoverAllAgents()` is no longer called directly from extension.ts.
- Adds `'scan-path'` to the `DiscoveredAgent.source` union type for agents found in configured scan paths
- Dedupes across all sources (workspace wins > copilot-dir > scan paths)
- For squads found in scan paths: auto-adds to registry (silent, no prompt)
- For agents found in scan paths: adds to discovered agents list
- Tracks unavailable items (path existed before, now gone) with timestamp
- Exposes `onDidChange` event for tree refresh

### Task 3: File watchers on scan paths

**Files:** `src/discovery-manager.ts`

- For each path in `scanPaths`, create a `FileSystemWatcher` on `**/.ai-team/team.md` (squad creation) and `**/*.agent.md` (agent creation)
- On file create/delete: re-run `scanAll()`, diff against current state, emit `onDidChange`
- Debounce using the existing `editless.scanDebounceMs` setting
- Watch for `scanPaths` setting changes: tear down old watchers, create new ones
- Also watch workspace folder changes (already exists in extension.ts — integrate into DiscoveryManager)

### Task 4: Availability tracking + tree UX

**Files:** `src/discovery-manager.ts`, `src/editless-tree.ts`, `src/visibility.ts`

- `DiscoveryManager.scanAll()` checks each previously-known path with `fs.existsSync()`
- If gone: mark as unavailable (store in `workspaceState` for persistence)
- Tree rendering for unavailable items:
  - Dimmed icon (use `ThemeIcon` with `~disabled` modifier or custom color)
  - Description: "unavailable — directory not found"
  - Tooltip: full path + "Last seen: {date}"
- Context menu for unavailable items: "Remove" (permanent) + "Re-scan"
- **New commands needed:** `editless.removeAgent` and `editless.rescanAgent` — add to package.json (command definitions, context menu entries with `when: viewItem == unavailable-agent || viewItem == unavailable-squad`). Add new `contextValue` values for unavailable tree items.
- Active items: context menu has "Hide" but NOT "Remove"
- Hidden items: already handled by `AgentVisibilityManager` — scan respects hidden list

### Task 5: Wire into extension.ts

**Files:** `src/extension.ts`

- Create `DiscoveryManager` during activation
- Replace direct calls to `discoverAllAgents()` and `checkDiscoveryOnStartup()` with `discoveryManager.scanAll()`
- Pass results to tree provider (`setDiscoveredAgents()` for agents, registry already has squads)
- Subscribe to `discoveryManager.onDidChange` for live refresh
- Remove the workspace folder change listener that called `discoverAllAgents()` directly (now handled by DiscoveryManager)
- Hook suppression into existing add commands:
  - `editless.addAgent`: call `discoveryManager.suppressNextDiscovery(agentId)` before writing the `.agent.md` file
  - `editless.addSquad`: call `discoveryManager.suppressNextDiscoveryForPath(dirPath)` before running `squad init` (ID unknown until init completes, suppress by path instead)
  - `editless.discoverSquads`: suppress all IDs being added via `promptAndAddSquads()`

### Task 6: Update discoverSquads command

**Files:** `src/discovery.ts`

- `discoverSquads` command: if `scanPaths` is configured, scan all paths. If not, fall back to folder picker (current behavior)
- Remove `checkDiscoveryOnStartup()` — replaced by DiscoveryManager startup scan
- Keep `discoverAgentTeams()` and `promptAndAddSquads()` as reusable functions

### Task 7: Tests

**Files:** `src/__tests__/discovery-manager.test.ts` (new), update existing test files

- Test: `scanAll()` finds agents AND squads across multiple paths
- Test: deduplication — same agent in workspace and scan path → workspace wins
- Test: unavailable detection — previously known path missing → marked unavailable
- Test: hidden agents not re-surfaced by auto-scan
- Test: setting migration from `discoveryDir` to `scanPaths`
- Test: file watcher triggers re-scan on new `.ai-team/team.md` creation
- Test: suppression window — add command suppresses watcher toast for same ID/path
- Test: suppression auto-expires after TTL
- Test: suppressed path skips discovery entirely (no partial state in tree)
- Test: addAgent push model — agent appears in tree immediately after file write, not via watcher
- Test: addSquad long TTL — watcher events during init window are fully suppressed
- Update existing `agent-discovery.test.ts` and `discovery.test.ts` if interfaces change

## Dependency Order

```
Task 1 (setting + migration) → Task 2 (DiscoveryManager) → Task 3 (watchers)
                                                          → Task 4 (availability + tree UX)
                                                          → Task 5 (wire into extension)
                                                          → Task 6 (update command)
Task 7 (tests) — can start after Task 2, incrementally
```

Tasks 2-6 are tightly coupled and should ship as one PR. Task 1 could technically land separately but is small enough to include.

## Scope Boundaries

**In scope:** Unified discovery across scan paths, auto-add, file watchers, availability tracking, hide/remove UX, setting migration.

**Out of scope:** Deep recursive scanning (scan one level deep in each scan path — not entire disk traversals). Network/remote path scanning. Auto-configuring scan paths from git config. Squad version comparison.

## Design Decisions

**D1:** Unified discovery — one system finds both agents and squads.
**D2:** Silent auto-add on startup — no prompts for configured scan paths.
**D3:** Unavailable items dimmed in tree, not removed — user explicitly removes.
**D4:** Active items can be hidden but not removed from context menu — prevents re-discovery loop.
**D5:** File watchers + startup scan for live detection.
**D6:** `editless.discoveryDir` deprecated, migrated to `editless.discovery.scanPaths` array.
**D7:** Scan depth: one level deep in each scan path (subdirectories of the configured path). Not recursive tree-walking.
**D8:** Suppression window — add/discover commands suppress watcher-triggered toasts for items they just created (5s TTL sync, 30s TTL async). Prevents duplicate notifications and partial-state discovery during init.
**D9:** `addAgent` is provider-aware — defaults to Copilot `.agent.md` template, provider-specific creation flows (e.g., agency) supported but deferred. Suppression mechanism supports both sync and async creation. Public UX is always "Add Agent" — provider choice is a settings concern, never exposed in the command name.
