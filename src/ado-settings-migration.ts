import * as vscode from 'vscode';
import type { AdoProjectConfig } from './ado-client';

/**
 * Read the scope-specific value from an inspect result.
 */
function scopeValue<T>(
  inspection: { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined,
  target: vscode.ConfigurationTarget,
): T | undefined {
  if (!inspection) return undefined;
  if (target === vscode.ConfigurationTarget.WorkspaceFolder) return inspection.workspaceFolderValue;
  if (target === vscode.ConfigurationTarget.Workspace) return inspection.workspaceValue;
  return inspection.globalValue;
}

/**
 * Build a connections array from an org URL and project configs at a given scope.
 * Returns empty array if org or projects are missing/empty.
 */
function buildConnections(
  org: string | undefined,
  projectsAtScope: AdoProjectConfig[] | undefined,
  projectAtScope: string | undefined,
): string[] {
  const orgStr = String(org ?? '').trim().replace(/\/+$/, '');
  if (!orgStr) return [];

  const projects: string[] = (projectsAtScope ?? [])
    .filter((p): p is AdoProjectConfig => p != null && typeof p === 'object' && typeof p.name === 'string')
    .filter(p => p.enabled !== false)
    .map(p => p.name.trim())
    .filter(name => name !== '');

  if (projects.length === 0) {
    const fallback = String(projectAtScope ?? '').trim();
    if (fallback) projects.push(fallback);
  }

  return projects.map(p => `${orgStr}/${p}`);
}

/**
 * Migrate deprecated ADO settings at a single scope.
 *
 * Follows the vscode-jupyter ConfigMigration pattern:
 * - Inspect old setting to get scope-specific value
 * - Only write new setting if it doesn't already exist at that scope
 * - Remove old settings at that scope after writing
 * - Naturally idempotent — no external state tracking needed
 */
function migrateScope(
  config: vscode.WorkspaceConfiguration,
  target: vscode.ConfigurationTarget,
  orgInspection: ReturnType<typeof config.inspect<string>>,
  projectsInspection: ReturnType<typeof config.inspect<AdoProjectConfig[]>>,
  projectInspection: ReturnType<typeof config.inspect<string>>,
  connectionsInspection: ReturnType<typeof config.inspect<string[]>>,
): Thenable<void>[] {
  const promises: Thenable<void>[] = [];

  const orgAtScope = scopeValue(orgInspection, target);
  if (orgAtScope === undefined) {
    // No org at this scope — still clean up orphaned project/projects settings
    if (scopeValue(projectsInspection, target) !== undefined) {
      promises.push(config.update('ado.projects', undefined, target).then(noop, logMigrationError));
    }
    if (scopeValue(projectInspection, target) !== undefined) {
      promises.push(config.update('ado.project', undefined, target).then(noop, logMigrationError));
    }
    return promises;
  }

  const connections = buildConnections(
    orgAtScope,
    scopeValue(projectsInspection, target),
    scopeValue(projectInspection, target),
  );

  // Only write new connections if they don't already exist at this scope
  let writePromise: Thenable<void> = Promise.resolve();
  if (connections.length > 0 && scopeValue(connectionsInspection, target) === undefined) {
    writePromise = config.update('ado.connections', connections, target);
  }

  // Remove old settings at this scope (chained after write)
  promises.push(
    writePromise.then(
      () => config.update('ado.organization', undefined, target),
      logMigrationError,
    ),
  );
  if (scopeValue(projectsInspection, target) !== undefined) {
    promises.push(
      writePromise.then(
        () => config.update('ado.projects', undefined, target),
        logMigrationError,
      ),
    );
  }
  if (scopeValue(projectInspection, target) !== undefined) {
    promises.push(
      writePromise.then(
        () => config.update('ado.project', undefined, target),
        logMigrationError,
      ),
    );
  }

  return promises;
}

function noop(): void {}

function logMigrationError(err: unknown): void {
  console.warn('[EditLess] ADO settings migration error:', err);
}

/**
 * Silent migration of deprecated ADO settings to the unified
 * `editless.ado.connections` format. Runs on every activation but is
 * naturally idempotent — inspect() checks prevent duplicate writes.
 *
 * Modeled after microsoft/vscode-jupyter's ConfigMigration pattern:
 * each scope (Global, Workspace, WorkspaceFolder) is migrated independently.
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
  output: vscode.OutputChannel,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('editless');

  const orgInspection = config.inspect<string>('ado.organization');
  const projectsInspection = config.inspect<AdoProjectConfig[]>('ado.projects');
  const projectInspection = config.inspect<string>('ado.project');
  const connectionsInspection = config.inspect<string[]>('ado.connections');

  const promises: Thenable<void>[] = [];

  // Migrate each scope independently
  for (const target of [
    vscode.ConfigurationTarget.WorkspaceFolder,
    vscode.ConfigurationTarget.Workspace,
    vscode.ConfigurationTarget.Global,
  ]) {
    promises.push(
      ...migrateScope(config, target, orgInspection, projectsInspection, projectInspection, connectionsInspection),
    );
  }

  if (promises.length > 0) {
    try {
      await Promise.all(promises);
      output.appendLine('[EditLess] ADO settings migration complete.');
    } catch (err) {
      output.appendLine(`[EditLess] ADO settings migration had errors: ${err}`);
    }
  }
}
