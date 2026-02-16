import * as vscode from 'vscode';
import type { EditlessRegistry } from './registry';
import type { TerminalManager } from './terminal-manager';
import { scanSquad } from './scanner';

export class EditlessStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private _cachedInboxCount = 0;

  constructor(
    private readonly _registry: EditlessRegistry,
    private readonly _terminalManager: TerminalManager,
  ) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this._item.command = 'workbench.view.extension.editless-dashboard';
    this._item.tooltip = 'EditLess — click to open';
  }

  update(): void {
    const squads = this._registry.loadSquads();
    const squadCount = squads.length;
    const sessionCount = this._terminalManager.getAllTerminals().length;

    let inboxCount = 0;
    for (const squad of squads) {
      const state = scanSquad(squad);
      inboxCount += state.inboxCount;
    }
    this._cachedInboxCount = inboxCount;

    this._render(squadCount, sessionCount, inboxCount);
  }

  updateSessionsOnly(): void {
    const squads = this._registry.loadSquads();
    const squadCount = squads.length;
    const sessionCount = this._terminalManager.getAllTerminals().length;

    this._render(squadCount, sessionCount, this._cachedInboxCount);
  }

  dispose(): void {
    this._item.dispose();
  }

  private _render(squadCount: number, sessionCount: number, _inboxCount: number): void {
    const text = `$(terminal) ${squadCount} agents · ${sessionCount} sessions`;
    // Inbox badge hidden (#204) — inboxCount not reliably updated yet
    // if (inboxCount > 0) {
    //   text += ` · 📥 ${inboxCount}`;
    // }
    this._item.text = text;
    this._item.show();
  }
}
