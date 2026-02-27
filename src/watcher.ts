import * as vscode from 'vscode';
import * as path from 'path';
import type { AgentTeamConfig } from './types';
import { TEAM_DIR_NAMES } from './team-dir';
import * as fs from 'fs';

export class SquadWatcher implements vscode.Disposable {
  private _watchers = new Map<string, vscode.FileSystemWatcher>();
  private _timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    squads: AgentTeamConfig[],
    private readonly _onSquadChanged: (squadId: string) => void,
  ) {
    this._createWatchers(squads);
  }

  updateSquads(squads: AgentTeamConfig[]): void {
    this._disposeAll();
    this._createWatchers(squads);
  }

  dispose(): void {
    this._disposeAll();
  }

  // -----------------------------------------------------------------------

  private _createWatchers(squads: AgentTeamConfig[]): void {
    for (const squad of squads) {
      const teamDirName = TEAM_DIR_NAMES.find(
        name => fs.existsSync(path.join(squad.path, name)),
      ) ?? TEAM_DIR_NAMES[0];
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(path.join(squad.path, teamDirName)),
        '**/*',
      );
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      const handler = () => this._debouncedNotify(squad.id);
      watcher.onDidChange(handler);
      watcher.onDidCreate(handler);
      watcher.onDidDelete(handler);

      this._watchers.set(squad.id, watcher);
    }
  }

  private _debouncedNotify(squadId: string): void {
    const existing = this._timers.get(squadId);
    if (existing) clearTimeout(existing);

    const debounceMs = vscode.workspace
      .getConfiguration('editless')
      .get<number>('scanDebounceMs', 300);

    this._timers.set(
      squadId,
      setTimeout(() => {
        this._timers.delete(squadId);
        this._onSquadChanged(squadId);
      }, debounceMs),
    );
  }

  private _disposeAll(): void {
    for (const w of this._watchers.values()) w.dispose();
    this._watchers.clear();
    for (const t of this._timers.values()) clearTimeout(t);
    this._timers.clear();
  }
}
