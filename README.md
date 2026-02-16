# EditLess

> Escape the editor. Free your mind. Command your AI teams all from one place.

Plan work and delegate to AI agents across multiple repos and sessions, then monitor and review everything from one sidebar — no context switching required. One window. One view. Complete control — all without touching the editor. Join the editorless software development revolution!

## What is EditLess?

EditLess is a VS Code extension that gives you a single pane of glass for creating new agents, managing your teams of agents, multitasking across chat sessions, and planning and reviewing work. It's multitasking supercharged — everything you need, right in one place.

Stop jumping between windows, terminals, and repos. Know where all your sessions are and what needs your attention. EditLess brings multi-session, multi-repo AI team management into VS Code's sidebar, letting you manage multiple agents — all without touching the editor.

The editorless AI development workflow puts your mind back in the work, not in navigation. Plan where you want, delegate across your AI team, and see it all come together in one place.

EditLess integrates with GitHub Copilot CLI and includes native support for [Squad](https://github.com/bradygaster/squad), giving you a dedicated UI for creating, managing, and monitoring your AI teams.

New to agentic development? Start here — install EditLess, add a squad, and let the AI do the heavy lifting. You'll wonder how you ever worked without it.

## Installation

### VS Code Marketplace

> 🚧 Coming soon — EditLess will be available directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/).

### Manual Install (VSIX)

1. Download the `.vsix` file from the [latest release](https://github.com/cirvine-MSFT/editless/releases)
2. In VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. Select the downloaded file
4. Reload VS Code

## Features

- 🌳 **Agent tree view** — see all discovered agents in your workspace
- 📋 **Work items** — view GitHub issues and Azure DevOps work items with label filtering
- 🔀 **Pull requests** — track PRs across repos, jump to linked issues
- 💻 **Terminal integration** — launch agent sessions from a work item, pull request, or agent — get to work on what you care about faster, label and organize your sessions, and never lose track of what a session was for
- 🔔 **Notifications** — keep track of what your sessions are doing at a glance, so you never miss a call to action or leave a session idle
- 🔍 **Auto-detection** — discovers agents in your workspace automatically
- 🐙 **GitHub integration** — connect to GitHub issues, pull requests, and repos right from the sidebar
- 🏗️ **Azure DevOps integration** — pull in ADO work items and track progress alongside your agents
- 🔄 **Keep your tools up to date** — EditLess lets you know when updates are available for [GitHub Copilot CLI](https://github.com/github/gh-copilot) and [Squad](https://github.com/bradygaster/squad), so you're always running the latest

## Development

```bash
git clone https://github.com/cirvine-MSFT/editless.git
cd editless
npm install
npm run build
# Press F5 in VS Code to launch Extension Development Host
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style, testing, PR conventions, and the full development guide.

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
