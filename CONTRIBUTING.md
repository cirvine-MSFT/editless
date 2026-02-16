# Contributing to EditLess

Thank you for your interest in contributing to EditLess! This guide covers how to set up a development environment, run tests and builds, follow our conventions, and submit pull requests.

## Prerequisites

- **Node.js 22 LTS** (or later)
- **VS Code** (for testing the extension)
- **npm** (bundled with Node.js)
- **git**

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/cirvine-MSFT/editless.git
cd editless
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Extension

```bash
npm run build
```

To watch for changes and rebuild automatically during development:

```bash
npm run watch
```

### 4. Test in VS Code

Press **F5** in VS Code to launch the Extension Development Host with your local build.

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Build the extension with esbuild |
| `npm run watch` | Watch mode — rebuild on file changes |
| `npm test` | Run unit tests with vitest |
| `npm run lint` | Type-check with TypeScript (no emit) |
| `npm run package` | Package as `.vsix` for distribution (requires vsce) |

## Code Style

### Self-Documenting Code

Code should be clear through **readable, well-named functions** — not verbose comments. Comments are reserved for explaining *why* something non-obvious is happening.

✅ **Good:**
```typescript
function shouldEvictOrphan(rebootCount: number): boolean {
  return rebootCount >= MAX_REBOOT_COUNT;
}
```

❌ **Bad:**
```typescript
// Check if reboot count is 2 or more
if (rebootCount >= 2) { /* ... */ }
```

### Why-Comments Only

Comment when:
- A feature wasn't available (workaround needed)
- Something wasn't working as expected (fix documented)
- A non-obvious decision was made (rationale explained)

❌ **Don't comment the what:**
```typescript
// Check if squad directory exists and return null if not
if (!fs.existsSync(squadPath)) { return null; }
```

✅ **Comment the why:**
```typescript
// VS Code's TreeView API doesn't support dynamic root changes,
// so we rebuild the entire provider when squads are added/removed
this.rebuildTreeProvider();
```

### TypeScript Strict Mode

- **No `any` types** — always use explicit types
- **No implicit returns** — functions must have explicit return type annotations
- **Early returns** — reduce nesting with early exit patterns
- **One file, one concern** — keep modules focused

## Testing

### Running Tests

```bash
npm test
```

Tests are written with **vitest** and live in `src/__tests__/`.

### Writing Tests

- Use **descriptive test names** that explain the expected behavior:
  ```typescript
  it('should show error when squad directory is missing', () => {
    // ...
  });
  ```
- **Mock the VS Code API**, never mock the code under test
- Keep tests focused on a single behavior
- Use early returns and clear assertions

## Pull Requests

### Opening a PR

1. **Create a feature branch** from `master` using the convention:
   ```
   squad/{issue-number}-{kebab-case-slug}
   ```
   Example: `squad/143-contributing`

2. **Open PRs as ready for review** (not draft)

3. **Reference the issue** in your PR description:
   ```
   Closes #{issue-number}
   ```

### Commit Message Format

Use the format: `type: description`

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `test` — Test additions or improvements
- `docs` — Documentation changes
- `chore` — Maintenance, tooling, dependency updates

**Examples:**
- `feat: add CLI provider auto-detection`
- `fix: resolve orphan terminal cleanup race condition`
- `docs: add CONTRIBUTING.md`
- `test: improve tree provider tests`
- `chore: update dependencies`

### Git Workflow

```bash
# Create and switch to feature branch
git checkout -b squad/143-contributing

# Make changes, commit with proper messages
git commit -m "docs: add CONTRIBUTING.md"

# Push to origin
git push -u origin squad/143-contributing

# Open PR on GitHub (reference the issue)
```

### Before Submitting

- Run `npm run lint` to check for TypeScript errors
- Run `npm test` to ensure all tests pass
- Run `npm run build` to verify the build succeeds
- Review your commits — ensure they follow the message format

## Squad (AI Team) Workflow

EditLess uses **Squad**, an AI-assisted development framework. If you're contributing as part of the EditLess team:

### `.ai-team/` Directory

The `.ai-team/` directory contains team configuration:
- `team.md` — Team roster and member profiles
- `decisions.md` — Canonical decision log (read before starting work)
- `routing.md` — Work routing rules
- `agents/` — Individual agent charters

**Don't modify `.ai-team/` files** unless you understand the Squad workflow. These files are managed by the team lead.

### Reading Decisions Before Work

Before starting on an issue, read `.ai-team/decisions.md` to understand:
- Team conventions and preferences
- Project decisions that affect your work
- Naming conventions and terminology
- Architecture decisions

### Recording Decisions

If you make a decision that affects other team members, document it in:
```
.ai-team/decisions/inbox/
```

This ensures the team has a record of decisions and can incorporate them into the canonical log.

## Questions?

- Check `README.md` for project overview
- Review `.ai-team/decisions.md` for team conventions
- Open an issue if you need clarification

Happy contributing! 🚀
