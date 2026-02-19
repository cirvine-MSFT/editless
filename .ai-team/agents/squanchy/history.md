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

### 2026-02-20: Squad Terminal Integration Research

**Core insight:** Squad operations are NOT one-terminal-per-agent. The coordinator orchestrates in ONE session; agents run as subprocesses (CLI: `task` tool with `mode: "background"`, VS Code: `runSubagent` parallel). When coordinator says "Team: 4 agents working," that's ONE terminal doing orchestration, not 4 terminals. EditLess must never show "N terminals for N agents."

**Terminal state mapping:**
- Current SessionState enum ('working', 'idle', 'waiting-on-input', 'stale', 'orphaned') maps cleanly to squad operations EXCEPT Ralph
- Ralph (work monitor) is a long-running loop (scan → spawn → scan) that needs a new 'monitoring' state
- Ceremonies and parallel fan-outs are transient "working" states — no new states needed

**Activity signals (highest value → lowest):**
1. **`decisions/inbox/` is the heartbeat** — files appear when agents work, disappear when Scribe merges. Badge count = real-time activity indicator.
2. **`workspace.yaml` summary field** — tells you exactly what the session is doing. Use in terminal names: `🚀 EditLess — Rick: auth refactor`
3. **`orchestration-log/*.md` spawn evidence** — shows which agents were spawned, when, why, outcomes. Parse for "recent activity" tooltip.
4. **`workspace.yaml` branch field** — critical for worktree workflows. Include in name when multiple terminals exist.
5. **`events.jsonl` tool calls** — parse for agent names in `task` tool arguments. Enables progress tracking ("3/4 agents complete").

**Terminal naming strategy (tiered):**
- Tier 1: Auto-detect from summary: `🚀 EditLess — Rick: refactoring auth`
- Tier 2: Detect ceremonies: `🚀 EditLess — 📋 Design Review`
- Tier 3: Detect Ralph: `🚀 EditLess — 🔄 Ralph: monitoring`
- Tier 4: Fallback: `🚀 EditLess #1`

**Special terminal types:**
- **Ralph:** Detached long-runner, 'monitoring' state, shows elapsed time + recent spawns in tooltip
- **Ceremonies:** Facilitator-led sequential participant spawns, show progress ("2/3 participants collected")
- **Worktree sessions:** Include branch in name when multiple terminals for same squad

**Agent Mode vs CLI:** Same `workspace.yaml`/`events.jsonl` structure. SessionContextResolver doesn't care which. EditLess should track both as "owned" (launched by EditLess) vs "unowned" (Agent Mode / external CLI) sessions.

**Prioritized improvements (MVP):**
1. Decision inbox badge (`📥 3` when non-empty) — 1-2h, high value
2. Session summary in terminal name (from `workspace.yaml`) — 2-3h, high value
3. Branch in terminal name (when multiple per squad) — 1h, medium value
4. Parse orchestration log for agent activity tooltip — 4-6h, high value
5. Ralph 'monitoring' state — 2-3h, medium value

**Data that should NOT drive terminal UX:** `agents/*/charter.md`, `agents/*/history.md`, `decisions.md` content, `ceremonies.md` config. These are orchestration inputs, not terminal state signals.

📌 **Team update (2026-02-19):** Squad-specific terminal integration research merged — Squanchy's mental model work (one terminal = one coordinator session, NOT one per agent) shaped the entire Phase 3-4 direction. Key integration signals: `decisions/inbox/` as heartbeat, `workspace.yaml` summary for naming, `orchestration-log/*.md` for recent activity, `workspace.yaml` branch for worktree support. The activity signal hierarchy (inbox badge → summary → spawn evidence) informs both terminal state detection and tree view context. Research document filed in decisions.md. — decided by Rick

📌 **Team update (2026-02-19):** Terminal integration research session complete — 4-phase architecture plan and 27-item priority matrix. Session log at .ai-team/log/2026-02-19-terminal-integration-research.md. — documented by Scribe


📌 Team update (2026-02-19): Session rename & resume architectural decisions finalized. Key decisions: (1) Display dual names (EditLess + Copilot summary), (2) Fix #277 with TerminalOptions, (3) Create custom Copilot Sessions tree view, (4) No write-access to workspace.yaml. — decided by Casey Irvine
