import * as vscode from 'vscode';

const STORAGE_KEY = 'editless.sessionLabels';

// ---------------------------------------------------------------------------
// SessionLabelManager
// ---------------------------------------------------------------------------

export class SessionLabelManager {
  private _store: Map<string, string>;

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    const saved = context.workspaceState.get<Record<string, string>>(STORAGE_KEY, {});
    this._store = new Map(Object.entries(saved));
  }

  getLabel(labelKey: string): string | undefined {
    return this._store.get(labelKey);
  }

  setLabel(labelKey: string, label: string): void {
    this._store.set(labelKey, label);
    this._persist();
    this._onDidChange.fire();
  }

  clearLabel(labelKey: string): void {
    if (this._store.delete(labelKey)) {
      this._persist();
      this._onDidChange.fire();
    }
  }

  hasLabel(labelKey: string): boolean {
    return this._store.has(labelKey);
  }

  private _persist(): void {
    const obj: Record<string, string> = {};
    for (const [k, v] of this._store) {
      obj[k] = v;
    }
    this.context.workspaceState.update(STORAGE_KEY, obj);
  }
}

// ---------------------------------------------------------------------------
// Prompt helpers
// ---------------------------------------------------------------------------

export async function promptClearLabel(
  _terminal: vscode.Terminal,
  labelManager: SessionLabelManager,
  labelKey: string,
): Promise<void> {
  labelManager.clearLabel(labelKey);
}
