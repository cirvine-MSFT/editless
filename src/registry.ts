import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentTeamConfig } from './types';

export class EditlessRegistry {
  private _squads: AgentTeamConfig[] = [];

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

  getSquad(id: string): AgentTeamConfig | undefined {
    return this._squads.find(s => s.id === id);
  }

  updateSquad(id: string, updates: Partial<Pick<AgentTeamConfig, 'name' | 'icon' | 'description' | 'universe' | 'launchCommand'>>): boolean {
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
