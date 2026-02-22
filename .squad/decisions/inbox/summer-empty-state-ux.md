# Empty State & Onboarding UX

**Decided by:** Summer  
**Date:** 2026-02-22  
**Issue:** #339

## Decision

The EditLess tree view now shows three distinct empty states:

1. **First-time / empty workspace** (zero squads, zero discovered items, nothing hidden):
   - `$(rocket)` "Welcome to EditLess" — description: "Get started below"
   - `$(add)` "Add a squad directory" — click triggers `editless.addSquad`
   - `$(search)` "Discover agents in workspace" — click triggers `editless.discoverSquads`

2. **All items hidden** (squads exist but all are hidden):
   - `$(eye-closed)` "All agents hidden — use Show Hidden to restore" (unchanged)

3. **Squad with zero sessions** (squad registered, no terminals running):
   - `$(info)` "No active sessions" — description: "Click + to launch"

## Rationale

- A first-time user who sees "No agents yet — use + to add" doesn't know what an agent is or what + does. The new welcome state provides two clear, clickable actions.
- The "All agents hidden" message is only relevant to returning users who explicitly hid items — it should never appear on first launch.
- The per-squad "No active sessions" hint prevents confusion when a squad is expanded but empty.

## Icon Conventions

| Icon | Meaning |
|------|---------|
| `rocket` | Welcome / getting started |
| `add` | Create / add action |
| `search` | Discover / scan action |
| `info` | Informational hint |
| `eye-closed` | Hidden state (power user) |
