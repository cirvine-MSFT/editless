# Project Context

- **Owner:** Casey Irvine (cirvine@microsoft.com)
- **Project:** EditLess — a VS Code extension for managing AI agents, terminal sessions, and work items.
- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Created:** 2026-02-15

## Learnings


📌 **Team update (2026-02-16):** Worktree enforcement reinforced to hard constraint — Git checkout violations (agent on #213 checked out branches on the main clone instead of using worktrees) have happened repeatedly despite existing documentation. The rule is now a non-negotiable constraint enforced through code review: the main clone (C:\Users\cirvine\code\work\editless) is PULL-ONLY, all feature branch work must use git worktrees. Violations must be caught and rejected in PR review. — reinforced by Casey Irvine
<!-- Append new learnings below. Each entry is something lasting about the project. -->

