import * as vscode from 'vscode';
import type { AgentTeamConfig } from './types';

// ---------------------------------------------------------------------------
// Terminal tracking metadata
// ---------------------------------------------------------------------------

export interface TerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  squadId: string;
  squadName: string;
  squadIcon: string;
  index: number;
  createdAt: Date;
}

interface PersistedTerminalInfo {
  id: string;
  labelKey: string;
  displayName: string;
  squadId: string;
  squadName: string;
  squadIcon: string;
  index: number;
  createdAt: string;
  terminalName: string;
}

const STORAGE_KEY = 'editless.terminalSessions';

// ---------------------------------------------------------------------------
// TerminalManager
// ---------------------------------------------------------------------------

export class TerminalManager implements vscode.Disposable {
  private readonly _terminals = new Map<vscode.Terminal, TerminalInfo>();
  private readonly _counters = new Map<string, number>();

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this._disposables.push(
      vscode.window.onDidCloseTerminal(terminal => {
        if (this._terminals.delete(terminal)) {
          this._persist();
          this._onDidChange.fire();
        }
      }),
    );
  }

  // -- Public API -----------------------------------------------------------

  launchTerminal(config: AgentTeamConfig, customName?: string): vscode.Terminal {
    const index = this._counters.get(config.id) || 1;
    const displayName = customName ?? `${config.icon} ${config.name} #${index}`;
    const id = `${config.id}-${Date.now()}-${index}`;
    const labelKey = `terminal:${id}`;

    const terminal = vscode.window.createTerminal({
      name: displayName,
      cwd: config.path,
    });

    terminal.sendText(config.launchCommand || 'agency copilot --agent squad --yolo -s');
    terminal.show();

    this._terminals.set(terminal, {
      id,
      labelKey,
      displayName,
      squadId: config.id,
      squadName: config.name,
      squadIcon: config.icon,
      index,
      createdAt: new Date(),
    });

    this._counters.set(config.id, index + 1);
    this._persist();
    this._onDidChange.fire();

    return terminal;
  }

  getTerminalsForSquad(squadId: string): { terminal: vscode.Terminal; info: TerminalInfo }[] {
    const results: { terminal: vscode.Terminal; info: TerminalInfo }[] = [];
    for (const [terminal, info] of this._terminals) {
      if (info.squadId === squadId) {
        results.push({ terminal, info });
      }
    }
    return results;
  }

  getAllTerminals(): { terminal: vscode.Terminal; info: TerminalInfo }[] {
    const results: { terminal: vscode.Terminal; info: TerminalInfo }[] = [];
    for (const [terminal, info] of this._terminals) {
      results.push({ terminal, info });
    }
    return results;
  }

  getTerminalInfo(terminal: vscode.Terminal): TerminalInfo | undefined {
    return this._terminals.get(terminal);
  }

  getLabelKey(terminal: vscode.Terminal): string {
    return this._terminals.get(terminal)?.labelKey ?? `terminal:${terminal.name}`;
  }

  getDisplayName(terminal: vscode.Terminal): string {
    return this._terminals.get(terminal)?.displayName ?? terminal.name;
  }

  focusTerminal(terminal: vscode.Terminal): void {
    terminal.show();
  }

  closeTerminal(terminal: vscode.Terminal): void {
    terminal.dispose();
  }

  // -- Persistence & reconciliation -----------------------------------------

  reconcile(): void {
    const saved = this.context.workspaceState.get<PersistedTerminalInfo[]>(STORAGE_KEY, []);
    if (saved.length === 0) return;

    const liveTerminals = vscode.window.terminals;

    for (const persisted of saved) {
      const match = liveTerminals.find(t => t.name === persisted.terminalName);
      if (!match) continue;
      if (this._terminals.has(match)) continue;

      this._terminals.set(match, {
        id: persisted.id,
        labelKey: persisted.labelKey,
        displayName: persisted.displayName,
        squadId: persisted.squadId,
        squadName: persisted.squadName,
        squadIcon: persisted.squadIcon,
        index: persisted.index,
        createdAt: new Date(persisted.createdAt),
      });
    }

    for (const info of this._terminals.values()) {
      const current = this._counters.get(info.squadId) || 0;
      if (info.index >= current) {
        this._counters.set(info.squadId, info.index + 1);
      }
    }

    this._persist();

    if (this._terminals.size > 0) {
      this._onDidChange.fire();
    }
  }

  private _persist(): void {
    const entries: PersistedTerminalInfo[] = [];
    for (const [terminal, info] of this._terminals) {
      entries.push({
        ...info,
        createdAt: info.createdAt.toISOString(),
        terminalName: terminal.name,
      });
    }
    this.context.workspaceState.update(STORAGE_KEY, entries);
  }

  // -- Disposable -----------------------------------------------------------

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._onDidChange.dispose();
  }
}
