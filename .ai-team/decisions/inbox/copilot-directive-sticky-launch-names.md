### 2026-02-17: User directive — sticky terminal names from Launch with Agent
**By:** Casey Irvine (via Copilot)
**What:** When a terminal is launched via "Launch with Agent" from a work item or PR, the terminal title should be treated as a sticky label (same as a user-initiated rename). It should not be overridden by session context summaries or auto-rename logic.
**Why:** User request — captured for team memory. The session context resolver currently overwrites terminal names, which loses the meaningful "#42 Fix auth timeout" titles that came from work items/PRs.
