import * as vscode from 'vscode';
import type { GitHubIssue } from './github-client';
import type { AdoWorkItem } from './ado-client';
import type { LocalTask } from './local-tasks-client';

// ── Shared value types ─────────────────────────────────────────────

export type UnifiedState = 'open' | 'active' | 'closed';

export function mapGitHubState(issue: GitHubIssue): UnifiedState {
  if (issue.state === 'closed') return 'closed';
  return issue.assignees.length > 0 ? 'active' : 'open';
}

export function mapAdoState(state: string): UnifiedState {
  const lower = state.toLowerCase();
  if (lower === 'new') return 'open';
  if (lower === 'active' || lower === 'doing') return 'active';
  return 'closed';
}

export interface WorkItemsFilter {
  repos: string[];
  labels: string[];
  states: UnifiedState[];
  types: string[];
  projects: string[];
  assignedToMe: boolean;
}

export interface LevelFilter {
  selectedChildren?: string[];
  types?: string[];
  labels?: string[];
  states?: UnifiedState[];
  tags?: string[];
}

// ── Tree item ──────────────────────────────────────────────────────

export class WorkItemsTreeItem extends vscode.TreeItem {
  public issue?: GitHubIssue;
  public adoWorkItem?: AdoWorkItem;
  public localTask?: LocalTask;

  constructor(
    label: string,
    collapsible: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
  ) {
    super(label, collapsible);
  }
}

// ── Render context (tree → provider bridge) ────────────────────────

export interface TreeRenderContext {
  readonly filterSeq: number;
  readonly filter: WorkItemsFilter;
  getFilterDescription(nodeId: string, count: number): string;
  contextWithFilter(base: string, nodeId: string): string;
  cleanNodeId(id: string): string;
  getLevelFilter(nodeId: string): LevelFilter | undefined;
  matchesLabelFilter(labels: string[], filters: string[]): boolean;
}

// ── Available filter options (returned by getAvailableOptions) ─────

export interface AvailableFilterOptions {
  owners?: string[];
  repos?: string[];
  orgs?: string[];
  projects?: string[];
  types?: string[];
  labels?: string[];
  states?: UnifiedState[];
  tags?: string[];
}

// ── Backend provider interface (strategy pattern) ──────────────────

export interface IWorkItemBackendProvider {
  readonly backendId: string;
  readonly label: string;
  readonly icon: string;

  isConfigured(): boolean;
  hasFilteredItems(ctx: TreeRenderContext): boolean;
  getFilteredItemCount(ctx: TreeRenderContext): number;

  /** Context values this provider handles in getChildren dispatch */
  handlesContext(ctx: string): boolean;

  /** Root items when this is the only active backend */
  getSingleBackendRootItems(ctx: TreeRenderContext): WorkItemsTreeItem[];

  /** Backend group node for multi-backend view */
  createBackendGroupItem(itemCount: number, ctx: TreeRenderContext): WorkItemsTreeItem;

  /** "Configure in X" placeholder item */
  getConfigureItem(): WorkItemsTreeItem;

  /** Children for a context this provider handles */
  getChildren(element: WorkItemsTreeItem, ctx: string, renderCtx: TreeRenderContext): WorkItemsTreeItem[];

  /** Available filter options for nodes this provider handles */
  getAvailableOptions(nodeId: string, baseContext: string): AvailableFilterOptions | null;

  /** Labels for the unified getAllLabels() */
  getAllLabels(): string[];

  /** Repo identifiers for getAllRepos() (e.g. '(Local)', '(ADO)') */
  getRepoIdentifiers(): string[];

  /** Create fetch promises for _doFetchAll */
  createFetchPromises(): Promise<void>[];

  /** Clear all data */
  clear(): void;
}
