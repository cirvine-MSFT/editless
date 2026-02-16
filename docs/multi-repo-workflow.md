# Multi-Repo Workflow

> Don't open VS Code in a repo. Open it in a central folder and work across multiple repos at the same time.

## The Mindset Shift

Traditional development: open a repo, edit files, commit.

EditLess development: open a workspace, manage agents across repos, plan and delegate and review.

This is the core workflow insight — **think in terms of agents and work, not editors and files.**

## How It Works

1. **Open a parent folder** that contains your repos:

```
~/projects/
├── frontend/       # React app with Squad team
├── backend/        # API service with Squad team
├── shared-lib/     # Shared utilities
└── infrastructure/ # Terraform configs
```

2. **EditLess discovers agents automatically** from all subdirectories. Your sidebar shows every team across every repo.

3. **Configure additional repos** if they live elsewhere:

```jsonc
// settings.json
"editless.discovery.scanPaths": [
    "~/other-projects/mobile-app",
    "~/other-projects/data-pipeline"
]
```

4. **Work items span repos** — the Work Items and PRs panels aggregate across all configured GitHub repositories:

```jsonc
"editless.github.repos": [
    "myorg/frontend",
    "myorg/backend",
    "myorg/shared-lib"
]
```

## Why This Matters

When you're managing AI agents, context switching between repos is expensive. Opening each repo in a separate window means:
- Losing visibility into what other agents are doing
- Missing cross-repo decisions and dependencies
- No unified view of work items and PRs

With EditLess's multi-repo view, you see everything in one place. Delegate a frontend task, check on the backend PR, review a shared library decision — all without switching windows.

## Tips

- **Pin your workspace folder** — use a consistent parent directory for all your projects
- **Use label filters** — filter work items by label to focus on one repo's issues at a time
- **Launch sessions from any repo** — click any agent to start a terminal session in their repo's directory
