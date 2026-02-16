### 2026-02-16: User directive — worktree enforcement reinforced
**By:** Casey Irvine (via Copilot)
**What:** The main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY. Never `git checkout <branch>` there. All coding work must happen in worktrees created via `git worktree add`. Squad file changes (.ai-team/) go on master locally in the main clone, then get PR'd from a separate worktree. This rule was already documented but agents kept violating it — Casey is escalating this to a hard constraint.
**Why:** User request — captured for team memory. Agent spawned for #213 checked out a branch directly on the main clone, breaking Casey's working state. This has happened multiple times despite the existing decision entry.
