# Hidden terminals must exit and have completion listeners

**By:** Morty (Extension Dev)
**Date:** 2026-02-16
**Issue:** #232

**What:** When using `hideFromUser: true` terminals for background work (like `npx squad init`), always:
1. Append `; exit` to the `sendText` command so the shell closes after the command finishes
2. Register an `onDidCloseTerminal` listener to detect completion and perform follow-up actions

**Why:** `terminal.sendText()` is fire-and-forget — the shell stays open after the command completes. With `hideFromUser: true`, the user has no way to see the terminal or close it manually. Without `; exit`, the terminal lingers forever. Without a close listener, there's no mechanism to act on completion (e.g., registering a newly initialized squad).

**Impact:** Any future feature that uses hidden terminals for background work should follow this pattern. The addSquad handler (#127 added `hideFromUser: true` but didn't add the completion handling) was the first case — this decision prevents the same class of bug.
