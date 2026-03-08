import * as vscode from 'vscode';
import type { AdoProjectConfig } from './ado-client';

/**
 * Determine the most specific ConfigurationTarget where a setting is defined.
 * Returns undefined if the setting is not configured at any scope.
 */
function detectScope(
  inspection: {
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
  } | undefined,
): vscode.ConfigurationTarget | undefined {
  if (!inspection) return undefined;
  if (inspection.workspaceFolderValue !== undefined) return vscode.ConfigurationTarget.WorkspaceFolder;
  if (inspection.workspaceValue !== undefined) return vscode.ConfigurationTarget.Workspace;
  if (inspection.globalValue !== undefined) return vscode.ConfigurationTarget.Global;
  return undefined;
}

/**
 * Silent, one-time migration of deprecated ADO settings to the unified
 * `editless.ado.connections` format.
 *
 * Old format (3 settings):
 *   ado.organization  = "https://dev.azure.com/myorg"
 *   ado.projects      = [{ name: "A", enabled: true }, ...]
 *   ado.project       = "FallbackProject"
 *
 * New format (1 setting):
 *   ado.connections   = ["https://dev.azure.com/myorg/A", ...]
 */
export async function migrateAdoSettings(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): Promise<boolean> {
  // Idempotency: skip if already migrated for this workspace
  if (context.workspaceState.get<boolean>('adoSettingsMigrated')) {
    return false;
  }

  const config = vscode.workspace.getConfiguration('editless');

  // If new-format connections already exist, mark migrated and skip
  const existingConnections = config.get<string[]>('ado.connections', []);
  if (existingConnections.length > 0) {
    await context.workspaceState.update('adoSettingsMigrated', true);
    return false;
  }

  // Read legacy settings
  const org = String(config.get<string>('ado.organization') ?? '').trim().replace(/\/+$/, '');
  const projectsConfig = config.get<AdoProjectConfig[]>('ado.projects', []);
  const legacyProject = String(config.get<string>('ado.project') ?? '').trim();

  // Build list of enabled project names
  const projects: string[] = (projectsConfig ?? [])
    .filter((p): p is AdoProjectConfig => p != null && typeof p === 'object' && typeof p.name === 'string')
    .filter(p => p.enabled !== false)
    .map(p => p.name.trim())
    .filter(name => name !== '');

  // Fall back to single legacy project if multi-project list is empty
  if (projects.length === 0 && legacyProject) {
    projects.push(legacyProject);
  }

  // Nothing to migrate if org or projects are empty
  if (!org || projects.length === 0) {
    await context.workspaceState.update('adoSettingsMigrated', true);
    return false;
  }

  // Build new connections array
  const newConnections = projects.map(p => `${org}/${p}`);

  // Detect the scope where old settings were defined
  const orgInspection = config.inspect<string>('ado.organization');
  const target = detectScope(orgInspection) ?? vscode.ConfigurationTarget.Workspace;

  try {
    // Write new format
    await config.update('ado.connections', newConnections, target);

    // Remove deprecated settings at the same scope
    await config.update('ado.organization', undefined, target);
    await config.update('ado.project', undefined, target);
    await config.update('ado.projects', undefined, target);

    output.appendLine(
      `[EditLess] Migrated ADO settings → ado.connections: ${JSON.stringify(newConnections)}`,
    );

    await context.workspaceState.update('adoSettingsMigrated', true);
    return true;
  } catch (err) {
    output.appendLine(`[EditLess] ADO settings migration failed: ${err}`);
    // Do NOT mark as migrated on failure — allow retry on next activation.
    // The runtime fallback in initAdoIntegration handles legacy settings gracefully.
    return false;
  }
}
