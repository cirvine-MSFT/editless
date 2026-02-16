# EditLess

> Plan, delegate, and review your AI team's work — the editorless development panel.

## What is EditLess?

EditLess is a VS Code sidebar panel for managing AI coding agents. It auto-discovers agent teams in your workspace by scanning for `.squad/` (or `.ai-team/`) directories, gives you terminal integration for launching and managing agent sessions, and supports multiple CLI providers (Copilot, Claude, and others) with auto-detection.

EditLess uses progressive feature detection — features light up as tools are found in your environment. If you have no CLI tools installed, you still get basic terminal management. If you're working with [Squad CLI](https://github.com/bradygaster/squad) teams, you get enhanced features like roster views, decisions tracking, and activity monitoring. Nothing shows unless it's relevant.

## Installation

EditLess is currently distributed via GitHub Releases.

1. Download the `.vsix` file from the [latest release](https://github.com/cirvine-MSFT/editless/releases)
2. In VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the downloaded file
4. Reload VS Code

## Features

- 🌳 **Agent tree view** — see all discovered agent teams in your workspace
- 💻 **Terminal integration** — launch and manage agent sessions with session state tracking
- 📋 **Work items** — view GitHub issues and Azure DevOps work items with label filtering
- 🔀 **Pull requests** — track PRs across repos, jump to linked issues
- 🔔 **Notifications** — desktop alerts for inbox items and CLI updates
- 🔄 **Auto-refresh** — work items and PRs poll on a configurable interval
- 🔍 **Auto-detection** — discovers CLI tools and agent teams automatically
- 📊 **Status bar** — quick glance at inbox items and agent status
- 🏷️ **Session labels** — organize and tag your sessions
- 🔄 **Squad upgrader** — keep Squad CLI teams up to date

## Development

```bash
git clone https://github.com/cirvine-MSFT/editless.git
cd editless
npm install
npm run build
# Press F5 in VS Code to launch Extension Development Host
```

## Workflow Documentation

- [Getting Started](docs/getting-started.md) — New to vibe coding? Start here
- [Multi-Repo Workflow](docs/multi-repo-workflow.md) — Working across multiple repos
- [GitHub Workflow](docs/workflows/github-workflow.md) — Managing work with AI agents on GitHub
- [ADO Workflow](docs/workflows/ado-workflow.md) — Managing work with AI agents on Azure DevOps

## Companion Extensions

- **[SquadUI](https://marketplace.visualstudio.com/items?itemName=csharpfritz.squadui)** — Visualize team state, manage skills, view the squad dashboard. When SquadUI is installed, EditLess adds "Open in Squad UI" to squad context menus for quick cross-linking.

## License

[MIT](LICENSE)
