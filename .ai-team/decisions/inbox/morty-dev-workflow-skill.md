### 2026-02-18: EditLess dev workflow skill created

**By:** Morty

**What:** Created `.ai-team/skills/editless-dev-workflow/SKILL.md` documenting `scripts/dev-worktree.ps1` as the primary workflow for issue-driven development. Also: EditLess Squad does NOT use caseybot tools (Manage-Worktree.ps1, etc.) — those were bootstrapping only.

**Why:** Agents need to discover the dev-worktree script when asked to work on issues. Without the skill, they'd try the missing Manage-Worktree.ps1 or fall back to manual git commands. The skill includes all parameters, examples, branch naming conventions, anti-patterns, and integration notes to make adoption immediate and unambiguous.
