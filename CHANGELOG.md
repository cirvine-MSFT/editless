# Changelog

## [0.1.1] - 2026-02-22

The dogfooding release. After a week of daily-driving 0.1.0, this fixes the rough edges that made real usage painful — broken hierarchy views, race conditions in terminal session tracking, and a CLI settings model that was way over-engineered. If 0.1.0 was "it works," 0.1.1 is "it works when you actually use it all day."

### Added
- Universe auto-detection from squad files (`team.md` Universe marker, `registry.json` fallback)
- Hierarchical filtering for Work Items tree (ADO org→project, GitHub owner→repo drill-down with level filters)
- Hierarchical filtering for Pull Requests tree (same drill-down pattern)
- File preview for work items and PRs
- ADO PR filtering by author when `author:me` is active (`createdBy` / `fetchAdoMe`)

### Changed
- CLI command builder rewritten with typed options (no more `$(agent)` interpolation)
- Simplified CLI settings to a single `editless.cli.additionalArgs` setting
- Default agent ("Copilot CLI") always shown at top of agent tree
- Session state model: launching / active / inactive / orphaned with distinct icons
- Terminal session persistence and reconciliation improvements
- Orphan check deferred until terminal matching settles (fixes race condition)
- Orphaned sessions now show silently in the tree (removed "Resume All" toast)

### Fixed
- ADO org→project hierarchy preserved when only one backend is visible (work items)
- PR tree hierarchy preserved when only one backend is visible
- Terminal session race condition during startup reconciliation

### Removed
- Squad update detection and upgrade indicator (#303) — version checking, persistent badge, `editless.upgradeSquad` / `editless.upgradeAllSquads` commands
- `editless.cli.command`, `editless.cli.launchCommand`, `editless.cli.defaultAgent`, `editless.cli.createCommand` settings (replaced by `editless.cli.additionalArgs`)

## [0.1.0] - 2026-02-16

### Added
- Agent tree view with auto-discovery of `.ai-team/` and `.squad/` directories
- Standalone agent discovery from `.agent.md` files (workspace, `.github/agents/`, `~/.copilot/`)
- Terminal management for AI coding sessions with session labeling and persistence
- CLI provider system with auto-detection (Copilot CLI, Claude, custom CLIs)
- Work Items panel — view GitHub issues and Azure DevOps work items with label filtering
- Pull Requests panel — track PRs across repos with linked issue navigation
- GitHub integration with auto-detection from `git remote`
- Azure DevOps integration with organization/project configuration
- Squad upgrader for Squad CLI teams (removed in 0.1.1 — see below)
- Status bar with inbox monitoring
- Session context and labeling
- Notifications for inbox items and CLI updates
- Auto-refresh for Work Items and PRs (configurable interval + window focus)
- Terminal layout auto-maximize when editor tabs are closed
- Agent visibility management (hide/show agents)
- File watcher for real-time workspace scanning
- Keybinding: `Ctrl+Shift+S` / `Cmd+Shift+S` for Focus Session

### Changed
- Rebranded from Squad Dashboard to EditLess
- Generalized agent management (squads are now a specialized agent type)

### Removed
- Redactor module (not needed for public release)

