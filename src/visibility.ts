import * as vscode from 'vscode';

const STORAGE_KEY = 'editless.hiddenAgents';

export class AgentVisibilityManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  isHidden(id: string): boolean {
    return this.loadHiddenIds().has(id);
  }

  hide(id: string): void {
    const hidden = this.loadHiddenIds();
    hidden.add(id);
    this.persist(hidden);
  }

  show(id: string): void {
    const hidden = this.loadHiddenIds();
    hidden.delete(id);
    this.persist(hidden);
  }

  getHiddenIds(): string[] {
    return [...this.loadHiddenIds()];
  }

  showAll(): void {
    this.persist(new Set());
  }

  private loadHiddenIds(): Set<string> {
    const stored = this.context.workspaceState.get<string[]>(STORAGE_KEY, []);
    return new Set(stored);
  }

  private persist(ids: Set<string>): void {
    this.context.workspaceState.update(STORAGE_KEY, [...ids]);
  }
}
