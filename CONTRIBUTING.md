# Contributing to EditLess

Thank you for your interest in helping EditLess improve! We welcome contributions at all levels. This guide explains how we work and how you can help most effectively.

## How Contributions Work Here

EditLess is built by **specialized AI agents** (Rick, Morty, Summer, and team). We've found that detailed problem specs are more valuable to us than pull requests — our agents use specs to implement, test, and verify changes end-to-end.

That said, there are **three levels of contribution**, each equally valuable:

### Level 1: File Issues (Easiest)

**What:** File an issue describing a feature you want or a bug you found.

**How:** 
1. Go to [Issues](https://github.com/cirvine-MSFT/editless/issues)
2. Click **New issue**
3. Describe what you want to see or what went wrong
4. Submit!

**Example:** "Dark mode isn't working in the tree view on Windows" or "I'd like to see agent status in the status bar"

**Why it matters:** We prioritize based on user feedback. Your issue helps us understand what's important.

---

### Level 2: Write a Detailed Spec (Medium Effort)

**What:** File an issue with a **detailed specification** that describes the feature, use cases, and expected behavior. Ideally, work with another AI agent or person to develop the spec.

**Why:** Detailed specs let our AI agents implement features faster, with fewer iterations. A well-written spec is worth more than a pull request.

**What to include:**
- **Problem:** What's the user problem you're solving?
- **Desired behavior:** How should EditLess behave?
- **Acceptance criteria:** How do we know it works?
- **Sketch/mockup** (if UX-related): Help us visualize it
- **Examples:** Show concrete use cases

**Example issue template:**
```
## Feature: Show Agent Health Status

### Problem
Users can't tell if their agents are responsive without opening the agent's terminal session.

### Desired Behavior
Show a small status indicator (● online / ○ offline) next to each agent in the tree view.
Update it every 5 seconds by pinging the agent's health endpoint.

### Acceptance Criteria
- [ ] Status indicators appear in tree view
- [ ] Refreshes every 5 seconds
- [ ] Clear visual distinction between online and offline
- [ ] No performance impact
```

**Why it matters:** Detailed specs let our agents do their best work. This is often more helpful than a PR because we get a clean, verified implementation without context-switching.

---

### Level 3: Dogfood on Master (Highest Value)

**What:** Use the latest code from `master` in your own work, file issues for bugs or friction you find, and tag them with `dogfood` + the commit SHA.

**Why:** Master moves fast. Dogfooding catches real-world issues before we release them. This is the fastest feedback loop.

**How:**
1. **Install the latest dogfood build** (ask for it or build locally)
2. **Use EditLess in your actual workflow**
3. **Find a bug or friction?** File an issue with:
   - The `dogfood` label
   - The commit SHA where you found it: `master@abc123ef`
   - Steps to reproduce
   - What you expected vs. what happened

**Example:**
```
Title: Dogfood — Terminal output cuts off with long lines

Dogfood commit: master@3f8a2b1

Steps:
1. Run an agent that outputs >100 chars per line
2. Watch the terminal in EditLess
3. The output gets truncated

Expected: Full line shown (scroll or wrap)
Actual: Text ends abruptly
```

**Important:** Master is not stable. Dogfooding is incredibly helpful but comes with risk. If you choose this path, understand that you may hit bugs. That's the point — help us find them early.

---

## For Dogfooders & Explorers: Development Setup

If you're exploring the codebase or dogfooding locally, here's how to set up:

### Prerequisites

- **Node.js 22 LTS** (or later)
- **VS Code** (for testing the extension)
- **npm** (bundled with Node.js)
- **git**

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

To watch for changes during development:

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

## Squad (AI Team) Workflow

EditLess uses **Squad**, an AI-assisted development framework. If you're working as part of the team:

### `.squad/` Directory

The `.squad/` directory contains team configuration:
- `team.md` — Team roster and member profiles
- `decisions.md` — Canonical decision log (read before starting work)
- `routing.md` — Work routing rules
- `agents/` — Individual agent charters

**Don't modify `.squad/` files** unless you understand the Squad workflow. These files are managed by the team lead.

### Reading Decisions Before Work

Before starting on an issue, read `.squad/decisions.md` to understand:
- Team conventions and preferences
- Project decisions that affect your work
- Naming conventions and terminology
- Architecture decisions

### Recording Decisions

If you make a decision that affects other team members, document it in:
```
.squad/decisions/inbox/
```

This ensures the team has a record of decisions and can incorporate them into the canonical log.

## Questions?

- **How do I install EditLess?** → Check `README.md`
- **What are the team conventions?** → Read `.squad/decisions.md`
- **I found something confusing** → File an issue! We consider that valuable feedback.

Thanks for being part of EditLess. 🚀
