# EditLess Settings

All settings are accessible through VS Code's Settings UI (**Ctrl+,**) or directly in your `settings.json`. Each setting is prefixed with `editless.`.

## General

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `editless.registryPath` | `string` | `"./agent-registry.json"` | Path to the agent registry JSON file |
| `editless.discoveryDir` | `string` | `""` | Directory to scan for squad projects |
| `editless.scanDebounceMs` | `number` | `500` | Debounce interval in milliseconds for file system scanning |
| `editless.refreshInterval` | `number` | `5` | Auto-refresh interval in minutes for Work Items and PRs panels. Set to 0 to disable |

## CLI

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `editless.cli.provider` | `string` | `"copilot"` | CLI provider for agent sessions. Auto-detected on startup. Allowed values: `"copilot"`, `"claude"`, `"custom"` |
## GitHub Integration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `editless.github.repos` | `string[]` | `[]` | GitHub repositories to show work items and PRs from (e.g., `["owner/repo"]`). If empty, auto-detects from current workspace |
| `editless.github.issueFilter` | `object` | `{}` | Filter GitHub issues by labels (see below) |
| `editless.github.issueFilter.includeLabels` | `string[]` | `[]` | Only show issues with at least one of these labels. Empty means show all |
| `editless.github.issueFilter.excludeLabels` | `string[]` | `[]` | Hide issues with any of these labels |

**Example — issue filtering:**

```jsonc
"editless.github.repos": ["myorg/frontend", "myorg/backend"],
"editless.github.issueFilter": {
  "includeLabels": ["squad:backend", "bug"],
  "excludeLabels": ["wontfix"]
}
```

## Notifications

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `editless.notifications.enabled` | `boolean` | `true` | Enable desktop notifications for squad events |
| `editless.notifications.inbox` | `boolean` | `true` | Enable notifications for inbox items (new decisions, pending work) |
| `editless.notifications.updates` | `boolean` | `true` | Enable notifications for CLI update availability |
