# Orchestration Log: 2026-02-21T0106 — Pseudoterminal Decision

**Date:** 2026-02-21  
**Agents Spawned:** Rick (Lead), Jaguar (Copilot SDK Expert)  
**Mode:** Background analysis  
**Outcome:** Architecture trade-off analysis complete. Recommendation: **Do NOT ship pseudoterminal.** Use regular terminal + events.jsonl + --resume instead.

---

## Spawn Manifest

| Agent | Role | Task | Outcome |
|-------|------|------|---------|
| **Rick** | Lead | Architecture trade-off analysis: pseudoterminal vs regular terminal + events.jsonl | Recommended against shipping pseudoterminal. Regular terminal + events.jsonl + --resume is simpler, works today, and transfers to ACP. Filed decision doc. |
| **Jaguar** | Copilot SDK Expert | Revisit pseudoterminal value with --resume, events.jsonl, --acp findings | Confirmed pty + events.jsonl works but pty + --acp are mutually exclusive. ACP is the real integration future. Hide/show advantage is real but not decisive. |

---

## Analysis Summary

### Rick's Findings: Pseudoterminal Trade-off

- **Regular terminal + events.jsonl + --resume** ✅
  - Real-time state detection via file watching (no terminal I/O parsing)
  - Accurate session resumption via pre-generated UUID
  - VS Code terminal API handles I/O natively
  - Shell features work (tab completion, history, aliases)
  - Path forward to ACP (no rework needed)
  
- **Pseudoterminal + events.jsonl** ❌
  - Loses shell features (no tab completion, history, aliases)
  - Extra maintenance burden (fragile I/O parsing, state detection patterns)
  - Windows doesn't support PTY resizing
  - Duplicates state detection (events.jsonl already solved this)
  - Fragile: depends on CLI output format staying stable
  - Dead end when --acp ships (will be ripped out)

**Conclusion:** Cost/benefit is terrible. Pseudoterminal is architecturally unnecessary. Regular terminal solves all problems.

### Jaguar's Findings: PTY + --resume + --acp Compatibility

- **PTY + --resume + events.jsonl** ✅ Works (no conflicts)
- **PTY + --acp** ❌ Mutually exclusive (different I/O models)
- **Hide/show behavior** ✅ Real UX advantage (process persistence), but not decisive enough to justify pseudoterminal complexity
- **CLI team preference:** Two paths — Terminal + filesystem (current) or ACP (future-proof). Pseudoterminal is a third path that CLI team didn't design for.

**Conclusion:** ACP is the real integration future. Pseudoterminal skills don't transfer. Recommendation: Track ACP as Phase 3 effort.

---

## Decision Record

**Status:** ✅ Recommended (awaiting Casey approval)  
**Owner:** Rick (Lead)  
**Filed:** 2026-02-21  

### Recommendation: **Do NOT build the pseudoterminal**

1. Use **regular terminal + events.jsonl + --resume** (Phase 1)
2. Track **ACP client integration** for v0.3+ (Phase 3+)
3. Archive pseudoterminal spike (it's exploratory work, not failure)
4. Delete `copilot-pseudoterminal.ts` (284 lines of unused code)

### Next Actions

- [ ] Casey reviews and approves recommendation
- [ ] Document decision in issue #321
- [ ] Delete pseudoterminal spike code
- [ ] Extend TerminalManager for `--resume` workflow
- [ ] Build events.jsonl watcher (low cost, high value)
- [ ] Plan ACP integration for future phase

---

## Files Generated

- `.squad/decisions/inbox/rick-pseudoterminal-decision.md`
- `.squad/decisions/inbox/jaguar-pty-acp-analysis.md`
