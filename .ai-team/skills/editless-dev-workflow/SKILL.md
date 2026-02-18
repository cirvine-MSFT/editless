---
name: "editless-dev-workflow"
description: "How to start working on an EditLess issue: worktree creation, isolated VS Code, branch conventions"
domain: "development-workflow"
confidence: "medium"
source: "earned"
---

## When to Use This Skill

- Before any EditLess feature branch work
- When asked to "work on issue #N", "start a worktree", or "set up dev environment for #N"
- When anyone needs to launch an isolated EditLess development environment

## Primary Workflow: `dev-worktree.ps1`

The main command for issue-driven development:

```powershell
.\scripts\dev-worktree.ps1 -Issue {N}
```

**What it does:**
1. Creates a git worktree at `../editless.wt/{slug}` (sibling to the main clone)
2. Creates a branch named `squad/{issue}-{slug}` (branches off `origin/master`, not main)
3. Runs `npm install` and `npm run build` (unless `-NoBuild`)
4. Launches VS Code with isolation flags (clean extensions, separate user data)
5. Returns with re-entry command for subsequent launches

**Location:** Works from either the main clone or an existing worktree.

## Script Parameters

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `-Issue` | int | (required) | GitHub issue number |
| `-Slug` | string | (auto-generated) | Branch slug in kebab-case. If omitted, fetches issue title via `gh` CLI and converts to slug |
| `-Profile` | string | `"Dev"` | VS Code profile name for lightweight isolation. Pass `""` or `$null` to use `--user-data-dir` instead |
| `-NoBuild` | switch | (off) | Skip `npm install` and `npm run build`. Use when re-entering an existing worktree |
| `-Clean` | switch | (off) | Delete `.editless-dev/` before launching (resets isolated environment) |

## Examples

**Start a new issue worktree (auto-slug):**
```powershell
.\scripts\dev-worktree.ps1 -Issue 42
```

**With explicit slug:**
```powershell
.\scripts\dev-worktree.ps1 -Issue 42 -Slug "fix-auth-timeout"
```

**Re-enter without rebuilding (fast iteration):**
```powershell
.\scripts\dev-worktree.ps1 -Issue 42 -Slug "fix-auth-timeout" -NoBuild
```

**Clean and rebuild:**
```powershell
.\scripts\dev-worktree.ps1 -Issue 42 -Slug "fix-auth-timeout" -Clean
```

**Use VS Code user-data-dir instead of profile:**
```powershell
.\scripts\dev-worktree.ps1 -Issue 42 -Profile $null
```

## Branch Naming Convention

EditLess uses issue-driven branch naming:

```
squad/{issue-number}-{kebab-case-slug}
```

Example: `squad/42-fix-auth-timeout`

Branches are created off `origin/master` (the default branch for this project — NOT `main`).

## Worktree Location

Worktrees are created relative to the main clone:

```
{main-clone-parent}/editless.wt/{slug}/
```

Example:
- Main clone: `C:\Users\...\editless`
- Worktree: `C:\Users\...\editless.wt\fix-auth-timeout`

Each worktree is isolated: its own `node_modules`, `dist`, and `.editless-dev/` directory.

## Simpler Alternative: `dev-isolated.ps1`

When you just need an isolated VS Code without worktree creation (e.g., testing a fix in the current directory):

```powershell
.\scripts\dev-isolated.ps1
```

**Parameters:**
- `-Clean`: Delete `.editless-dev/` before launching (reset isolated environment)

**Use cases:**
- Quick testing without feature branching
- Testing in the main clone (not recommended for real work)
- Quick reproduction of issues

**Note:** This script requires the extension to be pre-built (`npm run build`). Unlike `dev-worktree.ps1`, it does NOT run the build.

## Anti-Patterns & Gotchas

### ❌ Don't use `Manage-Worktree.ps1`
This script does NOT exist for EditLess. (It was a caseybot bootstrapping tool for other projects.) Use `dev-worktree.ps1` instead.

### ❌ Don't checkout branches in the main clone
Always use worktrees for feature work. Checking out in the main clone breaks isolation and shared tooling.

### ❌ Don't skip isolation flags
The isolation is intentional: separate extensions, user data, and profile ensure clean testing without affecting your daily VS Code instance.

### ✅ Do remember: EditLess branches off `origin/master`
Not `main`. The script handles this, but if manually creating a branch, use `origin/master` as the base.

### ✅ Do use `-NoBuild` for fast iteration
After initial setup, re-entering with `-NoBuild` skips `npm install` and rebuild, saving 30+ seconds per cycle.

### ✅ Do check worktree status before starting
If unsure which worktree you're in, run `git worktree list` from the main clone.

## Integration Notes

- The script auto-detects whether you're in the main clone or a worktree via `.git` inspection.
- If `-Slug` is omitted, it uses `gh issue view` to fetch the issue title and convert to kebab-case. Requires GitHub CLI auth.
- VS Code launches in extension development mode (`--extensionDevelopmentPath`).
- Disabled extensions prevent conflicts; the isolated profile/user-data keeps extension state separate.
