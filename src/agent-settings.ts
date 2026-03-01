import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentSettings {
  hidden?: boolean;
  model?: string;
  additionalArgs?: string;
  icon?: string;
  name?: string;
}

export interface AgentSettingsFile {
  agents: Record<string, AgentSettings>;
}

export class AgentSettingsManager implements vscode.Disposable {
  private _cache: AgentSettingsFile = { agents: {} };

  private _watcher?: vscode.FileSystemWatcher;
  private _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(public readonly settingsPath: string) {
    this.reload();
    // Use RelativePattern with Uri base — raw absolute paths on Windows have
    // backslashes misinterpreted as glob escapes (#399 round-1 fix).
    const dir = path.dirname(settingsPath);
    const file = path.basename(settingsPath);
    this._watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(dir), file),
    );
    const onFileEvent = (): void => { this.reload(); this._onDidChange.fire(); };
    this._watcher.onDidChange(onFileEvent);
    this._watcher.onDidCreate(onFileEvent);
    this._watcher.onDidDelete(onFileEvent);
  }

  dispose() {
    this._watcher?.dispose();
    this._onDidChange.dispose();
  }

  get(id: string): AgentSettings | undefined {
    return this._cache.agents[id];
  }

  getAll(): Record<string, AgentSettings> {
    return { ...this._cache.agents };
  }

  update(id: string, partial: Partial<AgentSettings>): void {
    const existing = this._cache.agents[id] ?? {};
    this._cache.agents[id] = { ...existing, ...partial };
    this._writeToDisk();
  }

  remove(id: string): void {
    delete this._cache.agents[id];
    this._writeToDisk();
  }

  isHidden(id: string): boolean {
    return this._cache.agents[id]?.hidden === true;
  }

  hide(id: string): void {
    this.update(id, { hidden: true });
  }

  show(id: string): void {
    const entry = this._cache.agents[id];
    if (entry) {
      delete entry.hidden;
      this._writeToDisk();
    }
  }

  getHiddenIds(): string[] {
    return Object.entries(this._cache.agents)
      .filter(([, v]) => v.hidden === true)
      .map(([k]) => k);
  }

  showAll(): void {
    for (const entry of Object.values(this._cache.agents)) {
      delete entry.hidden;
    }
    this._writeToDisk();
  }

  /**
   * Ensure every discovered agent has an entry with all fields populated.
   * User-customized values are never overwritten — only missing fields get defaults.
   * Writes to disk once if any changes were made.
   */
  hydrateFromDiscovery(entries: { id: string; defaults: AgentSettings }[]): void {
    let changed = false;
    for (const { id, defaults } of entries) {
      const existing = this._cache.agents[id];
      if (!existing) {
        this._cache.agents[id] = { ...defaults };
        changed = true;
        continue;
      }
      // Fill in missing fields only
      for (const [key, value] of Object.entries(defaults)) {
        if (!(key in existing)) {
          (existing as Record<string, unknown>)[key] = value;
          changed = true;
        }
      }
    }
    if (changed) {
      this._writeToDisk();
    }
  }

  reload(): void {
    try {
      const raw = fs.readFileSync(this.settingsPath, 'utf-8');
      const data = JSON.parse(raw) as AgentSettingsFile;
      this._cache = {
        agents: data.agents && typeof data.agents === 'object' ? data.agents : {},
      };
    } catch {
      this._cache = { agents: {} };
    }
  }

  private _writeToDisk(): void {
    try {
      const dir = path.dirname(this.settingsPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(this._cache, null, 2), 'utf-8');
    } catch {
      // Write failed (disk full, permissions) — cache remains authoritative for this session.
      // Next reload() will reconcile from whatever is on disk.
    }
  }
}

export function createAgentSettings(context: vscode.ExtensionContext): AgentSettingsManager {
  const settingsPath = path.join(context.globalStorageUri.fsPath, 'agent-settings.json');
  return new AgentSettingsManager(settingsPath);
}

export function migrateFromRegistry(oldRegistryPath: string, settings: AgentSettingsManager): boolean {
  try {
    const raw = fs.readFileSync(oldRegistryPath, 'utf-8');
    const data = JSON.parse(raw);
    const squads = Array.isArray(data.squads) ? data.squads : [];
    if (squads.length === 0) return false;

    for (const squad of squads) {
      if (!squad.id) continue;
      const partial: Partial<AgentSettings> = {};
      if (squad.icon) partial.icon = squad.icon;
      if (squad.model) partial.model = squad.model;
      if (squad.additionalArgs) partial.additionalArgs = squad.additionalArgs;
      if (squad.name) partial.name = squad.name;
      // Always create an entry so the agent is visible in settings,
      // even if it has no custom overrides (just id+path in old registry).
      settings.update(squad.id, partial);
    }
    return true;
  } catch {
    return false;
  }
}
