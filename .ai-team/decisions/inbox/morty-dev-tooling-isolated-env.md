# Dev Tooling: Isolated Environment Strategy

**Date:** 2026-02-18  
**Status:** Implemented  
**Context:** Local development setup for EditLess extension

## Decision

EditLess uses isolated VS Code environments for extension development to ensure clean testing without interference from personal VS Code configurations or other extensions.

## Implementation

1. **`.vscode/launch.json`** — Three debug configurations:
   - "Run Extension" — standard F5 Extension Development Host with pre-build task
   - "Run Extension (Isolated)" — clean environment using `--user-data-dir` and `--disable-extensions`
   - "Extension Tests" — runs vitest integration tests in Extension Development Host

2. **`.vscode/tasks.json`** — Build automation:
   - `npm: build` — default build task (required by launch configs)
   - `npm: watch` — background watch task with esbuild problem matcher

3. **`scripts/dev-isolated.ps1`** — PowerShell script for manual isolated launches:
   - Creates `.editless-dev/user-data/` directories
   - Launches VS Code with isolation flags
   - Includes `-Clean` switch to reset environment
   - Validates extension build before launching

4. **`.vscode/mcp-dev.json.example`** — Example MCP configuration:
   - chrome-devtools-mcp for webview debugging
   - Template to copy to `.vscode/mcp.json` (gitignored)

5. **`.gitignore`** — Updated to exclude:
   - `.editless-dev/` — isolated test environments
   - `.vscode/mcp.json` — personal MCP dev configs
   - `.vscode/launch.json` IS committed (team-wide config)

## Rationale

Isolated environments are critical for:
- Testing first-run activation and default settings
- Reproducing bugs without personal config interference  
- Verifying no conflicts with other extensions
- Clean state for each test run (via `-Clean` flag)

The three-way approach (debug config, tasks, and script) supports different workflows: F5 debugging in VS Code, manual script launches for testing, and automated builds.

## Key Patterns

- **Isolation flags:** `--user-data-dir=<path>` + `--disable-extensions` + `--extensionDevelopmentPath=<path>`
- **preLaunchTask:** All debug configs reference `${defaultBuildTask}` so esbuild runs before launch
- **Hidden terminals:** Build tasks use `hideFromUser: true` (see #127 decision)
- **Personal vs team config:** `.vscode/launch.json` and `.vscode/tasks.json` are committed; `.vscode/mcp.json` is gitignored

## Impact

This tooling is now the standard for all EditLess extension development. Team members should use "Run Extension (Isolated)" for bug reproduction and first-run testing, and the standard "Run Extension" config for daily development with their personal setup.

---

**Author:** Morty (Extension Dev)
