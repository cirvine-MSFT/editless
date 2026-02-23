# EditLess Settings Reference

All EditLess settings are accessible through VS Code's Settings UI (**Ctrl+,**) or by editing `settings.json` directly. Each setting is prefixed with `editless.` and scoped appropriately (see the Scope column in each table — `resource` settings can vary per folder in multi-root workspaces, `window` settings apply to the whole VS Code window).

---

## Registry & Discovery

Settings for discovering and registering agent teams and standalone agents.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.registryPath` | `string` | `"./agent-registry.json"` | resource | Path to the agent registry JSON file (relative to workspace root). The registry tracks which agent teams are available and their configuration. |
| `editless.discoveryDir` | `string` | `""` | resource | **(Deprecated)** Use `discovery.scanPaths` instead. Directory to scan for squad projects on startup. |
| `editless.discovery.scanPaths` | `array` | `[]` | window | Additional directories to scan for agents and squads on startup and when configuration changes. Accepts absolute paths or paths relative to workspace root. |
| `editless.scanDebounceMs` | `number` | `500` | resource | Debounce interval in milliseconds for file-system scanning. Increase this value if you experience excessive refreshes in large workspaces with many file changes. |

**Example:**

```jsonc
{
  "editless.registryPath": "./agent-registry.json",
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
| `editless.cli.additionalArgs` | `string` | `""` | window | Additional command-line arguments appended to the Copilot CLI when launching sessions. Use this to pass flags like `--yolo` to every session. |

**Example:**

```jsonc
{
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
  // Registry
  "editless.registryPath": "./agent-registry.json",
  "editless.discovery.scanPaths": ["./squads"],
  "editless.scanDebounceMs": 500,

  // CLI
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

## Agent Registry Configuration

The **agent registry** (`agent-registry.json`) is the per-user manifest that tracks registered agent teams and standalone agents. It's stored at the path configured in `editless.registryPath` (default: `./agent-registry.json` relative to workspace root).

### Registry File Format

```jsonc
{
  "version": "1.0",
  "squads": [
    {
      "id": "my-squad",
      "name": "My Squad",
      "path": "/absolute/path/to/squad",
      "icon": "🚀",
      "universe": "my-org",
      "description": "My custom squad",
      "model": "gpt-4",
      "additionalArgs": "--yolo"
    }
  ]
}
```

### Agent Registry Schema

Each entry in `squads` is an **AgentTeamConfig** object with the following fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Kebab-case unique identifier (e.g., `"my-squad"`). Used in CLI `--agent` flag. |
| `name` | string | ✓ | Display name shown in UI (e.g., `"My Squad"`). |
| `path` | string | ✓ | Absolute path to squad root directory. Used as working directory when launching. |
| `icon` | string | ✓ | Emoji icon displayed in panes (e.g., `"🚀"`). |
| `universe` | string | ✓ | Casting universe name. Either `"standalone"` for single agents or a squad name like `"my-org"`. |
| `description` | string | — | Optional squad description shown in UI hover text. |
| `terminalProfileName` | string | — | Optional Windows Terminal profile name for session matching. |
| `terminalProfileGuid` | string | — | Optional Windows Terminal profile GUID. |
| `model` | string | — | Optional. Sets `--model` flag for Copilot CLI. Overrides any global `editless.cli.additionalArgs` model setting. |
| `additionalArgs` | string | — | Optional extra CLI flags for this agent (e.g., `"--yolo"`). Merged with global `editless.cli.additionalArgs` (not replaced). |

### Example Configurations

**Registering a squad:**

```jsonc
{
  "version": "1.0",
  "squads": [
    {
      "id": "platform",
      "name": "Platform Squad",
      "path": "/home/user/projects/platform",
      "icon": "🏗️",
      "universe": "acme-corp",
      "description": "Infrastructure and deployment specialists",
      "terminalProfileName": "PowerShell Admin"
    }
  ]
}
```

**Registering multiple squads with per-agent models:**

```jsonc
{
  "version": "1.0",
  "squads": [
    {
      "id": "frontend",
      "name": "Frontend Team",
      "path": "/home/user/work/frontend",
      "icon": "⚛️",
      "universe": "mycompany",
      "model": "gpt-4"
    },
    {
      "id": "backend",
      "name": "Backend Team",
      "path": "/home/user/work/backend",
      "icon": "🐍",
      "universe": "mycompany",
      "model": "claude-opus-4"
    }
  ]
}
```

**Standalone agent with custom flags:**

```jsonc
{
  "version": "1.0",
  "squads": [
    {
      "id": "code-reviewer",
      "name": "Code Reviewer",
      "path": "/usr/local/agents/code-review",
      "icon": "👀",
      "universe": "standalone",
      "additionalArgs": "--yolo --no-cache"
    }
  ]
}
```

---

## Per-Agent CLI Settings

When launching an agent, EditLess builds a command line by combining global CLI settings with per-agent config overrides.

### Model Override

The `model` field in an agent's registry entry sets the Copilot CLI `--model` flag **for that agent only**, overriding any global settings:

```jsonc
{
  "editless.cli.additionalArgs": "--yolo",
  "editless.registryPath": "./agent-registry.json"
}
```

```jsonc
// agent-registry.json
{
  "version": "1.0",
  "squads": [
    {
      "id": "my-squad",
      "name": "My Squad",
      "path": "/squad/path",
      "icon": "🚀",
      "universe": "myorg",
      "model": "gpt-4"  // This squad always uses gpt-4
    }
  ]
}
```

When this agent launches, the CLI receives: `--model gpt-4 --yolo` (global args still apply).

### Additional Args Merge

The `additionalArgs` field in agent config is **merged with** (not replaced by) global `editless.cli.additionalArgs`. The merge order is:

1. Per-agent `additionalArgs` (applied first)
2. Global `editless.cli.additionalArgs` (applied second)

Flags are concatenated and split on whitespace. **Note:** Duplicate flags are not yet deduplicated (see [#404](https://github.com/microsoft/editless/issues/404)).

**Example:**

```jsonc
// VS Code settings
{
  "editless.cli.additionalArgs": "--verbose --cache-dir=/tmp/cache"
}

// agent-registry.json
{
  "squads": [
    {
      "id": "my-agent",
      "name": "My Agent",
      "path": "/agent/path",
      "icon": "🤖",
      "universe": "standalone",
      "additionalArgs": "--no-telemetry"
    }
  ]
}
```

**Resulting command:** `--no-telemetry --verbose --cache-dir=/tmp/cache`

---

## CLI Command Assembly

EditLess builds the final Copilot CLI command from multiple sources. The command is constructed in this order:

1. **Binary:** `editless.cli.command` (or `copilot` if not set)
2. **Agent flag:** Derived from registry `id` and `universe`:
   - `id === "builtin:copilot-cli"` → no `--agent` flag
   - `universe === "standalone"` → `--agent <id>`
   - All others → `--agent squad`
3. **Model:** From per-agent `model` field (if set) → `--model <model>`
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

## Migration from v0.1.0

The agent registry format changed in v0.1.1. Old registries are **automatically migrated** in memory on load, so existing entries continue to work. However, you should update your registry file format for clarity:

### Removed & Renamed Fields

| Old Field | New Approach |
|-----------|--------------|
| `launchCommand` | Auto-migrated to `model` + `additionalArgs` on load |
| `agentFlag` | Now derived from `id` and `universe` (not stored) |

### Auto-Migration Example

**Old format (v0.1.0):**

```jsonc
{
  "squads": [
    {
      "id": "my-squad",
      "name": "My Squad",
      "path": "/path",
      "icon": "🚀",
      "universe": "myorg",
      "launchCommand": "copilot --agent squad --model gpt-4 --yolo"
    }
  ]
}
```

**Auto-migrated to (v0.1.1, in memory):**

```jsonc
{
  "squads": [
    {
      "id": "my-squad",
      "name": "My Squad",
      "path": "/path",
      "icon": "🚀",
      "universe": "myorg",
      "model": "gpt-4",
      "additionalArgs": "--yolo"
    }
  ]
}
```

The migration extracts `--model <value>` and remaining flags into `additionalArgs`. **To persist the change**, save the registry using the UI (e.g., update squad settings and save).

---

## Known Limitations

| Issue | Impact | Workaround |
|-------|--------|-----------|
| **Settings changes don't update existing entries** | When you change global `editless.cli.additionalArgs`, squads registered before the change won't pick up the new value until re-registered. | Manually update agent settings or delete and re-add the squad. |
| **Duplicate flags not deduplicated** ([#404](https://github.com/cirvine-MSFT/editless/issues/404)) | If global and per-agent `additionalArgs` both contain the same flag, both will be passed to Copilot CLI. | Use distinct flags or ensure global and per-agent args don't overlap. |
| **Personal agent path used as CWD** ([#403](https://github.com/cirvine-MSFT/editless/issues/403)) | When launching a personal agent, the session's working directory is set to the agent's squad path, which may not be correct for per-user agents. | Use squad agents instead or manage CWD manually after launch. |

---

**For architectural details on how these settings are used, see `docs/architecture.md`.**
