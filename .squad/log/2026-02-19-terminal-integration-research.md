# 2026-02-19: Terminal Integration Research Session

**Requested by:** Casey Irvine

**Participants:**
- **Jaguar** — Copilot CLI terminal integration API analysis
- **Morty** — Terminal code audit
- **Squanchy** — Squad-specific terminal scenarios  
- **Rick** — Synthesis and unified architecture

---

## Work Completed

### Jaguar: Copilot CLI Terminal Integration API Analysis
- Analyzed Copilot CLI flags and VS Code terminal APIs
- Mapped terminal state detection patterns
- Identified session management integration points
- Stabilized APIs: TerminalOptions, shell integration (VS Code 1.93+), exitStatus tracking
- Key finding: No public API for VS Code Copilot extension terminal integration; relying on session-state file monitoring

### Morty: Terminal Code Audit
- Identified 16 bugs in existing terminal handling code
- Found 8 unused or deprecated APIs in terminal management
- Audited SessionState enum and state transitions
- Mapped feature gaps for phase-based implementation

### Squanchy: Squad-Specific Terminal Scenarios
- Analyzed multi-agent orchestration patterns
- Clarified mental model: ONE terminal per coordinator session, NOT one per agent
- Mapped squad-specific naming requirements
- Identified activity signals: inbox, workspace.yaml, orchestration logs
- Categorized terminal types: standard sessions, Ralph (monitoring), ceremonies

### Rick: Synthesis and Unified Architecture
- Consolidated all three research streams
- Created 4-phase implementation plan
- Built 27-item priority matrix
- Documented decision rationale in team decisions.md

---

## Key Decisions

1. **sendText Race Condition Fix:** Send text BEFORE showing terminal
2. **Transient Flag Strategy:** Use VS Code `isTransient` for ephemeral sessions
3. **Session State Caching:** CWD-indexed session cache for fast lookups
4. **Terminal Coordination Model:** One terminal per coordinator session
5. **Activity Signals (Ranked):**
   - `decisions/inbox/` as heartbeat
   - `workspace.yaml` summary for naming
   - `orchestration-log/*.md` for spawn evidence
   - `workspace.yaml` branch for worktree support
   - `events.jsonl` tool calls for progress

---

## Artifacts

- Terminal integration research documented in `.ai-team/decisions.md`
- 4-phase implementation plan with 27-item priority matrix
- Agent history updates appended to Jaguar, Morty, Squanchy, Rick

---

**Status:** Complete  
**Date:** 2026-02-19
