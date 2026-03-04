# EditLess Feature Ideation Report

**Prepared by:** Morty (Extension Dev)  
**Date:** 2026-03-XX  
**Focus:** 6 technically feasible features grounded in current EditLess architecture

---

## Feature Proposals

### 1. **Terminal Session Snapshots** (Save & restore terminal context)

**User Value:**  
Users can "save" a terminal session (agent, CWD, branch, recent commands, scroll history) as a named snapshot, then restore a complete terminal state with one click. Perfect for context-switching between multiple parallel agent tasks without losing work context.

**Key Files/Modules Touched:**
- `src/terminal-manager.ts` — add snapshot save/restore methods
- `src/session-context.ts` — query terminal state (CWD, git branch, env vars)
- `src/editless-tree.ts` — new "Snapshots" tree section with context menu (Create, Restore, Delete)
- `src/commands/session-commands.ts` — new commands `saveTerminalSnapshot`, `restoreTerminalSnapshot`
- `src/types.ts` — new `TerminalSnapshot` interface (name, agent, cwd, branch, scrollHistory, timestamp)
- `package.json` contributes — 2 new commands, context menus on terminal items

**Implementation Notes:**
- Snapshot persistence: store in `workspaceState` keyed by `editless.terminalSnapshots`
- Serialize scrollback via VS Code's `terminal.sendText()`-captured history or native Terminal API if available
- Git branch detection via `git rev-parse --abbrev-ref HEAD` in snapshot context
- Restore flow: launch new terminal with saved agent/CWD, restore env vars, optionally re-send recent commands
- No API blocking — snapshots are best-effort (scroll history may not persist across reload)

**Complexity:** **M** (TreeView integration + terminal state capture + workspaceState persistence)

---

### 2. **Session Templates** (Pre-configured launch recipes)

**User Value:**  
Create reusable session launch templates (e.g., "Debug JavaScript", "Code Review", "Docs Writing") that pre-populate agent, CLI flags, CWD directory, and instructions. One-click launch with full context.

**Key Files/Modules Touched:**
- `src/copilot-cli-builder.ts` — extend `CopilotCommandOptions` with template metadata
- `src/discovery.ts` — scan `.github/session-templates/*.md` files (similar to agent discovery)
- `src/editless-tree.ts` — new "Templates" collapsible section under agents
- `src/commands/session-commands.ts` — new `launchFromTemplate` command
- `src/types.ts` — new `SessionTemplate` interface (name, agent, model, cwd, flags, instructions)
- `package.json` settings — optional `editless.sessionTemplates` config path

**Implementation Notes:**
- Template file format: YAML frontmatter (agent, model, cwd, flags) + markdown body (launch instructions)
- Auto-discovery like agents (scan workspace + registry paths)
- Launch flow: `launchFromTemplate(template)` → `buildCopilotCommand()` with template flags → `launchTerminal()` with instructions as toast
- Templates show in context menu: "Launch from Template" on agent items, sorted by usage frequency
- Template UI: icon `$(file-template)`, description shows agent name + CWD path

**Complexity:** **M** (Discovery + CLI builder integration + template file parsing)

---

### 3. **Session Replay Mode** (Audit trail playback for PRs)

**User Value:**  
Record session events (commands run, files changed, git commits, PR opened) into a lightweight audit trail. View a timeline in the PR review panel showing exactly what the agent did and why. Great for code review confidence.

**Key Files/Modules Touched:**
- `src/session-context.ts` — extend `SessionContextResolver` to track session events via events.jsonl
- `src/unified-discovery.ts` — aggregate events into timeline view
- `src/prs-tree.ts` — new "Activity" section per PR showing linked session timeline
- `src/types.ts` — new `SessionEvent` interface (timestamp, type, details) and `SessionTimeline` aggregate
- `.squad/skills/session-replay/SKILL.md` — document event schema and replay patterns

**Implementation Notes:**
- No new file writes — leverage existing `~/.copilot/session-state/*/events.jsonl` already created by CLI
- Event types: `shell_start`, `shell_end`, `git_commit`, `file_change`, `pr_open`, `agent_input`, `agent_output`
- Timeline view in PR tree: collapsible section showing agent activity chronologically
- Playback (optional future): `editless.replaySession` command streams session events into a markdown report
- Search integration: filter timeline by event type (e.g., show only commits, or only agent interactions)

**Complexity:** **M** (events.jsonl parsing + timeline aggregation + PR tree enhancement)

---

### 4. **Work Item Dependency Graph** (Visualize work blocking relationships)

**User Value:**  
Detect and visualize issue/PR dependencies from labels (blocked-by, blocks, related) or from explicit GitHub issue relationships. Show a mini dependency graph in the Work Items tree, highlight chains where one agent's work is blocked.

**Key Files/Modules Touched:**
- `src/github-client.ts` — new `fetchIssueRelationships()` method to query linked issues
- `src/work-items-tree.ts` — add dependency detection logic, new tree item type for dependency chains
- `src/types.ts` — new `IssueRelationship` interface (blockedBy, blocks, related)
- `src/commands/work-item-commands.ts` — new `showDependencyGraph` command (QuickPick or simple list view)
- Tree items: add dependency icons (🔴 blocked, 🟢 unblocked, 🔗 related)

**Implementation Notes:**
- Dependency detection: parse labels (`blocked-by:#{num}`, `blocks:#{num}`) + query GitHub's linked issues API
- Block detection heuristic: if any issue in the blocking set is open, the item is blocked
- Tree icon system: use VS Code's standard icons (`$(error)` for blocked, `$(pass)` for unblocked)
- Performance: cache dependency graph for 5 minutes (refresh via `editless.refreshWorkItems`)
- Optional: tooltip on work item showing "Blocked by #42, #99" or "Blocks #50"

**Complexity:** **M** (GitHub API integration + dependency resolution + tree enhancement)

---

### 5. **Agent Action Replay** (Re-run completed agent work with variations)

**User Value:**  
For completed tasks, users can "replay" the agent work with variations — e.g., re-run the code review agent with a different model, or retry a failed agent task with adjusted flags. Reduces friction for iterating on agent output.

**Key Files/Modules Touched:**
- `src/unified-discovery.ts` — extend discovery to flag "completed" sessions
- `src/session-context.ts` — expose `SessionContextResolver.getCompletedSessions()` and session metadata
- `src/editless-tree.ts` — new "Recent" or "Completed" section showing past sessions with replay option
- `src/commands/session-commands.ts` — new `replaySession(sessionId, overrides?)` command
- `src/copilot-cli-builder.ts` — extend to accept "replay" context (preserve flags, optionally override model/args)

**Implementation Notes:**
- Completed session detection: query `~/.copilot/session-state/` for sessions with `sessionStatus: completed` or `endedAt` timestamp
- Replay metadata UI: QuickPick prompts for model override, additional args, new branch name (if applicable)
- Build command: use original `launchCommand` from session metadata, override specific fields
- Use case: agent produces code, user realizes mid-review to try GPT-5.2 instead of Sonnet — "Replay with Model: gpt-5.2-codex" button
- Safety: replay creates NEW terminal (doesn't reuse old one), clearly labeled as "Replay of #X"

**Complexity:** **M** (Session metadata aggregation + replay QuickPick UX + CLI builder extension)

---

### 6. **Terminal Color Themes** (Agent-specific terminal color coding)

**User Value:**  
Each agent/squad gets a distinct terminal background or border color automatically. Makes it trivial to visually distinguish which agent is running in which terminal without reading the name. Configurable per-agent.

**Key Files/Modules Touched:**
- `src/terminal-manager.ts` — extend `launchTerminal()` to apply color theme
- `src/agent-settings.ts` — new `terminalColor` setting (hex or named color)
- `src/types.ts` — extend `DiscoveredAgent` interface with `terminalColor?: string`
- `src/editless-tree.ts` — color picker UI in agent context menu ("Set Terminal Color")
- `package.json` contributes — command `editless.setAgentTerminalColor`, menu on agent items
- `.squad/agents/{agent}/settings.json` — store `terminalColor` per agent

**Implementation Notes:**
- VS Code Terminal API: `TerminalOptions.color` accepts `ThemeColor` objects or named colors
- Default colors: assign from a fixed palette on first agent discovery (red, blue, green, yellow, cyan, magenta)
- Color picker: use `vscode.window.showQuickPick()` with predefined VS Code theme colors
- Persistence: store in `agent-settings.ts` via `settings.updateAgentColor(agentId, color)` + `agent-settings.ts` I/O
- Inheritance: squad agents inherit squad color by default, can override individually
- Non-breaking: colorless terminals still work, just use default terminal theme

**Complexity:** **S** (Terminal API color support + agent settings extension + simple color picker)

---

## Rankings & Recommendations

### 🚀 **Best 2 Quick Wins**

**1. Terminal Color Themes (Complexity: S)**  
- Shipped entirely in `terminal-manager.ts` + agent-settings.ts updates
- One new command + menu entry
- Immediate UX value: visually distinguish agents at a glance
- No API blocking; uses standard VS Code Terminal color support
- 4–6 hours work; ships as a small self-contained PR

**2. Agent Action Replay (Complexity: M)**  
- Builds on existing `SessionContextResolver` (already reads session metadata)
- One new command, one QuickPick UX flow
- Leverages existing `copilot-cli-builder` — no new patterns
- High user value: "rerun with a different model" is a common ask in agentic workflows
- 6–8 hours work; ships as a focused feature PR

### 💎 **Best 1 Ambitious Feature**

**Session Templates (Complexity: M)**  
- Most generalizable and team-enabling of the proposed features
- Reduces friction for new agents: "New agent? Create a template, share with team, everyone uses it"
- Aligns with EditLess's core mission: delegate complex work to AI agents with clear context
- Leverages discovery infrastructure (already proven in agent/squad discovery)
- Extends `copilot-cli-builder` in natural ways (template → CLI flags)
- Opens path to future features: template marketplace, template versioning, template composition
- 8–10 hours work; ships as a self-contained system PR

---

## Implementation Phasing (if pursued)

1. **Phase 0 (Quick Win 1):** Terminal Color Themes → v0.2 release feature
2. **Phase 1 (Quick Win 2):** Agent Action Replay → v0.2.1 release
3. **Phase 2 (Ambitious):** Session Templates → v0.2.2 or v0.3
4. **Phase 3+ (Nice-to-haves):** Terminal Snapshots, Session Replay, Dependency Graph (in that order by user demand)

---

## Notes for Squad

- **Terminal Color Themes** is team-friendly: Summer (design) can define the default palette, Morty ships the code
- **Session Templates** pairs well with Squanchy's Squad expertise — templates are basically lightweight agent configs with more UX polish
- **Session Replay** should be co-designed with Rick (architecture, event model) before implementation
- All 6 proposals stay within Morty's current scope (extension code, no CI/CD or architecture rework)
- None conflict with in-flight work (#422–#442 worktree features, v0.2 refactor)

