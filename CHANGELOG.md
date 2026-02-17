# Changelog

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
- Squad upgrader for Squad CLI teams
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
