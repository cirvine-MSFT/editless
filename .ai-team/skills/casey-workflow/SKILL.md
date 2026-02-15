---
name: "casey-workflow"
description: "Casey's preferred workflow patterns for PRs, planning, git worktrees, ADO integration, and team communication"
domain: "workflow-conventions"
confidence: "high"
source: "manual"
---

## Context

These are Casey Irvine's established workflow patterns. All agents on this project must follow them. This skill was imported from Casey's cross-project workflow summary.

## Patterns

### Interaction Style
- Casey is conversational, not document-driven. He talks through plans and has things visualized.
- He dictates using "Handy" — expect phonetic misspellings, repeated words, stuttered phrases. Interpret intent, don't treat literally.
- Auth-gated commands: nudge Casey to run manually. Don't waste time working around auth failures.

### Git Worktrees
- Every feature branch gets its own worktree: `{repo}.wt/{branch-name}/`
- Branch naming: `users/{alias}/{feature-name}`
- **Never delete branches** — branch deletion is exclusively a human operation.
- Always run `git worktree list` before starting work to confirm correct worktree.

### Comment Style (Code)
- **No verbose comments.** Code should be self-documenting through readable, well-named functions.
- **Why-comments only.** Comment when explaining: a feature wasn't available, a workaround was needed, something wasn't working as expected, or a non-obvious decision was made.
- Never comment "what" the code does — that's the function name's job.

### PR Lifecycle (Three Stages)
1. **DRAFT** — All PRs start as drafts. Queue unofficial builds, run tests, self-review, iterate. Don't publish until green.
2. **PUBLISHED** — Official validation gates run. Triage automated comments (valid → fix, false positive → "won't fix", unclear → escalate).
3. **POSTED** — Ready for human review. Post to PR channel.
- Merge with: squash, delete source branch, complete linked work items.

### Continuation Chain
When work completes a step with a known successor, fire the next step automatically:
- Code committed → queue validation
- Build succeeded → run tests
- Tests passed → create/update PR (draft)
- PR created → self-review the diff
- Self-review passed → mark ready for review + notify Casey

### Work Item Lifecycle
- States: New → Active → Resolved → Closed
- Mark Active as FIRST ACTION before any implementation.
- Never close/resolve until associated PR is merged.

### External Communication
- AI attribution required: prefix with `🤖 *internal-project:*`
- No internal agent names externally (say "the team", not agent names)
- Emails: formal tone, no emoji, "drafted by AI" in footer

### Session Naming
Include both WI/PR number AND description: `bug-43948-dalec-sha-migration`

## Anti-Patterns
- **Closing work items before PR merges** — work isn't done until code lands.
- **Silent actions** — every action gets a comment on PRs/work items.
- **Deleting branches** — never, under any circumstances.
- **Skipping draft stage** — always draft first, validate, then publish.
- **Verbose code comments** — wrap logic in readable functions instead.
- **"What" comments** — only "why" comments that capture decisions and workarounds.
