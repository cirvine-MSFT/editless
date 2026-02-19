# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items. The "editorless IDE" panel.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15
- **Repo:** cirvine-MSFT/editless (private)

## Learnings

- EditLess is the UI layer for Squad-managed AI teams. The `.ai-team/` directory structure is the primary state surface that EditLess reads and displays.
- Squad framework lives at `bradygaster/squad`. The `squad.agent.md` file is the authoritative governance document for agent orchestration.
- Key integration points: `.ai-team/team.md` (roster), `.ai-team/decisions.md` (decision ledger), `.ai-team/agents/*/charter.md` (agent identity), `.ai-team/agents/*/history.md` (agent memory), `.ai-team/orchestration-log/` (spawn evidence).
- EditLess uses progressive feature detection — features light up based on what's installed. Squad features should follow this pattern: detect `.ai-team/` → connect → surface.
- The main clone (`C:\Users\cirvine\code\work\editless`) is PULL-ONLY. All feature work uses git worktrees.
<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-02-20: Deep Squad Framework Analysis

- **Squad v0.4.1 architecture:** No runtime daemon or event bus. All state is files in `.ai-team/`. The integration surface is pure file-watching. This is a deliberate architectural choice — Squad's state is git-native and portable.
- **CLI commands:** `init` (default), `upgrade`, `copilot [--off] [--auto-assign]`, `plugin marketplace add|remove|list|browse`, `export [--out path]`, `import <file> [--force]`. Total code: 654-line `index.js`.
- **Governance file (`squad.agent.md`):** ~1,771 lines. Contains: coordinator identity, init mode (2 phases), team mode (routing, response modes, model selection), spawn templates (standard/lightweight/ceremony), drop-box pattern, ceremonies, Ralph (work monitor), casting (33 universes), worktree awareness, VS Code compatibility layer.
- **Drop-box pattern is THE integration signal:** Agents write to `decisions/inbox/{name}-{slug}.md`. Scribe merges into `decisions.md` and deletes inbox files. The inbox directory is the only real-time indicator that agents are producing output. EditLess should monitor this as a heartbeat.
- **VS Code mode in Squad:** Uses `runSubagent` instead of `task` tool. No per-spawn model selection (accepts session model). No background mode (all subagents sync). Scribe batched as last subagent. This means EditLess doesn't need to bridge Squad's model selection with Copilot's.
- **10 GitHub Actions workflows** ship with Squad: squad-ci, squad-docs, squad-heartbeat (Ralph), squad-issue-assign, squad-label-enforce, squad-main-guard, squad-preview, squad-release, squad-triage, sync-squad-labels.
- **`.ai-team/` → `.squad/` rename** planned for v0.5.0 (see bradygaster/squad#69). EditLess already handles both via `team-dir.ts`.
- **EditLess gap analysis:** Today EditLess reads `team.md` (roster), checks mtimes in `log/` and `orchestration-log/`, and watches `.ai-team/**/*`. It does NOT read: `decisions.md`, `decisions/inbox/`, `agents/*/charter.md`, `agents/*/history.md`, `orchestration-log/*.md` content, `log/*.md` content, `skills/`, `ceremonies.md`, `casting/`, or `plugins/`.
- **Highest-value integration points:** (1) Decision inbox monitor (badge/notification), (2) Agent detail click-through (charter + history preview), (3) Orchestration timeline, (4) Session log browser. All are file-read operations that work with the existing watcher.
- **Watcher enhancement needed:** Current `SquadWatcher` fires a single callback for ANY `.ai-team/` change. To support per-file-type reactions (inbox badge vs roster refresh), should pass the changed file path to the callback.
