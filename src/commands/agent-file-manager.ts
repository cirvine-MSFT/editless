import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { EditlessTreeProvider } from '../editless-tree';

export interface AgentFileManagerDeps {
  treeProvider: EditlessTreeProvider;
  refreshDiscovery: () => void;
  ensureWorkspaceFolder: (dirPath: string) => void;
}

/** Interactive flow: prompt for name + location, then create an agent .md template file. */
export async function createAgent(deps: AgentFileManagerDeps): Promise<void> {
  const { treeProvider, refreshDiscovery, ensureWorkspaceFolder } = deps;

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
}
