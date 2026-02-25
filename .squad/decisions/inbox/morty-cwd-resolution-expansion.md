# CWD Resolution Expanded to Three Agent Types

**Decided by:** Morty  
**Date:** 2026-02-23  
**Issue:** #403 | **PR:** #412  

## Decision

`resolveTerminalCwd()` now resolves CWD for three agent types instead of one:

1. **Repo agents** (path inside a workspace folder, e.g. `.github/agents/`) → that workspace folder root
2. **Workspace-dir agents** (any path inside a workspace folder) → that workspace folder root
3. **Personal agents** (`~/.copilot/agents/`, outside workspace) → first workspace folder

**Priority:** workspace folder membership is checked first (covers repo + workspace-dir agents), then personal agent `.copilot/agents` regex fallback. This means repo agents whose path happens to contain `.copilot/agents` will be resolved by the workspace folder match (correct behavior) rather than the personal agent fallback.

## Rationale

The v0.1.2 implementation only handled personal agents, causing repo-defined agents and workspace-dir agents to launch terminals in their agent directory instead of the project root. This broke workflows where the agent needs access to workspace files.

## Impact

- `src/terminal-manager.ts` — `resolveTerminalCwd()` expanded
- Both call sites (`launchTerminal`, `relaunchSession`) unchanged — they already call `resolveTerminalCwd(config.path)`
- 7 new tests, 842 total passing
