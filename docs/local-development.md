# Local Development Guide

> How to develop EditLess locally while keeping your production setup safe.

EditLess developers face a unique challenge: we use the tool we're building. This guide covers how to test changes without breaking your daily workflow.

<!-- TODO: Add GIF recording showing side-by-side extension instances in use -->

---

## Worktree Dev Workflow (Recommended)

The primary workflow uses `scripts/dev-worktree.ps1` to create a git worktree for an issue and launch an isolated VS Code instance — all in one command.

### Quick Start

```powershell
# From your daily driver terminal (main clone or any worktree):
.\scripts\dev-worktree.ps1 -Issue 42
```

This will:
1. Fetch the issue title from GitHub and generate a branch slug
2. Create a worktree at `../editless.wt/{slug}` with branch `squad/42-{slug}`
3. Run `npm install` and `npm run build`
4. Launch VS Code with isolation flags (Dev profile by default)

### Common Usage

```powershell
# Auto-slug from issue title
.\scripts\dev-worktree.ps1 -Issue 42

# Explicit slug
.\scripts\dev-worktree.ps1 -Issue 42 -Slug "fix-auth-timeout"

# Use a named profile for lighter isolation
.\scripts\dev-worktree.ps1 -Issue 42 -Profile "Dev"

# Re-enter an existing worktree without rebuilding
.\scripts\dev-worktree.ps1 -Issue 42 -NoBuild

# Fresh start — wipe isolated env before launch
.\scripts\dev-worktree.ps1 -Issue 42 -Clean

# Full user-data-dir isolation (no profile)
.\scripts\dev-worktree.ps1 -Issue 42 -Profile ""
```

### How It Works

| Flag | Effect |
|------|--------|
| `-Issue` | **(Required)** GitHub issue number. Determines branch name. |
| `-Slug` | Branch slug. Auto-generated from issue title if omitted. |
| `-Profile` | VS Code profile name (default: "Dev"). Uses `--profile` for lighter isolation. Pass `""` for full `--user-data-dir` isolation. |
| `-NoBuild` | Skip `npm install` + `npm run build`. Use when the worktree is already set up. |
| `-Clean` | Delete `.editless-dev/` in the worktree before launching. |

The script detects whether it's run from the main clone or a worktree and resolves the main clone root automatically.

---

## Running Side-by-Side: Shipped vs. Dev Extension

You need two VS Code instances — one running your stable VSIX (your daily driver), the other running the dev build (for testing changes).

### Approach 1: VS Code Profiles (Recommended for Quick Testing)

Use profiles to isolate extension sets without duplicating all your settings.

1. **Create a "Dev" profile:**
   - `Ctrl+Shift+P` → "Profiles: Create Profile"
   - Name it "Dev" and choose "Empty Profile" as the template

2. **Launch VS Code with the Dev profile:**
   ```powershell
   code --profile "Dev"
   ```

3. **Press F5 in your dev workspace** to start the Extension Development Host
   - It inherits the "Dev" profile by default

4. **Your main VS Code instance stays on the "Default" profile** with the stable EditLess VSIX installed

**When to use this:** Daily dev work, quick iteration on features, testing UX tweaks. Profiles share some settings (keybindings, themes), so it feels familiar.

### Approach 2: Isolated User Data Directories (Full Isolation)

Use `--user-data-dir` for complete separation. No shared state between instances.

For a quick isolated launch of the current directory (no worktree creation), use:

```powershell
.\scripts\dev-isolated.ps1          # launch isolated instance
.\scripts\dev-isolated.ps1 -Clean   # reset env first
```

Or add a custom launch configuration to `.vscode/launch.json`:
```json
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Launch Extension (Isolated)",
  "runtimeExecutable": "${execPath}",
  "args": [
    "--user-data-dir=${env:HOME}/.editless-dev/user-data",
    "--disable-extensions",
    "--extensionDevelopmentPath=${workspaceFolder}"
  ]
}
```

**When to use this:** Testing extension conflicts, debugging installation issues, validating fresh-install UX, or when you need a completely clean slate.

**💡 Tip:** Profiles are lighter-weight than full isolation, but they do share some global state (installed extensions, workspace history). If you see interference between instances, switch to `--user-data-dir` for true isolation.

---

## Local UX Validation

You're building a UI extension. Seeing is believing.

1. **Test with realistic data:**
   - Configure `editless.github.repos` with your actual repos
   - Add an Azure DevOps connection if you use ADO
   - Populate `.ai-team/` or `.squad/` with a full team structure

2. **Use the TreeView refresh logic:**
   - Modify `src/agents-provider.ts` or `src/work-items-provider.ts`
   - Save, press F5, check the sidebar immediately
   - VS Code's TreeView API caches aggressively — force a refresh via "EditLess: Refresh"

3. **Watch for console errors:**
   - Open Developer Tools in the Extension Development Host: `Help → Toggle Developer Tools`
   - Errors in tree rendering, async provider calls, or status bar updates appear here

4. **Test terminal session persistence:**
   - Launch a session with an agent
   - Close the Extension Development Host window
   - Restart (F5 again) and verify the terminal restores correctly
   - Check `TerminalManager.restoreSessions()` if orphans appear

5. **Validate command palette integration:**
   - `Ctrl+Shift+P` → type "EditLess"
   - All commands should appear unless hidden by `when` clauses in `package.json`
   - Check `contributes.menus.commandPalette` to debug visibility

6. **Preview icons and tree view labels:**
   - Icons live in `icons/` — use VS Code's built-in codicons (`$(icon-name)`) where possible
   - Tree item labels support markdown: `**bold**`, `_italic_`, `` `code` ``

7. **Test multi-root workspaces:**
   - Open a workspace with multiple folders via `File → Add Folder to Workspace`
   - `resource`-scoped settings (like `registryPath`, `discoveryDir`) vary per folder
   - Verify agent discovery and registry lookups respect folder boundaries

8. **Verify keybindings:**
   - The default keybinding for "Focus Session" is `Ctrl+Shift+S` / `Cmd+Shift+S` (see `package.json`)
   - Test it works in both the main editor and when focus is in the terminal

---

## MCP Servers

MCPs (Model Context Protocol servers) can bridge VS Code, browser DevTools, and AI agents. EditLess doesn't use webviews today, so MCPs aren't critical for daily development — but they're worth knowing about for integration test authoring and future debugging.

MCPs can be scoped to a workspace via `.vscode/mcp.json` (gitignored) so they only activate in your dev worktree.

| MCP | Use Case |
|-----|----------|
| **vscode-test-mcp** | Run extension tests and simulate user actions via AI agents. Useful for integration test authoring. |
| **chrome-devtools-mcp** | Live DOM inspection and console logs. Only relevant if EditLess adds webview features in the future. |

---

## Keeping Production Dev Safe

The EditLess worktree policy exists for a reason: Casey's main clone (`C:\Users\cirvine\code\work\editless`) is pull-only. All feature work happens in worktrees.

**The easiest way to stay safe:** use `scripts/dev-worktree.ps1`. It creates worktrees, builds, and launches isolated VS Code automatically.

1. **Never check out a branch in the main clone:**
   - If `git status` in the main clone shows a branch other than `main`, **stop immediately**
   - Run `git checkout main` in the main clone to restore it

2. **Use worktrees for all feature branches:**
   ```powershell
   # Preferred — one command does everything:
   .\scripts\dev-worktree.ps1 -Issue 42

   # Manual alternative:
   git worktree add ..\editless.wt\my-feature squad/123-my-feature
   cd ..\editless.wt\my-feature
   ```

3. **Open the worktree in a separate VS Code window:**
   ```powershell
   code ..\editless.wt\my-feature
   ```

4. **Keep the stable VSIX installed in your main VS Code instance:**
   - Install from GitHub Releases: [cirvine-MSFT/editless/releases](https://github.com/cirvine-MSFT/editless/releases)
   - This is your daily driver — it should never break because of local dev work

5. **Test changes in the Extension Development Host (F5) in the worktree window:**
   - Press F5 in the worktree VS Code instance
   - A new "Extension Development Host" window opens with the dev build
   - Your main VS Code instance remains untouched

6. **Rebuild and repackage when testing VSIX installation:**
   ```powershell
   npm run build      # esbuild compiles to dist/
   npm run package    # vsce creates .vsix
   ```
   - Install the VSIX in an isolated instance before rolling it out to your daily driver

7. **Sync the main clone regularly:**
   ```powershell
   cd C:\Users\cirvine\code\work\editless
   git pull --rebase origin main
   ```

8. **Never merge branches in the main clone:**
   - All merges happen via GitHub PRs
   - The main clone is read-only from your perspective

**⚠️ Why this matters:** EditLess is an extension for managing AI agents in terminal sessions. If the extension breaks in your daily driver, you lose access to your agent workflow. The worktree policy is insurance — it guarantees your production setup stays clean while you experiment.

---

## Running Tests Locally

EditLess uses **vitest** for unit tests and **@vscode/test-electron** for integration tests.

### Unit Tests

```powershell
npm run test
```

- Fast, isolated, no VS Code API required
- Tests in `src/**/*.test.ts` (currently excluded: `src/__integration__/**`)
- Config: `vitest.config.ts`

### Integration Tests

```powershell
npm run test:integration
```

- Requires full VS Code API (uses `@vscode/test-electron`)
- Tests in `src/__integration__/**` (planned — infrastructure exists via `tsconfig.integration.json`)
- Pre-compiles TypeScript via `npm run pretest:integration`

### Running Tests in Isolation

To test without interference from installed extensions:

```powershell
npm run test:integration -- --disable-extensions
```

Or add `--user-data-dir` and `--disable-extensions` to the test runner config.

**💡 Tip:** If a test fails in CI but passes locally, check for environment differences (missing MCPs, global settings, installed extensions). The CI environment is always clean — your local environment might have state from your daily driver bleeding through.

---

## Build Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript → `dist/extension.js` via esbuild |
| `npm run watch` | Rebuild on file changes (dev mode) |
| `npm run package` | Create `.vsix` for installation (`editless-{version}.vsix`) |
| `npm run lint` | Type-check with `tsc --noEmit` (no output, just errors) |
| `npm run test` | Run unit tests (vitest) |
| `npm run test:integration` | Run integration tests (@vscode/test-electron) |

**💡 Tip:** Use `npm run watch` during active development so your changes compile automatically. Then press `Ctrl+R` in the Extension Development Host to reload the extension without restarting.

---

## Why This Matters

You're building an extension for managing AI agents. The terminal is your interface. The extension can't break — if it does, you lose access to your agents mid-session. Side-by-side instances and worktrees are your safety net.

**TL;DR:** Use `dev-worktree.ps1` for feature work, profiles for quick testing, `--user-data-dir` for full isolation, and worktrees to keep production safe. Never check out branches in the main clone. Test live, rebuild often, and trust the workflow.

---

## 💡 Tip

When testing a new tree view feature (agent discovery, session grouping, work item filtering), populate your dev environment with **realistic data** — multiple squads, 20+ GitHub issues, several terminal sessions. VS Code's TreeView performance characteristics only show up at scale.

---

## 📖 See Also

- [Getting Started](getting-started.md) — Initial setup and philosophy
- [Architecture](architecture.md) — How EditLess components fit together
- [SETTINGS.md](SETTINGS.md) — Complete extension settings reference
- [BRANCH-PROTECTION.md](BRANCH-PROTECTION.md) — Worktree enforcement policy

← [Back to Documentation Index](../README.md)
