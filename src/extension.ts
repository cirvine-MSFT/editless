import * as vscode from 'vscode';
import { createRegistry, watchRegistry } from './registry';
import { EditlessTreeProvider, EditlessTreeItem } from './editless-tree';
import { TerminalManager } from './terminal-manager';
import { SessionLabelManager, promptClearLabel } from './session-labels';
import { registerSquadUpgradeCommand, registerSquadUpgradeAllCommand } from './squad-upgrader';
import { registerAgencyUpdateCommand, checkProviderUpdatesOnStartup, probeAllProviders, resolveActiveProvider } from './cli-provider';
import { registerDiscoveryCommand, checkDiscoveryOnStartup } from './discovery';
import { SquadWatcher } from './watcher';
import { EditlessStatusBar } from './status-bar';
import { NotificationManager } from './notifications';
import { SessionContextResolver } from './session-context';
import { scanSquad } from './scanner';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('EditLess');
  context.subscriptions.push(output);

  // --- CLI provider detection ---------------------------------------------
  probeAllProviders();
  resolveActiveProvider();

  // --- Registry ----------------------------------------------------------
  const registry = createRegistry(context);
  registry.loadSquads();

  // --- Terminal manager --------------------------------------------------
  const terminalManager = new TerminalManager();
  context.subscriptions.push(terminalManager);

  // --- Session label manager ---------------------------------------------
  const labelManager = new SessionLabelManager(context);

  // --- Notification manager -----------------------------------------------
  const notificationManager = new NotificationManager();

  // --- Session context resolver -------------------------------------------
  const sessionContextResolver = new SessionContextResolver();

  // --- Tree view ---------------------------------------------------------
  const treeProvider = new EditlessTreeProvider(registry, terminalManager, labelManager, sessionContextResolver);
  const treeView = vscode.window.registerTreeDataProvider('editlessTree', treeProvider);
  context.subscriptions.push(treeView);

  // --- Status bar ----------------------------------------------------------
  const statusBar = new EditlessStatusBar(registry, terminalManager);
  context.subscriptions.push(statusBar);
  statusBar.update();

  terminalManager.onDidChange(() => statusBar.updateSessionsOnly());

  // --- Squad file watcher — live .ai-team/ updates ----------------------
  const squadWatcher = new SquadWatcher(registry.loadSquads(), (squadId) => {
    const config = registry.getSquad(squadId);
    if (config) {
      const state = scanSquad(config);
      notificationManager.checkAndNotify(config, state);
    }
    treeProvider.invalidate(squadId);
    treeProvider.refresh();
    statusBar.update();
  });
  context.subscriptions.push(squadWatcher);

  // --- Registry file watcher — refresh tree on changes -------------------
  const registryWatcher = watchRegistry(registry, () => {
    treeProvider.refresh();
    squadWatcher.updateSquads(registry.loadSquads());
    statusBar.update();
  });
  context.subscriptions.push(registryWatcher);

  // --- Commands ----------------------------------------------------------

  // Squad upgrade commands
  context.subscriptions.push(registerSquadUpgradeCommand(context, registry));
  context.subscriptions.push(registerSquadUpgradeAllCommand(context, registry));

  // Agency update command
  context.subscriptions.push(registerAgencyUpdateCommand(context));

  // Check for CLI provider updates on startup
  checkProviderUpdatesOnStartup(context);

  // Squad discovery command
  context.subscriptions.push(registerDiscoveryCommand(context, registry));

  // Check for new squads on startup
  checkDiscoveryOnStartup(context, registry);

  // Rename squad (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSquad', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const config = registry.getSquad(item.squadId);
      if (!config) return;

      const newName = await vscode.window.showInputBox({
        prompt: `Rename "${config.name}"`,
        value: config.name,
        validateInput: v => v.trim() ? undefined : 'Name cannot be empty',
      });
      if (newName && newName !== config.name) {
        registry.updateSquad(item.squadId, { name: newName });
        treeProvider.refresh();
      }
    }),
  );

  // Go to squad settings in registry JSON (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.goToSquadSettings', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;

      const doc = await vscode.workspace.openTextDocument(registry.registryPath);
      const editor = await vscode.window.showTextDocument(doc);

      const text = doc.getText();
      const needle = `"id": "${item.squadId}"`;
      const offset = text.indexOf(needle);
      if (offset !== -1) {
        const pos = doc.positionAt(offset);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      }
    }),
  );

  // Change model (context menu)
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
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.changeModel', async (item?: EditlessTreeItem) => {
      if (!item?.squadId) return;
      const config = registry.getSquad(item.squadId);
      if (!config?.launchCommand) return;

      const currentModel = config.launchCommand.match(/--model\s+(\S+)/)?.[1];
      const picks = modelChoices.map(m => ({
        ...m,
        description: m.label === currentModel ? `${m.description} ✓ current` : m.description,
      }));

      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: `Model for ${config.name} (current: ${currentModel ?? 'unknown'})`,
      });
      if (!pick || pick.label === currentModel) return;

      const newCmd = currentModel
        ? config.launchCommand.replace(`--model ${currentModel}`, `--model ${pick.label}`)
        : `${config.launchCommand} --model ${pick.label}`;

      registry.updateSquad(item.squadId, { launchCommand: newCmd });
      treeProvider.refresh();
      vscode.window.showInformationMessage(`${config.icon} ${config.name} model → ${pick.label}`);
    }),
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.refresh', () => {
      treeProvider.refresh();
      output.appendLine('[refresh] Tree refreshed');
    }),
  );

  // Launch session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.launchSession', async (squadId?: string) => {
      const squads = registry.loadSquads();
      if (squads.length === 0) {
        vscode.window.showWarningMessage('No agents registered yet.');
        return;
      }

      let chosen: string | undefined = squadId;
      if (!chosen) {
        const pick = await vscode.window.showQuickPick(
          squads.map(s => ({ label: `${s.icon} ${s.name}`, description: s.universe, id: s.id })),
          { placeHolder: 'Select an agent to launch' },
        );
        chosen = pick?.id;
      }

      if (chosen) {
        const cfg = registry.getSquad(chosen);
        if (cfg) {
          terminalManager.launchTerminal(cfg);
        }
      }
    }),
  );

  // Focus session
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusSession', async () => {
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }

      const items = all.map(({ terminal, info }) => {
        const elapsed = Date.now() - info.createdAt.getTime();
        const mins = Math.floor(elapsed / 60_000);
        const relative = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
        const customLabel = labelManager.getLabel(info.labelKey);
        return {
          label: customLabel ? `🏷️ ${customLabel}` : info.displayName,
          description: customLabel ? `${info.displayName} · started ${relative}` : `started ${relative}`,
          terminal,
        };
      });

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a session to focus',
      });

      if (pick) {
        terminalManager.focusTerminal(pick.terminal);
      }
    }),
  );

  // Helper: context menu passes EditlessTreeItem, not vscode.Terminal
  function resolveTerminal(arg: unknown): vscode.Terminal | undefined {
    if (arg instanceof EditlessTreeItem) return arg.terminal;
    return arg as vscode.Terminal | undefined;
  }

  // Focus terminal (tree item click)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.focusTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.focusTerminal(terminal);
    }),
  );

  // Close terminal (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.closeTerminal', (arg: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) terminalManager.closeTerminal(terminal);
    }),
  );

  // Rename session (context menu or command palette)
  async function renameTerminalTab(terminal: vscode.Terminal, newName: string): Promise<void> {
    terminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: newName });
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('editless.renameSession', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const previousTerminal = vscode.window.activeTerminal;
      const terminal = resolveTerminal(arg) ?? vscode.window.activeTerminal;
      if (terminal) {
        terminal.show(true);
        const labelKey = terminalManager.getLabelKey(terminal);
        const current = labelManager.getLabel(labelKey) ?? terminalManager.getDisplayName(terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          labelManager.setLabel(labelKey, value);
          await renameTerminalTab(terminal, value);
        }
        if (previousTerminal && previousTerminal !== terminal) {
          previousTerminal.show(false);
        }
        return;
      }
      // No terminal arg — show QuickPick
      const all = terminalManager.getAllTerminals();
      if (all.length === 0) {
        vscode.window.showInformationMessage('No active sessions.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        all.map(({ terminal: t, info }) => ({
          label: labelManager.getLabel(info.labelKey) ?? info.displayName,
          description: info.displayName,
          terminal: t,
          labelKey: info.labelKey,
        })),
        { placeHolder: 'Select a session to rename' },
      );
      if (pick) {
        pick.terminal.show(true);
        const current = labelManager.getLabel(pick.labelKey) ?? terminalManager.getDisplayName(pick.terminal);
        const value = await vscode.window.showInputBox({
          prompt: 'Enter a label for this session',
          value: current,
        });
        if (value !== undefined && value.length > 0) {
          labelManager.setLabel(pick.labelKey, value);
          await renameTerminalTab(pick.terminal, value);
        }
        if (previousTerminal && previousTerminal !== pick.terminal) {
          previousTerminal.show(false);
        }
      }
    }),
  );

  // Clear session label (context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.clearSessionLabel', async (arg?: vscode.Terminal | EditlessTreeItem) => {
      const terminal = resolveTerminal(arg);
      if (terminal) {
        await promptClearLabel(terminal, labelManager, terminalManager.getLabelKey(terminal));
      }
    }),
  );

  // Open squad registry file
  context.subscriptions.push(
    vscode.commands.registerCommand('editless.openRegistry', async () => {
      const registryPath = registry.registryPath;
      const doc = await vscode.workspace.openTextDocument(registryPath);
      await vscode.window.showTextDocument(doc);
    }),
  );

  output.appendLine('EditLess activated');
}

export function deactivate(): void {
  // cleanup
}
