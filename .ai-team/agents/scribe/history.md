# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15

## Learnings


📌 **Team update (2026-02-16):** Documentation animation strategy — EditLess uses optimized GIFs stored in docs/media/ directory. Primary tool: ScreenToGif (Windows). Files must be <1 MB, max 800px width, 3–8 seconds duration. File naming is descriptive kebab-case (e.g., planning-feature.gif). Re-recording triggers documented: UI structure changes, command/shortcut changes, label changes, layout changes. Team reviews animations on code review checklist. — decided by Summer

📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->



📌 **Team update (2026-02-16):** Default release target — All new issues default to elease:v0.1 unless Casey explicitly directs otherwise. This ensures v0.1 work is automatically tagged correctly. — decided by Casey Irvine

📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->



📌 Team update (2026-02-18): v0.2 quality gates established — decided by Rick
