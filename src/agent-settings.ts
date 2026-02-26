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

export class AgentSettingsManager {
  private _cache: AgentSettingsFile = { agents: {} };

  constructor(public readonly settingsPath: string) {
    this.reload();
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
    const dir = path.dirname(this.settingsPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.settingsPath, JSON.stringify(this._cache, null, 2), 'utf-8');
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
      if (Object.keys(partial).length > 0) {
        settings.update(squad.id, partial);
      }
    }
    return true;
  } catch {
    return false;
  }
}
