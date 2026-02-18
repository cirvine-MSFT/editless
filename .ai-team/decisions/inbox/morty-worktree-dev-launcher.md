# Worktree Dev Launcher as Primary Workflow

**Author:** Morty (Extension Dev)
**Date:** 2026-02-18

## Decision

`scripts/dev-worktree.ps1` is now the recommended primary workflow for EditLess feature development. It replaces the manual worktree + isolated launch steps with a single command.

## What Changed

- **New:** `scripts/dev-worktree.ps1` — one command creates worktree, installs deps, builds, launches isolated VS Code
- **Removed:** `.vscode/mcp-dev.json.example` — EditLess doesn't use webviews; the chrome-devtools MCP example was speculative
- **Removed:** `.vscode/mcp.json` from `.gitignore` — no MCP example to copy from
- **Updated:** `scripts/dev-isolated.ps1` — still available for quick isolated launches but references `dev-worktree.ps1` as primary
- **Updated:** `docs/local-development.md` — worktree workflow is now the first section; MCP section trimmed to a short note

## Impact

- All team members should use `dev-worktree.ps1` for issue-based feature work
- `dev-isolated.ps1` remains for quick one-off isolated launches (no worktree creation)
- The decisions.md "Dev Tooling" entry was updated to reflect the removal of the MCP example
