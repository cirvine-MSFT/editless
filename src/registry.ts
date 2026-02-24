import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTeamConfig } from './types';
import { parseTeamMd, readUniverseFromRegistry } from './discovery';
import { resolveTeamMd } from './team-dir';

export class EditlessRegistry {
  private _squads: AgentTeamConfig[] = [];
  private _detectionDone = false;

  constructor(public readonly registryPath: string) {}

  loadSquads(): AgentTeamConfig[] {
    try {
      const raw = fs.readFileSync(this.registryPath, 'utf-8');
      const data = JSON.parse(raw);
      const parsed = Array.isArray(data.squads) ? data.squads : [];
      // Deduplicate by id — keep first occurrence
      const seen = new Set<string>();
      this._squads = parsed.filter((s: AgentTeamConfig) => {
        if (seen.has(s.id)) { return false; }
        seen.add(s.id);
        return true;
      });
      // Run in-memory migrations and re-detection; track if anything changed
      let registryDirty = false;
      for (const squad of this._squads) {
        if (this.migrateLegacyLaunchCommand(squad)) { registryDirty = true; }
      }
      if (!this._detectionDone) {
        this._detectionDone = true;
        for (const squad of this._squads) {
          if (this.redetectUnknownUniverse(squad)) { registryDirty = true; }
        }
      }
      // Persist migration and re-detection changes to disk
      if (registryDirty) {
        try {
          const existing = JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
          existing.squads = this._squads;
          fs.writeFileSync(this.registryPath, JSON.stringify(existing, null, 2), 'utf-8');
        } catch { /* ignore persist failures */ }
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`[EditlessRegistry] Registry file not found: ${this.registryPath}`);
      } else {
        console.error(`[EditlessRegistry] Failed to load registry: ${err}`);
      }
      this._squads = [];
    }
    return this._squads;
  }

  /** Migrate a legacy `launchCommand` string to structured fields. Returns true if changes were made. */
  private migrateLegacyLaunchCommand(squad: AgentTeamConfig): boolean {
    const raw = squad as AgentTeamConfig & { launchCommand?: string };
    if (!raw.launchCommand) { return false; }
    const modelMatch = raw.launchCommand.match(/--model\s+(\S+)/);
    if (modelMatch) { squad.model = modelMatch[1]; }
    // Extract remaining flags (strip copilot binary, --agent, --model)
    const remaining = raw.launchCommand
      .replace(/^\S+/, '')            // strip binary name
      .replace(/--agent\s+\S+/g, '')
      .replace(/--model\s+\S+/g, '')
      .trim();
    if (remaining) { squad.additionalArgs = remaining; }
    delete raw.launchCommand;
    return true;
  }

  /** Re-detect universe for a squad with 'unknown' universe. Returns true if updated. */
  private redetectUnknownUniverse(squad: AgentTeamConfig): boolean {
    if (squad.universe !== 'unknown' || !squad.path) { return false; }
    let detected: string | undefined;
    try {
      const teamMdPath = resolveTeamMd(squad.path);
      if (teamMdPath) {
        const content = fs.readFileSync(teamMdPath, 'utf-8');
        const parsed = parseTeamMd(content, path.basename(squad.path));
        if (parsed.universe !== 'unknown') {
          detected = parsed.universe;
        }
      }
    } catch { /* team.md read/parse failure — continue to next source */ }
    if (!detected) {
      try {
        detected = readUniverseFromRegistry(squad.path);
      } catch { /* casting/registry.json failure — skip */ }
    }
    if (detected) {
      squad.universe = detected;
      return true;
    }
    return false;
  }

  getSquad(id: string): AgentTeamConfig | undefined {
    return this._squads.find(s => s.id === id);
  }

  updateSquad(id: string, updates: Partial<Pick<AgentTeamConfig, 'name' | 'icon' | 'description' | 'universe' | 'model' | 'additionalArgs'>>): boolean {
    this.loadSquads();
    const idx = this._squads.findIndex(s => s.id === id);
    if (idx === -1) return false;
    Object.assign(this._squads[idx], updates);
    const existing = (() => {
      try {
        return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
      } catch {
        return { version: '1.0', squads: [] };
      }
    })();
    existing.squads = this._squads;
    fs.writeFileSync(this.registryPath, JSON.stringify(existing, null, 2), 'utf-8');
    return true;
  }

  addSquads(squads: AgentTeamConfig[]): void {
    this.loadSquads();
    const existingIds = new Set(this._squads.map(s => s.id));
    const unique = squads.filter(s => !existingIds.has(s.id));
    if (unique.length === 0) { return; }
    this._squads.push(...unique);
    const existing = (() => {
      try {
        return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
      } catch {
        return { version: '1.0', squads: [] };
      }
    })();
    existing.squads = this._squads;
    fs.writeFileSync(this.registryPath, JSON.stringify(existing, null, 2), 'utf-8');
  }
}

export function createRegistry(context: vscode.ExtensionContext): EditlessRegistry {
  const config = vscode.workspace.getConfiguration('editless');
  let registryPath = config.get<string>('registryPath', './agent-registry.json');

  if (!path.isAbsolute(registryPath)) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const base = workspaceFolder
      ? workspaceFolder.uri.fsPath
      : (context.storageUri?.fsPath ?? context.extensionPath);
    registryPath = path.resolve(base, registryPath);
  }

  // Migrate from old squad-registry.json if new file doesn't exist
  if (!fs.existsSync(registryPath)) {
    const oldPath = registryPath.replace('agent-registry.json', 'squad-registry.json');
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, registryPath);
    }
  }

  // Auto-create empty registry for resilience (#406)
  if (!fs.existsSync(registryPath)) {
    const dir = path.dirname(registryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(registryPath, JSON.stringify({ version: '1.0', squads: [] }, null, 2), 'utf-8');
  }

  return new EditlessRegistry(registryPath);
}

export function watchRegistry(
  registry: EditlessRegistry,
  onChange: () => void,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(registry.registryPath);
  const handler = () => {
    registry.loadSquads();
    onChange();
  };
  watcher.onDidChange(handler);
  watcher.onDidCreate(handler);
  watcher.onDidDelete(handler);
  return watcher;
}
