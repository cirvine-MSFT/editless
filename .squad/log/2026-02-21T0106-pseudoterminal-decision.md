# Session Log: 2026-02-21T0106 — Pseudoterminal Decision

**Date:** 2026-02-21  
**Work:** Architecture analysis spike on pseudoterminal integration  
**Agents:** Rick (Lead), Jaguar (Copilot SDK Expert)  
**Outcome:** Recommendation filed: **Do NOT ship pseudoterminal. Use regular terminal + events.jsonl + --resume instead.**

## Findings

- **Regular terminal + events.jsonl + --resume** solves all problems without losing shell features
- **Pseudoterminal** adds maintenance debt, loses tab completion/history/aliases, becomes dead code when --acp ships
- **PTY + --acp are mutually exclusive** (different I/O models)
- **Hide/show UX advantage is real but not decisive** enough to justify complexity

## Decision

Recommended: Archive pseudoterminal spike. Track ACP for future phase. Delete unused code.

## Next Actions

1. Casey reviews recommendation
2. Delete `copilot-pseudoterminal.ts`
3. Build events.jsonl watcher (Phase 1)
4. Plan ACP integration (Phase 3+)
