import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createAgentSettings, migrateFromRegistry, type AgentSettings, type AgentSettingsManager } from './agent-settings';
import { initSquadUiContext } from './squad-ui-integration';
import { setAdoAuthOutput } from './ado-auth';
import { EDITLESS_INSTRUCTIONS_DIR } from './terminal-manager';
import type { DiscoveredItem } from './unified-discovery';

// ---------------------------------------------------------------------------
// Instructions file (written to shared dir so Copilot CLI picks it up)
// ---------------------------------------------------------------------------

const EDITLESS_INSTRUCTIONS_CONTENT = `\
---
applyTo: "**"
---
This session may have been launched against a specific work item, issue, or pull request.
The target URI is stored in the EDITLESS_WORK_ITEM_URI environment variable.

IMPORTANT: When the user says "the task", "the work item", "the issue", "the PR",
"start working on it", or otherwise refers to a task without specifying which one,
you MUST first retrieve the URI by running this shell command:

  PowerShell: echo $env:EDITLESS_WORK_ITEM_URI
  Bash/Zsh:   echo $EDITLESS_WORK_ITEM_URI

If the variable is set (non-empty), use that URI as the target:
- If it starts with file:/// it is a local task file. Read the file directly to get the task details.
- Otherwise it is a web URL (GitHub issue, ADO work item, or PR). Fetch details from it
  (e.g. via the GitHub API or gh CLI) and proceed with the user's request.
If the variable is empty or unset, ask the user which task they mean.
`;

export function ensureEditlessInstructions(): void {
  const instructionsDir = path.join(EDITLESS_INSTRUCTIONS_DIR, '.github', 'instructions');
  const filePath = path.join(instructionsDir, 'editless.instructions.md');
  try {
    fs.mkdirSync(instructionsDir, { recursive: true });
    fs.writeFileSync(filePath, EDITLESS_INSTRUCTIONS_CONTENT, 'utf-8');
  } catch (err) {
    console.error('[EditLess] Failed to write instructions file:', err);
  }
}

// ---------------------------------------------------------------------------
// Settings hydration
// ---------------------------------------------------------------------------

/** Compute default AgentSettings for each discovered item and hydrate the settings file. */
export function hydrateSettings(items: DiscoveredItem[], settings: AgentSettingsManager): void {
  const batchPicked = new Set<string>();
  const entries = items.map(item => {
    let icon: string;
    if (item.type === 'agent') {
      icon = '🤖';
    } else {
      const existing = settings.get(item.id);
      if (existing?.icon) {
        icon = existing.icon;
      } else {
        icon = settings.pickNextIcon(batchPicked);
        batchPicked.add(icon);
      }
    }
    return {
      id: item.id,
      defaults: {
        name: item.name,
        icon,
        hidden: false,
        model: '',
        additionalArgs: '',
        command: '',
      } satisfies AgentSettings,
    };
  });
  settings.hydrateFromDiscovery(entries);
}

// ---------------------------------------------------------------------------
// initSettings — output channel, squad UI, agent settings, migration
// ---------------------------------------------------------------------------

export interface SettingsResult {
  agentSettings: AgentSettingsManager;
  output: vscode.OutputChannel;
}

export function initSettings(context: vscode.ExtensionContext): SettingsResult {
  const output = vscode.window.createOutputChannel('EditLess');
  context.subscriptions.push(output);
  setAdoAuthOutput(output);

  initSquadUiContext(context);

  const agentSettings = createAgentSettings(context);

  // Migrate from old agent-registry.json if it exists (one-time, idempotent)
  const oldRegistryDir = context.globalStorageUri?.fsPath ?? context.extensionPath;
  const oldRegistryPath = path.resolve(oldRegistryDir, 'agent-registry.json');
  if (fs.existsSync(oldRegistryPath)) {
    migrateFromRegistry(oldRegistryPath, agentSettings);
  }

  return { agentSettings, output };
}
