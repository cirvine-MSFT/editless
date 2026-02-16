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
- 🐙 **GitHub integration** — connect to GitHub issues and pull requests
- 🏗️ **Azure DevOps integration** — pull in ADO work items and pull requests 
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

## 🚀 Take the Challenge

AI agents and models have gotten so good — and tools like MCPs have matured so much — that you don't actually need to be in an editor or bounce between web UIs to manage your work anymore. You can plan by asking an agent to summarize and visualize your backlog. You can create work items, open PRs, review code, and check on progress — all through conversation. The editor isn't the center of your workflow anymore. **The conversation is.**

We believe chat will become the IDE of the future — where you manage multiple teams of agents directly through conversation. EditLess is a step along that path.

**Here's the challenge:** break free from the habit of needing to be in an editor to get things done.

1. **Install EditLess** and [GitHub Copilot CLI](https://github.com/github/gh-copilot)
2. **Add a [Squad](https://github.com/bradygaster/squad)** to any project — even a brand new one
3. **Let your agents create work items, open PRs, and review code for you** — all from a chat window
4. **Review the results** without ever opening another tab, window, or web UI

That's it. One extension, one sidebar, one conversation. You'll go from zero to managing AI agents in minutes — and you'll wonder why you ever did it any other way.

No experience with agentic development required. No complex setup. Just install, point, and let the AI do the heavy lifting. The editorless revolution starts with a single click.

## 💡 Quick Tips

- **Try squads without touching your team's repo.** You don't need to add [Squad](https://github.com/bradygaster/squad) to your work project to try it out. Create a personal repo, add a squad there, and tell your agents to work across your other repos. It's a great way to experiment without changing anything in your team's workspace.

- **Talk to your agents.** Supercharge the conversational workflow with a speech-to-text tool like [Handy](https://handy.computer/) — it's free, open-source, and runs offline. Or use the built-in dictation on Windows (`Win + H`) or macOS. Once you start talking directly to your AI team instead of typing, you'll never go back.

- **Use [SquadUI](https://marketplace.visualstudio.com/items?itemName=csharpfritz.squadui) for a richer dashboard.** It adds team visualization, skill management, and a squad dashboard right in VS Code. EditLess integrates with it — you'll see "Open in Squad UI" in your context menus.

- **Use [git worktrees](https://git-scm.com/docs/git-worktree) for parallel agent work.** Worktrees let multiple agents work on the same repo simultaneously — each in its own branch, each in its own directory. No checkout conflicts, no stepping on each other's work. If you're running multiple sessions across the same project, worktrees are a game changer.

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
