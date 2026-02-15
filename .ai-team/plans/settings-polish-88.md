# Plan: Settings Schema, Tooltips, Scope & Ordering Polish

> Linked issue: [#88](https://github.com/cirvine-MSFT/editless/issues/88)

## Problem

All 11 EditLess settings use plain `description` strings with no rich formatting, no `scope` annotations, no display ordering, and only one setting (`cli.provider`) has an `enum`. Users see flat, unstyled text in the settings UI with no grouping, no links to docs, and no per-option explanations for enum values.

## Approach

Full pass over all 11 settings in `package.json` to add: `markdownDescription` (rich tooltips with links and code), `enumDescriptions` / `enumItemLabels` (for enum settings), `scope` annotations, and `order` values for logical grouping. Single file change — `package.json` only.

## Decisions

- **D1:** Use `markdownDescription` alongside `description` (VS Code uses `markdownDescription` when available, falls back to `description` for older clients).
- **D2:** Add `scope` to every setting: `window` for user preferences, `resource` for workspace-specific paths/configs.
- **D3:** Order groups: Core (1-9) → Notifications (10-19) → CLI/Agent (20-29) → GitHub (30-39).
- **D4:** No functional changes — descriptions, schema, and metadata only. No behavior changes.

## Tasks

### T1: Core settings — markdownDescription + scope + order
**File:** `package.json`

| Setting | Scope | Order | Enhancement |
|---------|-------|-------|-------------|
| `editless.registryPath` | `resource` | 1 | markdownDescription with explanation of what the registry is, link to squad docs if applicable |
| `editless.discoveryDir` | `resource` | 2 | markdownDescription explaining scan behavior, note about #75 migration to `scanPaths` |
| `editless.scanDebounceMs` | `resource` | 3 | markdownDescription with default note, explanation of when to adjust |

### T2: Notification settings — markdownDescription + scope + order
**File:** `package.json`

| Setting | Scope | Order | Enhancement |
|---------|-------|-------|-------------|
| `editless.notifications.enabled` | `window` | 10 | markdownDescription: master toggle, note that disabling suppresses all EditLess toasts |
| `editless.notifications.inbox` | `window` | 11 | markdownDescription: explains inbox = pending decisions, when notifications fire (0→N transition) |
| `editless.notifications.updates` | `window` | 12 | markdownDescription: explains CLI update detection, which providers are checked |

### T3: CLI & Agent settings — markdownDescription + enum polish + scope + order
**File:** `package.json`

| Setting | Scope | Order | Enhancement |
|---------|-------|-------|-------------|
| `editless.cli.provider` | `window` | 20 | Add `enumDescriptions` for each provider: copilot ("GitHub Copilot CLI — default, works out of the box"), agency ("Microsoft Agency CLI — internal tool, auto-detected"), claude ("Anthropic Claude CLI"), custom ("User-defined CLI — configure via custom commands"). Add `enumItemLabels`: ["Copilot", "Agency", "Claude", "Custom"]. markdownDescription: "CLI provider for agent sessions. Auto-detected on startup — only change this if auto-detection picks the wrong provider." |
| `editless.agentCreationCommand` | `resource` | 21 | markdownDescription with variable substitution docs (`${workspaceFolder}`, `${agentName}`), example usage in a code block |
| `editless.customCommands` | `resource` | 22 | markdownDescription explaining what custom commands do (appear in terminal context menu), example JSON showing a command entry |

### T4: GitHub settings — markdownDescription + scope + order
**File:** `package.json`

| Setting | Scope | Order | Enhancement |
|---------|-------|-------|-------------|
| `editless.github.repos` | `resource` | 30 | markdownDescription with format example (`"owner/repo"`), note about what appears in Work Items / Pull Requests panes |
| `editless.github.issueFilter` | `resource` | 31 | markdownDescription with example JSON showing `includeLabels` / `excludeLabels` usage |

### T5: Validation
**No new test files needed** — this is metadata-only in package.json.

- Run `npm run lint` to verify package.json is valid TypeScript-consumable
- Run `npm run build` to verify esbuild picks up the config
- Manual smoke test: open VS Code settings UI, verify:
  - Settings are grouped by order
  - markdownDescriptions render with formatting
  - `cli.provider` shows friendly labels and per-option descriptions
  - Scope annotations work (settings appear in correct User/Workspace tabs)

## Out of Scope

- Adding new settings (that's other issues' domain)
- Changing setting defaults or behavior
- Deprecation warnings for `discoveryDir` (that's #75's plan)
