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
      this._squads = Array.isArray(data.squads) ? data.squads : [];
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
    this._squads.push(...squads);
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
  let registryPath = config.get<string>('registryPath', './squad-registry.json');

  if (!path.isAbsolute(registryPath)) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const base = workspaceFolder
      ? workspaceFolder.uri.fsPath
      : (context.storageUri?.fsPath ?? context.extensionPath);
    registryPath = path.resolve(base, registryPath);
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
