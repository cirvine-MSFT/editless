import * as vscode from 'vscode';

export class TerminalLayoutManager implements vscode.Disposable {
  private panelWasMaximized = false;
  private hadVisibleEditors = false;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.hadVisibleEditors = vscode.window.visibleTextEditors.length > 0;

    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(editors => {
        // Debounce to avoid reacting to transient zero-editor states during tab switches
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.onEditorsChanged(editors), 150);
      }),
    );
  }

  private isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('editless')
      .get<boolean>('restoreTerminalLayout', true);
  }

  private onEditorsChanged(editors: readonly vscode.TextEditor[]): void {
    if (!this.isEnabled()) {
      this.hadVisibleEditors = editors.length > 0;
      return;
    }

    if (editors.length > 0 && !this.hadVisibleEditors) {
      // Editor opened from no-editor state — record that panel was maximized
      this.panelWasMaximized = true;
    }

    if (editors.length === 0 && this.hadVisibleEditors && this.panelWasMaximized) {
      // All editors closed — restore maximized panel
      vscode.commands.executeCommand('workbench.action.toggleMaximizedPanel');
      this.panelWasMaximized = false;
    }

    this.hadVisibleEditors = editors.length > 0;
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
