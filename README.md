# EditLess

> Escape the editor. Command your AI teams from one pane of glass.

Plan work and delegate to AI agents across multiple repos and sessions, then monitor and review everything from one sidebar — no context switching required. One window. One view. Complete control.

## What is EditLess?

Stop jumping between windows, terminals, and repos. Know where all your sessions are and what needs your attention. EditLess brings multi-session, multi-repo AI team management into VS Code's sidebar, letting you manage multiple agents without leaving the sidebar — all without touching the editor.

The editorless AI development workflow puts your mind back in the work, not in navigation. Plan where you want, delegate across your AI team, and see it all come together in the sidebar. Join the editorless software development revolution.

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

## Documentation

- [The EditLess Story](docs/philosophy.md) — Why EditLess exists and the editorless philosophy
- [Getting Started](docs/getting-started.md) — New to vibe coding? Start here
- [Multi-Repo Workflow](docs/multi-repo-workflow.md) — Working across multiple repos
- [GitHub Workflow](docs/workflows/github-workflow.md) — Managing work with AI agents on GitHub
- [ADO Workflow](docs/workflows/ado-workflow.md) — Managing work with AI agents on Azure DevOps

## Companion Extensions

- **[SquadUI](https://marketplace.visualstudio.com/items?itemName=csharpfritz.squadui)** — Visualize team state, manage skills, view the squad dashboard. When SquadUI is installed, EditLess adds "Open in Squad UI" to squad context menus for quick cross-linking.

## License

[MIT](LICENSE)
