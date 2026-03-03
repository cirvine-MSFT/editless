# Local Tasks

Local tasks are markdown files with YAML frontmatter that EditLess tracks alongside GitHub Issues and Azure DevOps Work Items. They let you manage lightweight, file-based tasks inside any repository — no external service required.

---

## File Format

Each task is a `.md` file with YAML frontmatter between `---` markers, followed by markdown body content.

```markdown
---
state: Todo
created: 2026-03-15T09:00:00Z
session_id: null
---
# Refactor auth middleware

Extract token validation into a shared utility so both the API
and WebSocket layers can reuse it.
```

### Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `state` | ✅ | `Todo` \| `Done` | Current task state. |
| `created` | ✅ | ISO 8601 string | When the task was created. |
| `session_id` | — | string \| `null` | Copilot CLI session ID. When set on a `Todo` task, EditLess treats it as **Active**. |

### Title

The first `# Heading` in the markdown body becomes the task title shown in the Work Items panel. If no heading is found the title is left blank.

### State Mapping

EditLess maps local task states to its unified filter model:

| `state` | `session_id` | Unified State |
|---------|-------------|---------------|
| `Todo` | `null` | Open |
| `Todo` | non-null | Active |
| `Done` | any | Closed |

---

## Configuration

Add folder paths to the `editless.local.taskFolders` setting. Each path should point to a directory containing `.md` task files.

```jsonc
{
  "editless.local.taskFolders": [
    "C:\\workspace\\my-project\\tasks",
    "/home/user/repos/backend/.tasks"
  ]
}
```

EditLess scans each folder for `.md` files, parses frontmatter, and skips any file that is missing the required `state` or `created` fields.

---

## Work Items Panel

Local tasks appear under a **Local Tasks** group in the Work Items tree view.

- **Multiple folders** — each folder gets its own subgroup, labeled with the folder name.
- **Single folder** — tasks are shown directly under the Local Tasks group (no extra nesting).
- **Filtering** — use the tree filter controls to filter by state: Todo, Active, or Done.

---

## Tips

- Task filenames (minus `.md`) are used as internal IDs — keep them unique within a folder.
- Files without valid frontmatter are silently skipped.
- BOM characters at the start of a file are handled automatically.
- The `session_id` field is useful for tracking which tasks have an active Copilot session. Set it to `null` when no session is running.
