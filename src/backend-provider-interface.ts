import type * as vscode from 'vscode';
import type { GitHubIssue } from './github-client';
import type { AdoWorkItem } from './ado-client';
import type { LocalTask } from './local-tasks-client';
import type { WorkItemsTreeItem, LevelFilter, UnifiedState } from './work-items-tree';

/**
 * Interface for backend-specific work item providers.
 * Each backend (GitHub, ADO, Local) implements this to provide
 * work items in a consistent way to the tree view.
 */
export interface IBackendProvider {
  /**
   * Get the unique ID prefix for this backend (e.g., 'github', 'ado', 'local')
   */
  getIdPrefix(): string;

  /**
   * Check if this backend is currently configured/available
   */
  isConfigured(): boolean;

  /**
   * Get root-level tree items for this backend
   */
  getRootItems(): WorkItemsTreeItem[];

  /**
   * Get children for a given tree item
   */
  getChildren(element: WorkItemsTreeItem, filter?: LevelFilter): WorkItemsTreeItem[];

  /**
   * Get tree item for a specific work item
   */
  getTreeItem(element: WorkItemsTreeItem): vscode.TreeItem;

  /**
   * Get available filter options for a node
   */
  getAvailableOptions(nodeId: string, contextValue: string): {
    repos?: string[];
    types?: string[];
    labels?: string[];
    states?: UnifiedState[];
    tags?: string[];
  };

  /**
   * Apply global filter to work items
   */
  applyFilter(filter: {
    repos?: string[];
    types?: string[];
    labels?: string[];
    states?: UnifiedState[];
  }): void;

  /**
   * Clear all data for this backend
   */
  clear(): void;
}

/**
 * Base context for backend providers
 */
export interface BackendProviderContext {
  onDidChangeTreeData: vscode.EventEmitter<WorkItemsTreeItem | undefined | null | void>;
  filterSeq: number;
}
