# Agent Markdown File Format

EditLess discovers and displays standalone agents by scanning for `.agent.md` files in your workspace and the Copilot local directory (`~/.copilot/`). This document describes the format and conventions for these files.

---

## Overview

An agent file is a Markdown document that defines a single standalone agent outside of a squad/team structure. EditLess parses the file to extract:

- **Agent name** — from the H1 heading or filename
- **Description** — from a YAML frontmatter field or blockquote
- **Display ID** — derived from filename

These agents appear in the **Agents** sidebar view and can be launched just like squad agents.

---

## File Location & Naming

Agent files must follow this naming convention:

```
<name>.agent.md
```

EditLess scans for `.agent.md` files in these locations:

| Location | Scope | Priority |
|----------|-------|----------|
| `<workspace-root>/.github/agents/` | workspace | 1 (highest) |
| `<workspace-root>/` | workspace | 2 |
| `~/.copilot/` | system-wide | 3 (lowest) |

**Example file paths:**

- `my-project/.github/agents/code-reviewer.agent.md`
- `my-project/my-agent.agent.md`
- `~/.copilot/claude-sonnet.agent.md`

### ID Generation

The agent ID is derived from the filename by:

1. Remove `.agent.md` suffix
2. Convert camelCase to kebab-case
3. Convert spaces and underscores to hyphens
4. Lowercase all characters

| Filename | ID |
|----------|-----|
| `CodeReviewer.agent.md` | `code-reviewer` |
| `my_agent.agent.md` | `my-agent` |
| `claude sonnet.agent.md` | `claude-sonnet` |

---

## File Format

### Basic Structure

An agent file is a Markdown document with:

1. **H1 Heading** (required) — the agent name
2. **Description** (optional) — YAML or blockquote format
3. **Content** (optional) — any additional documentation

```markdown
# My Agent

> A brief description of what this agent does.

## What it does

This agent handles code reviews and provides feedback on pull requests.
```

### Name Parsing

The agent name is extracted from the **first H1 heading** in the file:

```markdown
# Code Reviewer
```

**Display name:** "Code Reviewer"

If no H1 heading is found, the filename (without `.agent.md`) is used as the display name.

### Description Extraction

EditLess extracts a description in order of priority:

#### 1. YAML Frontmatter (highest priority)

```markdown
---
description: This agent reviews pull requests and provides feedback.
---

# My Agent
```

**Extracted description:** "This agent reviews pull requests and provides feedback."

#### 2. Blockquote (common style)

```markdown
# My Agent

> A concise description of what this agent does.

## Details
...
```

**Extracted description:** "A concise description of what this agent does."

#### 3. No description (fallback)

If neither YAML nor blockquote is present, the agent has no description.

---

## Complete Example

Here's a complete, well-formed agent file:

```markdown
# Code Reviewer

> Automated code review agent that analyzes pull requests for bugs, style issues, and security concerns.

## Capabilities

- Detects common bug patterns
- Checks code style against house rules
- Identifies security vulnerabilities
- Suggests performance improvements

## How to use

You can launch this agent from the EditLess sidebar. It will analyze the current pull request and provide feedback.

## Configuration

This agent uses the following settings:
- Language: Python
- Model: Claude 3.5 Sonnet
- Timeout: 5 minutes
```

---

## How EditLess Displays Agent Files

When EditLess discovers an agent file, it builds a `DiscoveredAgent` object:

```typescript
interface DiscoveredAgent {
  id: string;           // kebab-case ID from filename
  name: string;         // parsed from H1 or filename
  filePath: string;     // absolute path to file
  source: 'workspace' | 'copilot-dir';  // where it was found
  description?: string; // parsed from YAML or blockquote
}
```

The agent then appears in the Agents tree view with:

- **Label** — agent name
- **Description** — shown on hover (if available)
- **Icon** — indicates source (workspace vs. system-wide)
- **Context menu** — allows launching the agent

---

## Parsing Rules (Implementation Details)

EditLess uses these regex patterns to parse agent files:

### H1 Heading

```regex
/^#\s+(.+)$/m
```

Matches the first line starting with `#` (with one space after). Captures the heading text.

### YAML Description

```regex
/^description:\s*(.+)$/m
```

Matches a YAML field named `description` (anywhere in the file, not necessarily at the top).

### Blockquote

```regex
/^>\s+(.+)$/m
```

Matches the first blockquote line (starting with `>` and a space).

---

## Discovery Behavior

### Deduplication

If the same agent ID appears in multiple locations, the workspace version wins:

| File | ID | Location | Included? |
|------|-----|----------|-----------|
| `my-project/my-agent.agent.md` | `my-agent` | workspace | ✅ |
| `~/.copilot/my-agent.agent.md` | `my-agent` | system | ❌ (duplicate) |

### Source Tracking

Each discovered agent tracks its source:

- `'workspace'` — found in workspace folder
- `'copilot-dir'` — found in `~/.copilot/`

---

## Launching an Agent

When you launch a discovered agent from the sidebar, EditLess:

1. Resolves the active CLI provider (e.g., Copilot CLI)
2. Launches a terminal with: `<cli-command> --agent <agent-id>`
3. Creates a terminal session in the Agents view

The `launchCommand` template from `cli.providers` determines how the agent is invoked. Example:

```
Copilot CLI: copilot --agent my-agent
```

---

## Best Practices

### 1. Use Descriptive Names

```markdown
# Claude Code Reviewer  ✅
# Agent #42             ❌
```

### 2. Provide a Blockquote Description

```markdown
# My Agent

> Handles customer support inquiries and escalates complex cases.
```

This description appears in the UI and helps users understand the agent's purpose at a glance.

### 3. Use Consistent Filenames

Match the filename to the agent name:

```
Code Reviewer.agent.md           ✅ (or code-reviewer.agent.md)
my-agent-v2-final.agent.md       ❌
```

### 4. Keep Content Organized

Structure the rest of the file for readability:

```markdown
# My Agent

> Brief description

## Capabilities

## How to use

## Configuration

## Examples
```

### 5. Store in `.github/agents/` for Teams

If you're sharing agents across a team repository:

```
my-project/
├── .github/
│   └── agents/
│       ├── code-reviewer.agent.md
│       ├── bug-investigator.agent.md
│       └── documentation-writer.agent.md
└── ...
```

This keeps agents organized and discoverable by all team members who clone the repo.

---

## Troubleshooting

### Agent Not Appearing in Sidebar

- **Check filename:** Must end with `.agent.md`
- **Check location:** File should be in workspace root, `.github/agents/`, or `~/.copilot/`
- **Trigger discovery:** Run **EditLess: Discover Squads** command (keyboard shortcut: or command palette)
- **Check settings:** Verify `editless.discovery.scanPaths` includes the directory

### Name Not Displaying Correctly

- **Add H1 heading:** EditLess extracts the agent name from the first `# Heading` in the file
- **Remove extra spaces:** Ensure the heading is `# Name` (not `#  Name` or `# Name `)

### Description Not Showing

- **Use blockquote:** Add a line like `> Your description here` after the H1 heading, or
- **Use YAML:** Add `description: Your description here` at the top of the file (before the H1)

### Duplicate Agents

- **Workspace wins:** If the same agent exists in both workspace and `~/.copilot/`, the workspace version is used
- **Check ID:** Verify that filenames don't generate conflicting IDs

---

## Integration with Squads

Agent files are separate from squad rosters. Squads define agents in `.ai-team/team.md` (or `.squad/team.md`). Standalone agents discovered from `.agent.md` files appear alongside squad agents in the Agents view but are not part of any team.

---

**For more information on EditLess architecture, see `docs/architecture.md`.**
