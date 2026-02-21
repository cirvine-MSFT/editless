# Orchestration Log: Pseudoterminal Research

**Date:** 2026-02-21T00:56  
**Type:** Research & Assessment Coordination  
**Participants:** Jaguar, Morty, Scribe  

## Spawn Manifest

### Agent 1: Jaguar (Copilot SDK Expert)
- **Mode:** background
- **Task:** Research Copilot CLI args, session ID, --ide flag, status detection
- **Outcome:** Discovered --resume uuid, events.jsonl watching, --acp protocol. No --ide flag exists. Comprehensive CLI flag inventory documented.
- **Output:** `.squad/decisions/inbox/jaguar-copilot-cli-args.md`

### Agent 2: Morty (Extension Dev)
- **Mode:** background  
- **Task:** Analyze pseudoterminal spike vs master for status detection
- **Outcome:** Spike is unfinished POC - copilot-pseudoterminal.ts exists but never wired in. terminal-manager.ts identical on both branches. Regex patterns untested against real CLI. Recommended against merging spike as-is.
- **Output:** `.squad/decisions/inbox/morty-pseudoterminal-assessment.md`

## Cross-Agent Dependencies

**Jaguar → Morty:** Jaguar's discovery that CLI no longer prints `Session ID:` directly validates Morty's concern about the pseudoterminal's fragile regex patterns. The filesystem-based session detection (master approach) is more robust.

**Morty → Jaguar:** Morty's assessment that pseudoterminal would benefit from richer status via `events.jsonl` aligns with Jaguar's recommendation to use `--resume <uuid>` + event watching as integration strategy.

## Next Steps

- **Casey (Owner):** Decides whether to pursue pseudoterminal integration using Jaguar's CLI discovery
- **Scribe (Memory):** Merged decisions into canonical log. Both agents' findings now available for implementation phase.

---

**Archived By:** Scribe  
**Archived At:** 2026-02-21T00:56
