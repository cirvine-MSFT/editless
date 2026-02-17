

# Workflow Documentation Structure

**Decided by:** Summer  
**Date:** 2026-02-16

## Decision

EditLess workflow how-to guides follow a consistent structure to make them easy to scan, write, and maintain.

## Pattern

Each workflow guide:
1. Opens with a one-sentence goal ("Do X in Y steps")
2. Contains 5–8 numbered steps (plain and scannable)
3. Includes a context subsection ("How to know if you need this" or "Why this matters")
4. Placeholder for future GIF: `<!-- TODO: Add GIF recording for this workflow -->`
5. Ends with three sections:
   - 💡 **Tip:** One pro-tip related to the workflow
   - 📖 **See Also:** Links to related docs
   - Back-link: `← [Back to Common Workflows](README.md)`

## Index Structure

The workflows index (`docs/workflows/README.md`) organizes guides into two sections:
- **Getting Started:** New how-to guides (core features)
- **Advanced Workflows:** Integration-specific docs (GitHub, ADO)

## Why This Works

- **Consistency:** New guides fit the pattern automatically
- **Scannability:** Users can find the steps they need in seconds
- **Extensibility:** Easy to add new workflows without restructuring
- **Future-proof:** GIF placeholders are explicit; no surprise missing recordings
- **Navigation:** Tip callouts and "See Also" links reduce user friction

## Related Docs

- `docs/workflows/README.md` — Index
- `docs/workflows/create-agent.md` — Add agents/squads
- `docs/workflows/create-session.md` — Launch and name sessions
- `docs/workflows/launch-from-work-item.md` — Open from work items

### 2026-02-17: Release Workflow vsce Fix Pattern

**Decided by:** Birdperson  
**Date:** 2026-02-17

## Decision

Use `npx @vscode/vsce` instead of bare `vsce` in CI/CD release workflows.

## Rationale

The v0.1.0 release failed at the marketplace publish step with `vsce: command not found` (exit code 127). The publish step was calling:

```yaml
run: vsce publish -p ${{ secrets.VSCE_PAT }}
```

But `vsce` was not installed or in $PATH. The tool is declared as a devDependency (`@vscode/vsce`), so it exists locally but npm didn't add its binary to $PATH in the GitHub Actions environment.

## Solution

Use npx to resolve the package:

```yaml
run: npx @vscode/vsce publish -p ${{ secrets.VSCE_PAT }}
```

npx:
1. Checks node_modules for `@vscode/vsce` and uses its binary if found
2. Falls back to downloading the package if not present
3. Executes the command in a safe subprocess

## Applies To

Any npm package binary that needs to run in CI. Pattern:
- ❌ Bare command: `vsce`, `tsc`, `eslint` (may not be in $PATH)
- ✅ With npx: `npx @vscode/vsce`, `npx tsc`, `npx eslint`

## Related

- PR: #275 (fix: install vsce before marketplace publish)
- Workflow: `.github/workflows/release.yml` line 83
- Config: `package.json` devDependencies includes `@vscode/vsce`

### 2026-02-17: Release branching strategy — ship from master, no release branches yet

**By:** Casey (via Copilot)  
**What:** v0.1.x bugfix releases and v0.2.0 feature releases both ship from master. No release branches until we need to hotfix an old version while new features are in flight. Version bump in package.json happens right before tagging (not after release). Workflow: fix bugs on master → bump package.json to 0.1.1 → commit → tag v0.1.1 → push tag → pipeline publishes. If we later need to hotfix v0.1.x while v0.2 is in progress, THEN create a `release/v0.1` branch from the last v0.1.x tag and cherry-pick.  
**Why:** Solo dev with one active line of development — release branches add complexity with no benefit right now. Keeping it simple until parallel release lines are actually needed.
