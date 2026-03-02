import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EditlessTreeItem, DEFAULT_COPILOT_CLI_ID, buildCopilotCLIConfig } from '../editless-tree';
import type { EditlessTreeProvider } from '../editless-tree';
import type { AgentSettingsManager } from '../agent-settings';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import type { DiscoveredItem } from '../unified-discovery';
import { toAgentTeamConfig } from '../unified-discovery';
import { openSquadUiDashboard } from '../squad-ui-integration';
import type { AgentTeamConfig } from '../types';

const execFileAsync = promisify(execFile);

export interface AgentCommandDeps {
  agentSettings: AgentSettingsManager;
  treeProvider: EditlessTreeProvider;
  terminalManager: TerminalManager;
  labelManager: SessionLabelManager;
  getDiscoveredItems: () => DiscoveredItem[];
  refreshDiscovery: () => void;
  ensureWorkspaceFolder: (dirPath: string) => void;
  output: vscode.OutputChannel;
}

/** Validate a git branch name (no spaces, basic ref safety). Exported for testing. */
export function isValidBranchName(name: string): boolean {
  if (!name || /\s/.test(name)) return false;
  if (/[~^:?*\[\\]/.test(name)) return false;
  if (name.includes('..') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock') || name.endsWith('.')) return false;
  return true;
}

/** Compute the default worktree path. Exported for testing. */
export function defaultWorktreePath(repoPath: string, branch: string): string {
  const repoName = path.basename(repoPath);
  const slug = branch.replace(/\//g, '-');
  return path.join(path.dirname(repoPath), `${repoName}.wt`, slug);
}

const modelChoices = [
  { label: 'claude-opus-4.6', description: 'Premium' },
  { label: 'claude-opus-4.6-fast', description: 'Premium (fast)' },
  { label: 'claude-opus-4.5', description: 'Premium' },
  { label: 'claude-sonnet-4.5', description: 'Standard' },
  { label: 'claude-sonnet-4', description: 'Standard' },
  { label: 'gpt-5.2-codex', description: 'Standard' },
  { label: 'gpt-5.2', description: 'Standard' },
  { label: 'gpt-5.1-codex-max', description: 'Standard' },
  { label: 'gpt-5.1-codex', description: 'Standard' },
  { label: 'gpt-5.1', description: 'Standard' },
  { label: 'gpt-5', description: 'Standard' },
  { label: 'gemini-3-pro-preview', description: 'Standard' },
  { label: 'claude-haiku-4.5', description: 'Fast/Cheap' },
  { label: 'gpt-5.1-codex-mini', description: 'Fast/Cheap' },
  { label: 'gpt-5-mini', description: 'Fast/Cheap' },
  { label: 'gpt-4.1', description: 'Fast/Cheap' },
];

export function register(context: vscode.ExtensionContext, deps: AgentCommandDeps): void {
  const {
    agentSettings, treeProvider, terminalManager, labelManager,
    getDiscoveredItems, refreshDiscovery, ensureWorkspaceFolder, output,
  } = deps;

  // Squad discovery command — triggers unified discovery (#317)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.discoverSquads', () => {
      refreshDiscovery();
    }),
  );

  // Rename squad (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSquad', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const disc = getDiscoveredItems().find(d => d.id === item.squadId);
      const settings = agentSettings.get(item.squadId);
      const currentName = settings?.name ?? disc?.name ?? item.squadId;

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${currentName}"`,
        value: currentName,
        validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (newName && newName !== currentName) {
        agentSettings.update(item.squadId, { name: newName });
        treeProvider.refresh();
      }
    }),
  );

  // Go to squad settings in agent-settings.json (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToSquadSettings', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;

      const doc = await vscode.workspace.openTextDocument(agentSettings.settingsPath);
      const editor = await vscode.window.showTextDocument(doc);

      const text = doc.getText();
      const needle = `"${item.squadId}"`;
      const offset = text.indexOf(needle);
      if (offset !== -1) {
        const pos = doc.positionAt(offset);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }),
  );

  // Change model (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.changeModel', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const disc = getDiscoveredItems().find(d => d.id === item.squadId);
      const settings = agentSettings.get(item.squadId);
      if (!disc && !settings) return;

      const currentModel = settings?.model;
      const displayName = settings?.name ?? disc?.name ?? item.squadId;
      const picks = modelChoices.map(m => ({
        ...m,
        description: m.label === currentModel ? `${m.description} ✓ current` : m.description,
      }));

      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `Model for ${displayName} (current: ${currentModel ?? 'unknown'})`,
      });
      if (!pick || pick.label === currentModel) return;

      agentSettings.update(item.squadId, { model: pick.label });
      treeProvider.refresh();
      vscode.window.showInformationMessage(`${displayName} model → ${pick.label}`);
    }),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.refresh', () => {
      refreshDiscovery();
      treeProvider.refresh();
      output.appendLine('[refresh] Tree refreshed');
    }),
  );

  // Launch session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchSession', async (squadIdOrItem?: string | EditlessTreeItem) => {
      // Handle the built-in Copilot CLI default agent
      const isDefaultAgent = (typeof squadIdOrItem !== 'string' && squadIdOrItem?.type === 'default-agent')
        || squadIdOrItem === DEFAULT_COPILOT_CLI_ID;
      if (isDefaultAgent) {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        terminalManager.launchTerminal(buildCopilotCLIConfig(cwd));
        return;
      }

      const allItems = treeProvider.getDiscoveredItems();

      let chosen: string | undefined = typeof squadIdOrItem === 'string'
        ? squadIdOrItem
        : squadIdOrItem?.squadId;
      if (!chosen) {
        const cliItem = { label: '$(terminal) Copilot CLI', description: 'standalone', id: DEFAULT_COPILOT_CLI_ID };
        const discoveredPicks = allItems.filter(d => !agentSettings.isHidden(d.id)).map(d => ({
          label: `${d.type === 'squad' ? '🔷' : '🤖'} ${d.name}`,
          description: d.universe ?? d.source,
          id: d.id,
        }));
        const pick = await vscode.window.showQuickPick(
          [cliItem, ...discoveredPicks],
          { placeHolder: 'Select an agent to launch' },
        );
        chosen = pick?.id;
      }

      if (chosen) {
        if (chosen === DEFAULT_COPILOT_CLI_ID) {
          const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          terminalManager.launchTerminal(buildCopilotCLIConfig(cwd));
        } else {
          const disc = allItems.find(d => d.id === chosen);
          if (disc) {
            const settings = agentSettings.get(disc.id);
            const cfg = toAgentTeamConfig(disc, settings);
            terminalManager.launchTerminal(cfg);
          }
        }
      }
    }),
  );

  // Hide/Show agent (context menu — toggles based on current state)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.hideAgent', (item?: EditlessTreeItem) => {
      if (!item) return;
      const rawId = item.squadId ?? item.id;
      if (!rawId) return;
      const id = rawId.replace(/^discovered:/, '');
      if (item.type === 'squad-hidden') {
        agentSettings.show(id);
      } else {
        agentSettings.hide(id);
      }
      treeProvider.refresh();
    }),
  );

  // Show a single hidden agent (context menu on squad-hidden items)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.showAgent', (item?: EditlessTreeItem) => {
      if (!item) return;
      const rawId = item.squadId ?? item.id;
      if (!rawId) return;
      agentSettings.show(rawId);
      treeProvider.refresh();
    }),
  );

  // Show hidden agents (QuickPick)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.showHiddenAgents', async () => {
      const hiddenIds = agentSettings.getHiddenIds();
      if (hiddenIds.length === 0) {
        vscode.window.showInformationMessage('No hidden agents.');
        return;
      }

      const discoveredItems = getDiscoveredItems();
      const picks = hiddenIds.map(id => {
        const disc = discoveredItems.find(d => d.id === id);
        if (disc) {
          return { label: disc.type === 'squad' ? `🔷 ${disc.name}` : `🤖 ${disc.name}`, description: disc.source, id };
        }
        return { label: id, description: 'unknown', id };
      });

      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select agents to show',
        canPickMany: true,
      });
      if (selected) {
        for (const pick of selected) {
          agentSettings.show(pick.id);
        }
        treeProvider.refresh();
      }
    }),
  );

  // Show all agents
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.showAllAgents', () => {
      agentSettings.showAll();
      treeProvider.refresh();
    }),
  );

  // Open in Squad UI (context menu on squads — visible only when SquadUI is installed)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openInSquadUi', (item?: EditlessTreeItem) => {
      const disc = item?.squadId ? getDiscoveredItems().find(d => d.id === item.squadId) : undefined;
      return openSquadUiDashboard(disc?.path);
    }),
  );

  // Re-launch orphaned session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.relaunchSession', (arg?: EditlessTreeItem) => {
      const entry = arg?.persistedEntry;
      if (entry) {
        terminalManager.relaunchSession(entry);
      }
    }),
  );

  // Dismiss orphaned session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.dismissOrphan', (arg?: EditlessTreeItem) => {
      const entry = arg?.persistedEntry;
      if (entry) {
        terminalManager.dismissOrphan(entry);
      }
    }),
  );

  // Re-launch all orphaned sessions
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.relaunchAllOrphans', () => {
      terminalManager.relaunchAllOrphans();
    }),
  );

  // Add New — QuickPick to choose between Agent or Squad
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addNew', async () => {
      const pick = await vscode.window.showQuickPick(
        [
          { label: '$(file-code) Agent', description: 'Create an agent template file', value: 'agent' as const },
          { label: '$(terminal) Session', description: 'Launch a new agent session', value: 'session' as const },
          { label: '$(organization) Squad', description: 'Initialize a new Squad project', value: 'squad' as const },
        ],
        { placeHolder: 'What would you like to add?' },
      );
      if (!pick) return;
      if (pick.value === 'agent') {
        await vscode.commands.executeCommand('editless.addAgent');
      } else if (pick.value === 'session') {
        await vscode.commands.executeCommand('editless.launchSession');
      } else {
        await vscode.commands.executeCommand('editless.addSquad');
      }
    }),
  );

  // Add Agent — pick personal vs workspace location, then create
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addAgent', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Agent name',
        placeHolder: 'my-agent',
        validateInput: v => {
          if (!v.trim()) return 'Name cannot be empty';
          if (!/^[a-zA-Z0-9_-]+$/.test(v.trim())) return 'Use only letters, numbers, hyphens, underscores';
          return undefined;
        },
      });
      if (!name) return;

      type LocationValue = 'personal' | 'project';
      const locationItems: { label: string; description: string; value: LocationValue }[] = [
        { label: '$(account) Personal agent', description: '~/.copilot/agents/', value: 'personal' },
        { label: '$(root-folder) Project agent', description: '.github/agents/ in a project directory', value: 'project' },
      ];
      const locationPick = await vscode.window.showQuickPick(locationItems, {
        placeHolder: 'Where should the agent live?',
      });
      if (!locationPick) return;

      let agentsDir: string;
      let projectRoot: string | undefined;

      if (locationPick.value === 'personal') {
        agentsDir = path.join(os.homedir(), '.copilot', 'agents');
      } else {
        const picked = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select project root',
          title: 'Select the project root directory',
        });
        if (!picked || picked.length === 0) return;
        projectRoot = picked[0].fsPath;
        agentsDir = path.join(projectRoot, '.github', 'agents');
      }

      await vscode.workspace.fs.createDirectory(vscode.Uri.file(agentsDir));

      const filePath = path.join(agentsDir, `${name.trim()}.agent.md`);
      if (fs.existsSync(filePath)) {
        vscode.window.showWarningMessage(`Agent file already exists: ${filePath}`);
        return;
      }

      const template = [
        '---',
        `description: "${name.trim()} agent"`,
        '---',
        '',
        `# ${name.trim()}`,
        '',
        '> Describe what this agent does',
        '',
        '## Instructions',
        '',
        'Add your agent instructions here.',
        '',
      ].join('\n');

      try {
        fs.writeFileSync(filePath, template, 'utf-8');
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create agent file: ${err instanceof Error ? err.message : err}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      // Add workspace folder — triggers discovery via onDidChangeWorkspaceFolders
      if (projectRoot) {
        ensureWorkspaceFolder(projectRoot);
      }
      refreshDiscovery();
      treeProvider.refresh();
    }),
  );

  // Add Squad — open a folder picker, git init, and run squad init in a terminal
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.addSquad', async () => {
      const { checkNpxAvailable, promptInstallNode, isSquadInitialized } = await import('../squad-utils');
      
      const npxAvailable = await checkNpxAvailable();
      if (!npxAvailable) {
        await promptInstallNode();
        return;
      }

      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select directory for new squad',
      });
      if (!uris || uris.length === 0) return;

      const dirPath = uris[0].fsPath;

      if (isSquadInitialized(dirPath)) {
        // Already initialized — just add workspace folder, discovery handles the rest
        ensureWorkspaceFolder(dirPath);
        refreshDiscovery();
        treeProvider.refresh();
        return;
      }

      const terminal = vscode.window.createTerminal({
        name: `Squad Init: ${path.basename(dirPath)}`,
        cwd: dirPath,
        hideFromUser: true,
      });
      terminal.sendText('git init && npx -y github:bradygaster/squad init; exit');

      const listener = vscode.window.onDidCloseTerminal(closedTerminal => {
        if (closedTerminal !== terminal) { return; }
        listener.dispose();

        ensureWorkspaceFolder(dirPath);
        refreshDiscovery();
        treeProvider.refresh();
      });
      context.subscriptions.push(listener);
    }),
  );

  // Clone to Worktree (#422)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.cloneToWorktree', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const disc = getDiscoveredItems().find(d => d.id === item.squadId);
      if (!disc) return;
      const repoPath = disc.path;

      // 1. Branch selection
      let branches: string[] = [];
      try {
        const { stdout } = await execFileAsync('git', ['branch', '--list', '--format=%(refname:short)'], { cwd: repoPath });
        branches = stdout.split('\n').map(b => b.trim()).filter(Boolean);
      } catch { /* ignore – empty list */ }

      const newBranchItem = { label: '$(add) Create new branch', description: '', alwaysShow: true, isNew: true as const };
      const branchItems = [
        newBranchItem,
        ...(branches.length ? [{ label: '', kind: vscode.QuickPickItemKind.Separator } as any] : []),
        ...branches.map(b => ({ label: b, isNew: false as const })),
      ];

      const picked = await vscode.window.showQuickPick(branchItems, { placeHolder: 'Select or create a branch for the worktree' });
      if (!picked) return;

      let branch: string;
      let isNewBranch: boolean;
      if ((picked as any).isNew) {
        const name = await vscode.window.showInputBox({
          prompt: 'New branch name',
          validateInput: v => isValidBranchName(v) ? undefined : 'Invalid branch name',
        });
        if (!name) return;
        branch = name;
        isNewBranch = true;
      } else {
        branch = picked.label;
        isNewBranch = false;
      }

      // 2. Path selection
      const defaultPath = defaultWorktreePath(repoPath, branch);
      const wtPath = await vscode.window.showInputBox({
        prompt: 'Worktree path',
        value: defaultPath,
        validateInput: v => v.trim() ? undefined : 'Path cannot be empty',
      });
      if (!wtPath) return;

      // 3. Execute git worktree add
      try {
        const args = ['worktree', 'add'];
        if (isNewBranch) args.push('-b', branch);
        args.push(wtPath);
        if (!isNewBranch) args.push(branch);
        await execFileAsync('git', args, { cwd: repoPath });
      } catch (err: any) {
        vscode.window.showErrorMessage(`Git worktree failed: ${err.stderr || err.message}`);
        return;
      }

      // 4. Post-create: add to workspace & refresh
      vscode.workspace.updateWorkspaceFolders(
        (vscode.workspace.workspaceFolders?.length ?? 0), 0,
        { uri: vscode.Uri.file(wtPath) },
      );
      refreshDiscovery();
      vscode.window.showInformationMessage(`Worktree created at ${wtPath}`);
    }),
  );
}
