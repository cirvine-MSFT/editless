import * as vscode from 'vscode';
import type { AgentSettingsManager } from './agent-settings';
import type { TerminalManager } from './terminal-manager';
import type { DiscoveredItem } from './unified-discovery';

export class EditlessStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;
  private _discoveredItems: readonly DiscoveredItem[] = [];

  constructor(
    private readonly _agentSettings: AgentSettingsManager,
    private readonly _terminalManager: TerminalManager,
  ) {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this._item.command = 'workbench.view.extension.editless-dashboard';
    this._item.tooltip = 'EditLess — click to open';
  }

  setDiscoveredItems(items: readonly DiscoveredItem[]): void {
    this._discoveredItems = items;
  }

  update(): void {
    const visibleCount = this._discoveredItems.filter(d => !this._agentSettings.isHidden(d.id)).length;
    const sessionCount = this._terminalManager.getAllTerminals().length;
    this._render(visibleCount, sessionCount);
  }

  updateSessionsOnly(): void {
    this.update();
  }

  dispose(): void {
    this._item.dispose();
  }

  private _render(agentCount: number, sessionCount: number): void {
    const text = `$(terminal) ${agentCount} agents · ${sessionCount} sessions`;
    this._item.text = text;
    this._item.show();
  }
}
