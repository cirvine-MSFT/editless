# EditLess Architecture

EditLess is a VS Code extension for managing AI agents, terminal sessions, work items, and pull requests. This document describes the system architecture for developers contributing to EditLess.

## System Overview

EditLess activates on startup (`onStartupFinished`) and establishes three main responsibilities:

1. **Agent Discovery & Management** — Discover squad teams and standalone agents, display them in a tree view, and provide launch/management commands
2. **Terminal Session Tracking** — Maintain persistent terminal session state across editor restarts, associate sessions with squads and agents
3. **Work Integration** — Fetch and display work items and PRs from GitHub and Azure DevOps

The extension runs in the VS Code extension host and exposes a sidebar panel (activity bar) with three tree views: Agents, Work Items, and Pull Requests.

## Component Map

```
extension.ts (activate)
    ├── Registry (registry.ts)
    │   └── Loads agent teams from agent-registry.json
    ├── TerminalManager (terminal-manager.ts)
    │   ├── Tracks terminal instances & session metadata
    │   ├── Persists session state to context.globalState
    │   └── Fires onDidChange → EditlessTreeProvider refresh
    ├── EditlessTreeProvider (editless-tree.ts)
    │   ├── Renders Agents view
    │   ├── Shows squads, agents, sessions, decisions, activity
    │   └── Subscribes to terminalManager.onDidChange & labelManager.onDidChange
    ├── WorkItemsTreeProvider (work-items-tree.ts)
    │   ├── Fetches GitHub issues & Azure DevOps work items
    │   ├── Renders Work Items view
    │   └── Auto-refreshes on interval & window focus
    ├── PRsTreeProvider (prs-tree.ts)
    │   ├── Fetches GitHub PRs & Azure DevOps pull requests
    │   ├── Renders Pull Requests view
    │   └── Auto-refreshes on interval & window focus
    ├── CLI Provider Detection (cli-provider.ts)
    │   ├── Probes installed CLI tools (Copilot, Claude, etc.)
    │   ├── Detects version & availability
    │   └── Stores active provider in settings
    ├── Discovery Engine (discovery.ts & agent-discovery.ts)
    │   ├── Discovers squads in scanPaths
    │   ├── Discovers standalone agents (.agent.md files)
    │   └── Watches filesystem for changes
    ├── Session Context Resolver (session-context.ts)
    │   ├── Queries Copilot CLI for active session info
    │   └── Resolves session ID → terminal mapping
    └── Auxiliary Systems
        ├── SquadWatcher (watcher.ts) — watches squad dirs for changes
        ├── SessionLabelManager (session-labels.ts) — user labels on terminals
        ├── AgentVisibilityManager (visibility.ts) — hide/show agents
        └── NotificationManager (notifications.ts) — toasts for events
```

## Data Flow

### Agent Discovery & Display

```
startup
  → discoverAgentTeams(scanPaths)  [discovery.ts]
     → reads .ai-team/team.md (or .squad/team.md)
     → parses name, description, universe
     → returns AgentTeamConfig[]
  → Registry.loadSquads()
     → loads from agent-registry.json
     → merges discovered squads
  → EditlessTreeProvider.getChildren(root)
     → SquadState (scanner.ts scans squad directory)
     → resolves agents, decisions, activity
     → renders tree
```

### Terminal Session Lifecycle

```
user launches session
  → TerminalManager.launchSession(squad)
     → creates vscode.Terminal
     → creates TerminalInfo record (id, squad, createdAt, etc.)
     → stores in _terminals map
     → fires onDidChange
  → TerminalManager._persist()  [every 30s]
     → serializes to PersistedTerminalInfo[]
     → stores in context.globalState
  → on editor restart
     → TerminalManager._restore()
     → reads globalState
     → marks orphaned sessions (processes no longer exist)
     → fires onDidChange
     → EditlessTreeProvider shows orphaned sessions with re-launch option
```

### Work Items & PRs

```
WorkItemsTreeProvider.getRoot()
  → checks editless.github.repos config
  → if empty, auto-detects via git remote
  → fetches from GitHub (fetchAssignedIssues)
  → if ado.organization configured, fetches Azure DevOps work items
  → applies label filters (includeLabels, excludeLabels)
  → caches results
  → auto-refreshes on editless.refreshInterval timer
  → refreshes when window regains focus
```

### CLI Provider Detection & Launch

```
startup
  → probeAllProviders()  [cli-provider.ts]
     → runs versionCommand for each provider in settings
     → detects version, sets provider.detected = true
     → stores in _providers[]
  → resolveActiveProvider()
     → checks editless.cli.activeProvider setting
     → if "auto", uses first detected provider
     → stores in _activeProvider
  → user launches session → TerminalManager uses launchCommand
     → e.g., "copilot --agent squad-name"
```

## Key Abstractions

### TerminalManager

Tracks VS Code terminal instances and associates them with squad sessions. Maintains:
- `_terminals: Map<vscode.Terminal, TerminalInfo>` — live terminal metadata
- `_lastActivityAt: Map<vscode.Terminal, number>` — last key press/command
- Session persistence to `context.globalState` (survives editor restart)
- State machine: `idle | working | waiting-on-input | stale | orphaned`

**Key methods:**
- `launchSession(squad, cli)` — create terminal and session metadata
- `renameSession(terminal, label)` — user-friendly display name
- `getSessionContext(terminal)` — resolve Copilot session ID from process tree
- `_persist()` — serialize to storage (crash-safe, 30s interval)

### EditlessRegistry

Manages the agent registry (agent-registry.json).
- `loadSquads()` — read JSON file
- `getSquad(id)` — retrieve squad by ID
- `addSquad(squad)` — register new squad
- `removeSquad(id)` — deregister squad
- `save()` — persist changes to disk

### SquadState & Scanner

`scanner.ts` scans a squad directory and builds a `SquadState` object:
- Parses `.ai-team/team.md` for roster (agent names, roles, charters)
- Reads `.ai-team/decisions/` inbox
- Reads `.ai-team/decisions.md` for recent decisions
- Reads orchestration logs for recent activity
- Detects squad status: `active | idle | needs-attention`

### TreeDataProviders

Three providers render the sidebar:

1. **EditlessTreeProvider** — Agents view
   - Root: Squads
   - Children: Agents (from roster), decisions, recent activity, terminal sessions
   - Updates on terminal change or label change

2. **WorkItemsTreeProvider** — Work Items view
   - Root: GitHub issues + Azure DevOps work items
   - Filtered by label and state
   - Links to plan files via PlanFileIndex

3. **PRsTreeProvider** — Pull Requests view
   - Root: GitHub PRs + Azure DevOps pull requests
   - Shows assignees, status, linked to work items

## Extension Entry Points

### Activation (`extension.ts`)

Runs once on editor startup:

```typescript
export function activate(context: vscode.ExtensionContext) {
  // 1. CLI provider detection (async, non-blocking)
  probeAllProviders().then(() => resolveActiveProvider());

  // 2. Squad registry
  const registry = createRegistry(context);
  registry.loadSquads();

  // 3. Auto-register workspace squads
  autoRegisterWorkspaceSquads(registry);

  // 4. Auto-flush decisions inbox
  flushDecisionsInbox(teamDir);

  // 5. Terminal manager
  const terminalManager = new TerminalManager(context);

  // 6. Tree providers
  const agentStateManager = new AgentStateManager(agentSettings);
  const editlessTree = new EditlessTreeProvider(agentStateManager, agentSettings, terminalManager, ...);
  vscode.window.registerTreeDataProvider('editlessTree', editlessTree);

  const workItems = new WorkItemsTreeProvider(...);
  vscode.window.registerTreeDataProvider('editlessWorkItems', workItems);

  const prs = new PRsTreeProvider(...);
  vscode.window.registerTreeDataProvider('editlessPRs', prs);

  // 7. Commands, menus, keybindings
  registerAllCommands(context, ...);
}
```

### Commands

Commands are registered in `extension.ts` and handlers in separate modules:

| Command | Module | Purpose |
|---------|--------|---------|
| `editless.launchSession` | terminal-manager.ts | Create terminal for squad |
| `editless.focusSession` | terminal-manager.ts | Bring terminal to focus |
| `editless.renameSession` | session-labels.ts | User-friendly terminal label |
| `editless.refreshWorkItems` | work-items-tree.ts | Manual refresh work items |
| `editless.discoverSquads` | discovery.ts | Scan for new squads |

### Settings

All settings are prefixed `editless.*` and defined in `package.json` contributes.configuration:

| Category | Settings |
|----------|----------|
| **Registry** | `registryPath`, `discoveryDir`, `discovery.scanPaths` |
| **CLI** | `cli.providers`, `cli.activeProvider` |
| **GitHub** | `github.repos`, `github.issueFilter` |
| **Azure DevOps** | `ado.organization`, `ado.project` |
| **Notifications** | `notifications.enabled`, `notifications.inbox`, `notifications.updates` |
| **Auto-refresh** | `refreshInterval`, `scanDebounceMs` |

### Views & Tree Items

Three sidebar views are registered in `package.json` under `contributes.views.editless-dashboard`:

1. `editlessTree` → `EditlessTreeProvider` — Agents
2. `editlessWorkItems` → `WorkItemsTreeProvider` — Work Items
3. `editlessPRs` → `PRsTreeProvider` — Pull Requests

Tree items use `contextValue` for menus. Example: `contextValue = "squad"` matches `view/item/context` menus with `when: viewItem == squad`.

## File Organization

```
src/
├── extension.ts                 ← Activation entry point
├── types.ts                     ← Shared TypeScript interfaces
├── registry.ts                  ← Agent registry management
├── editless-tree.ts             ← Agents tree provider
├── work-items-tree.ts           ← Work Items tree provider
├── prs-tree.ts                  ← Pull Requests tree provider
├── terminal-manager.ts          ← Terminal session tracking
├── session-labels.ts            ← User labels on terminals
├── session-context.ts           ← Copilot session context resolution
├── discovery.ts                 ← Squad discovery & auto-register
├── agent-discovery.ts           ← Standalone agent discovery
├── cli-provider.ts              ← CLI tool detection & launch
├── scanner.ts                   ← Squad directory scanning
├── watcher.ts                   ← Squad directory file watcher
├── visibility.ts                ← Hide/show agent visibility state
├── notifications.ts             ← Toast notifications
├── status-bar.ts                ← VS Code status bar integration
├── github-client.ts             ← GitHub API client
├── ado-client.ts                ← Azure DevOps API client
├── ado-auth.ts                  ← Azure DevOps authentication
├── team-dir.ts                  ← Resolve .ai-team/ or .squad/ directory
├── inbox-flusher.ts             ← Auto-flush decisions inbox
├── squad-ui-integration.ts      ← Squad UI dashboard webview
└── vscode-compat.ts             ← VS Code version compatibility
```

## Build & Package

- **Build:** `npm run build` (esbuild bundles src/ → dist/extension.js)
- **Test:** `npm run test` (vitest runs unit tests)
- **Lint:** `npm run lint` (tsc --noEmit checks types)
- **Package:** `npm run package` (vsce creates .vsix)

## Extension Lifecycle

1. **Activation** (`onStartupFinished`)
   - Initialize managers (TerminalManager, tree providers)
   - Probe CLI providers
   - Load squad registry
   - Auto-discover squads
   - Restore terminal sessions

2. **Runtime**
   - Watch filesystem for squad changes
   - Track terminal sessions
   - Auto-refresh work items/PRs on interval
   - Handle user commands (launch, refresh, filter, etc.)

3. **Deactivation** (`dispose`)
   - Persist terminal sessions to storage
   - Clean up file watchers
   - Dispose of event subscriptions

---

**For questions or clarification, refer to the team charter at `.ai-team/agents/summer/charter.md` or check the inline code comments in the relevant module.**
