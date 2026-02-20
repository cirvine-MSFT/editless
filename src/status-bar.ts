import * as vscode from 'vscode';
import type { EditlessRegistry } from './registry';
import type { TerminalManager } from './terminal-manager';

export class EditlessStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

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

    this._render(squadCount, sessionCount);
  }

  updateSessionsOnly(): void {
    const squads = this._registry.loadSquads();
    const squadCount = squads.length;
    const sessionCount = this._terminalManager.getAllTerminals().length;

    this._render(squadCount, sessionCount);
  }

  dispose(): void {
    this._item.dispose();
  }

  private _render(squadCount: number, sessionCount: number): void {
    const text = `$(terminal) ${squadCount} agents · ${sessionCount} sessions`;
    this._item.text = text;
    this._item.show();
  }
}
