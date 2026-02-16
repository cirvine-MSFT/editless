# Getting Started with EditLess

> Edit less, effortless.

## New to Vibe Coding?

If you're new to AI-assisted development, it can feel overwhelming — dozens of tools, frameworks, and agent systems competing for your attention. Here's the simplest path in:

**Start with [Squad](https://github.com/bradygaster/squad).** Squad makes managing AI agent teams easy and fun. It gives your agents names, roles, and a shared memory so they collaborate like a real team. EditLess was designed to work beautifully with Squad from day one.

### Why Squad?

- **Friendly on-ramp** — Squad handles team setup, role assignment, and context sharing so you can focus on what to build, not how to configure agents
- **Works with any CLI** — Copilot CLI, Claude Code, or any agent that runs in a terminal
- **Built-in memory** — agents share decisions, history, and skills across sessions
- **Progressive complexity** — start simple, add sophistication as you learn

### Quick Start

```bash
# Install Squad CLI
dotnet tool install -g Squad

# Create a team in your project
squad init

# Open your project in VS Code with EditLess installed
# Your team appears automatically in the sidebar
```

EditLess auto-discovers Squad teams by scanning for `.squad/` (or `.ai-team/`) directories. No configuration needed.

## Other Recommended Tools

- **[Handy](https://github.com/bradygaster/handy)** — A companion tool for agent workflow automation
- **[SquadUI](https://marketplace.visualstudio.com/items?itemName=csharpfritz.squadui)** — Visualize team state, manage skills, and view the squad dashboard

## The EditLess Philosophy

EditLess is built on a simple idea: **you shouldn't need to edit code to build software.**

Plan, delegate, and review. That's the loop. Your AI agents write the code, run the tests, create the PRs. You make the decisions. Think of yourself as the engineering manager of a team that happens to be AI.

*"Give yourself a promotion — manage your teams of AI agents."*
