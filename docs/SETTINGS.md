# EditLess Settings Reference

All EditLess settings are accessible through VS Code's Settings UI (**Ctrl+,**) or by editing `settings.json` directly. Each setting is prefixed with `editless.` and scoped appropriately (see the Scope column in each table — `resource` settings can vary per folder in multi-root workspaces, `window` settings apply to the whole VS Code window).

---

## Discovery

Settings for discovering agent teams and standalone agents.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.discoveryDir` | `string` | `""` | resource | **(Deprecated)** Use `discovery.scanPaths` instead. Directory to scan for squad projects on startup. |
| `editless.discovery.scanPaths` | `array` | `[]` | window | Additional directories to scan for agents and squads on startup and when configuration changes. Accepts absolute paths or paths relative to workspace root. |
| `editless.scanDebounceMs` | `number` | `500` | resource | Debounce interval in milliseconds for file-system scanning. Increase this value if you experience excessive refreshes in large workspaces with many file changes. |

**Example:**

```jsonc
{
  "editless.discovery.scanPaths": [
    "./squads",
    "C:\\teams\\shared-agents"
  ],
  "editless.scanDebounceMs": 1000
}
```

---

## CLI

Settings for configuring how EditLess launches Copilot CLI sessions.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.cli.command` | `string` | `"copilot"` | window | Override the default `copilot` binary with a custom command or wrapper script. Supports multi-word commands (e.g., `"my-wrapper copilot"`). Can be overridden per-agent in agent settings. |
| `editless.cli.additionalArgs` | `string` | `""` | window | Additional command-line arguments appended to the Copilot CLI when launching sessions. Use this to pass flags like `--yolo` to every session. |

**Example:**

```jsonc
{
  "editless.cli.command": "copilot",
  "editless.cli.additionalArgs": "--yolo"
}
```

---

## GitHub Integration

Settings for displaying GitHub issues and pull requests in the Work Items and Pull Requests panes.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.github.repos` | `array` | `[]` | resource | GitHub repositories to show in Work Items and Pull Requests panes. Use `"owner/repo"` format (e.g., `["octocat/hello-world"]`). If empty, EditLess auto-detects repositories from workspace using `git remote`. |
| `editless.github.issueFilter` | `object` | `{}` | resource | Filter which GitHub issues appear by label. See schema below. |

### Issue Filter Schema

```typescript
{
  includeLabels?: string[];       // Only show issues with at least one of these labels (empty = show all)
  excludeLabels?: string[];       // Hide issues that have any of these labels
}
```

**Example — show only bugs and features, hide completed work:**

```jsonc
{
  "editless.github.repos": ["myorg/frontend", "myorg/backend"],
  "editless.github.issueFilter": {
    "includeLabels": ["type:bug", "type:feature"],
    "excludeLabels": ["status:done", "wontfix"]
  }
}
```

---

## Azure DevOps Integration

Settings for displaying Azure DevOps work items and pull requests.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.ado.organization` | `string` | `""` | resource | Azure DevOps organization URL (e.g., `"https://dev.azure.com/myorg"`). Required to show work items and PRs from ADO. |
| `editless.ado.project` | `string` | `""` | resource | Azure DevOps project name to display in Work Items and Pull Requests panes (e.g., `"MyProject"`). |

**Example:**

```jsonc
{
  "editless.ado.organization": "https://dev.azure.com/mycompany",
  "editless.ado.project": "Core Platform"
}
```

---

## Refresh & Display

Settings for auto-refresh behavior and terminal/panel display.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.refreshInterval` | `number` | `5` | window | Auto-refresh interval in minutes for Work Items and Pull Requests panels. EditLess also refreshes when the VS Code window regains focus. Set to `0` to disable auto-refresh entirely (manual refresh only). Minimum: `0`. |

**Example:**

```jsonc
{
  "editless.refreshInterval": 10
}
```

---

## Notifications

Settings for controlling desktop toasts and notifications.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.notifications.enabled` | `boolean` | `true` | window | Master toggle for all EditLess notifications. When disabled, **all** EditLess toasts are suppressed — including inbox notifications. |
| `editless.notifications.inbox` | `boolean` | `true` | window | Show notifications when new inbox items arrive (pending decisions, work items). A toast fires when the inbox count transitions from 0 → N. Requires `editless.notifications.enabled` to be on. |

**Example:**

```jsonc
{
  "editless.notifications.enabled": true,
  "editless.notifications.inbox": true
}
```

---

## Complete Example `settings.json`

```jsonc
{
  // Discovery
  "editless.discovery.scanPaths": ["./squads"],
  "editless.scanDebounceMs": 500,

  // CLI
  "editless.cli.command": "copilot",
  "editless.cli.additionalArgs": "",

  // GitHub
  "editless.github.repos": ["myorg/frontend", "myorg/backend"],
  "editless.github.issueFilter": {
    "includeLabels": ["squad:platform"],
    "excludeLabels": ["wontfix"]
  },

  // Azure DevOps
  "editless.ado.organization": "https://dev.azure.com/mycompany",
  "editless.ado.project": "Core Platform",

  // Refresh & Display
  "editless.refreshInterval": 5,

  // Notifications
  "editless.notifications.enabled": true,
  "editless.notifications.inbox": true
}
```

---

## Agent Settings

As of v0.1.3, agents are **auto-discovered** from your workspace and personal directories. EditLess scans:
- Personal agents: `~/.copilot/agents/`
- Workspace agents: `.squad/` or `.ai-team/` directories in your workspace folders

No registration file needed — just drop agent files in these locations and they appear in the sidebar.

### Agent Settings File

User preferences for discovered agents are stored in **`agent-settings.json`** in VS Code's global storage directory. This file is managed automatically — you don't need to edit it manually. Settings include:

| Setting | Type | Description |
|---------|------|-------------|
| `hidden` | `boolean` | Whether the agent is hidden from the tree view. Set via "Hide Agent" context menu. |
| `model` | `string` | Override the Copilot CLI `--model` flag for this agent (e.g., `"gpt-4"`). |
| `additionalArgs` | `string` | Extra CLI flags for this agent (e.g., `"--yolo"`). Merged with global `editless.cli.additionalArgs`. |
| `command` | `string` | Override `editless.cli.command` for this agent (e.g., `"my-wrapper copilot"`). |

**Example `agent-settings.json`:**

```jsonc
{
  "my-squad": {
    "hidden": false,
    "model": "gpt-4",
    "additionalArgs": "--yolo"
  },
  "code-reviewer": {
    "hidden": false,
    "command": "custom-copilot",
    "additionalArgs": "--no-cache"
  }
}
```

### How Auto-Discovery Works

1. **Workspace scan** — EditLess watches your workspace folders for `.squad/` or `.ai-team/` directories. Any folder containing a `team.md` file is treated as a squad.
2. **Personal agent scan** — EditLess scans `~/.copilot/agents/` for `.agent.md` files.
3. **Additional scan paths** — You can configure `editless.discovery.scanPaths` to add extra directories.
4. **Automatic updates** — When you add, remove, or modify agent files, the tree view updates automatically (debounced by `editless.scanDebounceMs`).

### Managing Agent Settings

- **Hide/show agents** — Right-click an agent → "Hide Agent". Hidden agents appear under a collapsible "Hidden (N)" group.
- **Per-agent model** — Right-click an agent → "Set Model" (planned feature).
- **Per-agent CLI flags** — Edit `agent-settings.json` in VS Code settings storage (or wait for UI support in future releases).

### Migration from agent-registry.json

If you're upgrading from v0.1.2 or earlier, your existing `agent-registry.json` is automatically migrated to `agent-settings.json` on first activation. The old registry file is left in place for manual cleanup — you can delete it after confirming the migration worked.

---

## Per-Agent CLI Settings

When launching an agent, EditLess builds a command line by combining global CLI settings with per-agent config overrides.

### Model Override

The `model` field in `agent-settings.json` sets the Copilot CLI `--model` flag **for that agent only**, overriding any global settings:

```jsonc
// VS Code settings.json
{
  "editless.cli.additionalArgs": "--yolo"
}
```

```jsonc
// agent-settings.json (in global storage)
{
  "my-squad": {
    "model": "gpt-4"  // This agent always uses gpt-4
  }
}
```

When this agent launches, the CLI receives: `--model gpt-4 --yolo` (global args still apply).

### Additional Args Merge

The `additionalArgs` field in agent settings is **merged with** (not replaced by) global `editless.cli.additionalArgs`. The merge order is:

1. Per-agent `additionalArgs` (applied first)
2. Global `editless.cli.additionalArgs` (applied second)

Flags are concatenated and split on whitespace.

**Example:**

```jsonc
// VS Code settings.json
{
  "editless.cli.additionalArgs": "--verbose --cache-dir=/tmp/cache"
}

// agent-settings.json
{
  "my-agent": {
    "additionalArgs": "--no-telemetry"
  }
}
```

**Resulting command:** `--no-telemetry --verbose --cache-dir=/tmp/cache`

---

## CLI Command Assembly

EditLess builds the final Copilot CLI command from multiple sources. The command is constructed in this order:

1. **Binary:** Per-agent `command` → `editless.cli.command` → `"copilot"` (default)
2. **Agent flag:** Derived from agent `id` and `universe` (auto-discovered from team.md):
   - `id === "builtin:copilot-cli"` → no `--agent` flag
   - `universe === "standalone"` → `--agent <id>`
   - All others → `--agent squad`
3. **Model:** From per-agent `model` field in agent-settings.json (if set) → `--model <model>`
4. **Extra args:** Per-agent `additionalArgs` + global `editless.cli.additionalArgs` (concatenated, per-agent first)

**Example build process:**

```
Binary:                    copilot
--agent flag:              --agent squad
--model flag:              --model gpt-4
Per-agent args:            --yolo
Global args:               --verbose
─────────────────────────────────────
Final command:             copilot --agent squad --model gpt-4 --yolo --verbose
```

---

## Migration from v0.1.2 and Earlier

### v0.1.3: agent-registry.json → Auto-Discovery

The agent registry file has been eliminated in v0.1.3. Agents are now auto-discovered from your workspace and personal directories.

**Migration process:**
1. On first activation of v0.1.3, EditLess reads your existing `agent-registry.json`
2. Hidden status, model overrides, and additionalArgs are migrated to `agent-settings.json` in global storage
3. The old `agent-registry.json` is left in place for manual cleanup
4. Agents now appear automatically from discovered `.squad/` or `.ai-team/` directories — no registration needed

**What changed:**
- ❌ `agent-registry.json` — no longer used (replaced by auto-discovery)
- ❌ `editless.registryPath` setting — removed
- ❌ "Add to Registry" / "Promote Discovered Agent" commands — removed
- ✅ `agent-settings.json` — new file for user preferences (hidden, model, additionalArgs, command)
- ✅ Auto-discovery — agents appear automatically when you add them to your workspace

**Action required:**
- None — migration is automatic. You can delete `agent-registry.json` after confirming your agents appear correctly.

### v0.1.1: launchCommand → Structured Fields

If you're upgrading from v0.1.0, the registry format changed in v0.1.1. Old registries are **automatically migrated** in memory on load.

**Old format (v0.1.0):**

```jsonc
{
  "squads": [
    {
      "id": "my-squad",
      "launchCommand": "copilot --agent squad --model gpt-4 --yolo"
    }
  ]
}
```

**Auto-migrated to (v0.1.1+):**

```jsonc
{
  "squads": [
    {
      "id": "my-squad",
      "model": "gpt-4",
      "additionalArgs": "--yolo"
    }
  ]
}
```

---

## Known Limitations

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Settings changes don't update existing entries** | When you change global `editless.cli.additionalArgs`, agents discovered before the change won't pick up the new value until the extension reloads. | Reload the VS Code window after changing global CLI settings. |

---

**For architectural details on how these settings are used, see `docs/architecture.md`.**
