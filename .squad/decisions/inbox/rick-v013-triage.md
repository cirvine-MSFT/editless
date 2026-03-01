# v0.1.3 Triage: Issues #420, #419, #415

**Date:** 2026-02-24  
**Triaged by:** Rick (Lead)  
**Status:** Assigned to squad members

---

## Summary

Triaged 3 untriaged v0.1.3 issues. All assigned to squad members. No issues suitable for autonomous @copilot work (1 needs SDK expertise, 2 are extension UI fixes with design nuance).

---

## Routing Decisions

### Issue #420: Copilot CLI missing from agent picker
- **Assigned to:** Jaguar (Copilot SDK Expert)
- **Type:** Bug
- **Capability:** 🟡 Needs review (SDK integration bug)
- **Reasoning:** Bug involves agent registration and picker logic. Requires Copilot SDK expertise to trace registration flow, agent filtering, and verify correct agent is being published to picker. Not a simple extension code fix — SDK understanding is critical.
- **Priority:** Medium
- **Labels:** `squad`, `squad:jaguar`

### Issue #419: Squad roster '+' button UX confusion
- **Assigned to:** Morty (Extension Dev)
- **Type:** Bug (UX)
- **Capability:** 🟢 Good fit (TreeView UI fix)
- **Reasoning:** Pure VS Code TreeView provider issue. Roster agents are non-launchable reference entries; launch button shouldn't render for them. Straightforward conditional UI logic in tree component. Well-defined scope, no design ambiguity.
- **Priority:** Medium
- **Labels:** `squad`, `squad:morty`

### Issue #415: Feature request — resume external session
- **Assigned to:** Morty (Extension Dev)
- **Type:** Feature
- **Capability:** 🟡 Needs review (medium feature, clear spec, sequenced)
- **Reasoning:** Feature is well-specified by Summer (full UX spec in issue comments). Touches terminal-manager.ts and requires new command + QuickPick UI. Medium complexity with clear acceptance criteria. **Critical sequencing:** Wait for PRs #410–#414 to merge (#412 and #414 both modify terminal-manager.ts; #414 adds 'attention' session state used by resume flow). Implementing on clean post-merge base avoids conflicts and reduces risk of rework.
- **Priority:** Medium (sequenced, not urgent until dependencies merge)
- **Labels:** `squad`, `squad:morty`

---

## @copilot Evaluation

No issues routed to `squad:copilot`. Reasoning:

- **#420:** Requires Copilot SDK expertise outside @copilot's general coding capability. Jaguar needed to verify SDK integration assumptions.
- **#419:** While 🟢 good fit for @copilot (straightforward UI fix), Morty owns all TreeView code and should maintain consistency in tree logic patterns. Keeping with squad member preferred.
- **#415:** Feature with sequencing dependency. Better handled by squad member who can coordinate with Morty's other v0.1.3 work and understand terminal-manager.ts context.

---

## Next Steps

1. Jaguar to pick up #420 — diagnose agent registration flow
2. Morty to pick up #419 (immediate) — roster button UX fix
3. Morty to track #415 sequencing — don't start until #410–#414 merged
