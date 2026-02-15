# Copilot Coding Agent — EditLess Project Instructions

You are working on **EditLess**, a VS Code extension for managing AI agents, terminal sessions, and work items. This project uses **Squad**, an AI team framework.

## Coding Guidelines

### Comment Style
- **No verbose comments.** Code should be self-documenting through readable, well-named functions.
- **Why-comments only.** Comment when: a feature wasn't available, a workaround was needed, something wasn't working as expected, or a non-obvious decision was made.
- Never comment "what" the code does — that's the function name's job.

```typescript
// BAD — describes what the code does
// Check if the squad directory exists and return null if not
if (!fs.existsSync(squadPath)) { return null; }

// GOOD — explains WHY something non-obvious is happening
// VS Code's TreeView API doesn't support dynamic root changes,
// so we rebuild the entire provider when squads are added/removed
this.rebuildTreeProvider();
```

### Code Style
- TypeScript strict mode. No `any`. No implicit returns.
- One file, one concern. Keep modules focused.
- Wrap logic in well-named functions rather than inline blocks with comments.
- Use early returns to reduce nesting.
- Test with vitest. Name tests descriptively: `it('should show error when squad directory is missing')`.

### Git & PR Conventions
- All PRs start as drafts.
- Commit messages: `type: description` (e.g., `feat: add CLI provider auto-detection`).
- Branch naming: `squad/{issue-number}-{kebab-case-slug}` for issue work.
- Never delete branches — branch deletion is a human-only operation.

## Team Context

Before starting work on any issue:

1. Read `.ai-team/team.md` for the team roster, member roles, and your capability profile.
2. Read `.ai-team/routing.md` for work routing rules.
3. Read `.ai-team/decisions.md` for team decisions you must respect.
4. If the issue has a `squad:{member}` label, read that member's charter at `.ai-team/agents/{member}/charter.md` to understand their domain expertise and coding style — work in their voice.

## Project Details

- **Stack:** TypeScript, VS Code Extension API, esbuild, vitest
- **Build:** `npm run build` (esbuild)
- **Test:** `npm run test` (vitest)
- **Lint:** `npm run lint` (tsc --noEmit)
- **Package:** `npm run package` (vsce package → .vsix)

## Capability Self-Check

Before starting work, check your capability profile in `.ai-team/team.md` under **Coding Agent → Capabilities**.

- **🟢 Good fit** — proceed autonomously.
- **🟡 Needs review** — proceed, but note in the PR description that a squad member should review.
- **🔴 Not suitable** — do NOT start work. Comment on the issue requesting reassignment.

## Branch Naming

```
squad/{issue-number}-{kebab-case-slug}
```

## PR Guidelines

- Reference the issue: `Closes #{issue-number}`
- If flagged 🟡 needs-review: add `⚠️ This task was flagged as "needs review" — please have a squad member review before merging.`
- Follow conventions in `.ai-team/decisions.md`

## Decisions

If you make a decision that affects other team members, write it to:
```
.ai-team/decisions/inbox/copilot-{brief-slug}.md
```
