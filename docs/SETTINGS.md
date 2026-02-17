# EditLess Settings Reference

All EditLess settings are accessible through VS Code's Settings UI (**Ctrl+,**) or by editing `settings.json` directly. Each setting is prefixed with `editless.` and scoped to workspace or window as indicated.

---

## Registry & Discovery

Settings for discovering and registering agent teams and standalone agents.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.registryPath` | `string` | `"./agent-registry.json"` | workspace | Path to the agent registry JSON file (relative to workspace root). The registry tracks which agent teams are available and their configuration. |
| `editless.discoveryDir` | `string` | `""` | workspace | **(Deprecated)** Use `discovery.scanPaths` instead. Directory to scan for squad projects on startup. |
| `editless.discovery.scanPaths` | `array` | `[]` | workspace | Additional directories to scan for agents and squads on startup and when configuration changes. Accepts absolute paths or paths relative to workspace root. |
| `editless.scanDebounceMs` | `number` | `500` | workspace | Debounce interval in milliseconds for file-system scanning. Increase this value if you experience excessive refreshes in large workspaces with many file changes. |

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

## CLI Providers

Settings for configuring CLI tools used to launch agent sessions.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.cli.providers` | `array` | See below | window | Array of CLI provider configurations. Each provider defines a CLI tool with version detection and launch support. Copilot CLI is included by default and will be re-added if removed. |
| `editless.cli.activeProvider` | `string` | `"auto"` | window | Active CLI provider: set to `"auto"` to use the first detected provider, or specify a provider name from `editless.cli.providers`. |

### CLI Provider Object Schema

Each entry in `editless.cli.providers` has this structure:

```typescript
{
  name: string;                    // Display name (e.g., "Copilot CLI")
  command: string;                 // Command to run (e.g., "copilot")
  versionCommand: string;          // Command to check version (e.g., "copilot --version")
  versionRegex: string;            // Regex to extract version (e.g., "(\\d+\\.\\d+[\\d.]*)")
  launchCommand: string;           // Command to launch agent (e.g., "copilot --agent $(agent)")
  createCommand: string;           // Command to create new agent (optional)
  updateCommand: string;           // Command to check for updates (optional)
  updateRunCommand: string;        // Command to run updates (optional)
  upToDatePattern: string;         // Pattern in output when up to date
}
```

**Default (Copilot CLI):**

```jsonc
{
  "editless.cli.providers": [
    {
      "name": "Copilot CLI",
      "command": "copilot",
      "versionCommand": "copilot version",
      "versionRegex": "(\\d+\\.\\d+[\\d.]*)",
      "launchCommand": "copilot --agent $(agent)",
      "createCommand": "",
      "updateCommand": "copilot update",
      "updateRunCommand": "",
      "upToDatePattern": "latest version"
    }
  ],
  "editless.cli.activeProvider": "auto"
}
```

---

## GitHub Integration

Settings for displaying GitHub issues and pull requests in the Work Items and Pull Requests panes.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.github.repos` | `array` | `[]` | workspace | GitHub repositories to show in Work Items and Pull Requests panes. Use `"owner/repo"` format (e.g., `["octocat/hello-world"]`). If empty, EditLess auto-detects repositories from workspace using `git remote`. |
| `editless.github.issueFilter` | `object` | `{}` | workspace | Filter which GitHub issues appear by label. See schema below. |

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
| `editless.ado.organization` | `string` | `""` | workspace | Azure DevOps organization URL (e.g., `"https://dev.azure.com/myorg"`). Required to show work items and PRs from ADO. |
| `editless.ado.project` | `string` | `""` | workspace | Azure DevOps project name to display in Work Items and Pull Requests panes (e.g., `"MyProject"`). |

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
| `editless.restoreTerminalLayout` | `boolean` | `true` | window | Automatically maximize the terminal panel when all editor tabs are closed. This enables the full-screen terminal workflow after peeking at a file. Disable if you prefer to manage panel layout manually. |

**Example:**

```jsonc
{
  "editless.refreshInterval": 10,
  "editless.restoreTerminalLayout": true
}
```

---

## Notifications

Settings for controlling desktop toasts and notifications.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.notifications.enabled` | `boolean` | `true` | window | Master toggle for all EditLess notifications. When disabled, **all** EditLess toasts are suppressed — including inbox and update notifications. |
| `editless.notifications.inbox` | `boolean` | `true` | window | Show notifications when new inbox items arrive (pending decisions, work items). A toast fires when the inbox count transitions from 0 → N. Requires `editless.notifications.enabled` to be on. |
| `editless.notifications.updates` | `boolean` | `true` | window | Show notifications when a CLI provider update is available. EditLess checks each detected provider on startup and displays a toast with installed and available versions. Requires `editless.notifications.enabled` to be on. |

**Example:**

```jsonc
{
  "editless.notifications.enabled": true,
  "editless.notifications.inbox": true,
  "editless.notifications.updates": true
}
```

---

## Agent Creation

Settings for customizing the agent creation workflow.

| Setting | Type | Default | Scope | Description |
|---------|------|---------|-------|-------------|
| `editless.agentCreationCommand` | `string` | `""` | workspace | Custom command to run when adding an agent. Overrides the built-in agent creation flow. Supports variable substitution: `${workspaceFolder}` (workspace root path) and `${agentName}` (user-entered agent name). |

**Example — use a custom initialization script:**

```jsonc
{
  "editless.agentCreationCommand": "my-tool init --name ${agentName} --dir ${workspaceFolder}/squads"
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
  "editless.cli.activeProvider": "auto",
  // (cli.providers omitted; uses default Copilot CLI)

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
  "editless.restoreTerminalLayout": true,

  // Notifications
  "editless.notifications.enabled": true,
  "editless.notifications.inbox": true,
  "editless.notifications.updates": true,

  // Agent Creation
  "editless.agentCreationCommand": ""
}
```

---

**For architectural details on how these settings are used, see `docs/architecture.md`.**
