import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Link patterns matched in terminal output.
 * Order matters — more specific patterns are checked first.
 */
const LINK_PATTERNS: { regex: RegExp; type: 'github-ref' | 'ado-ref' | 'file-path' }[] = [
  // GitHub: PR #123, issue #123, or bare #123
  { regex: /(?:PR|issue|pull)\s*#(\d+)/gi, type: 'github-ref' },
  { regex: /(?<!\w)#(\d{1,6})(?!\w)/g, type: 'github-ref' },
  // ADO: WI#12345, US#12345, Bug#12345, Task#12345
  { regex: /(?:WI|US|Bug|Task|Feature|Epic)#(\d+)/gi, type: 'ado-ref' },
];

/** Matches file paths like src/foo.ts, ./bar/baz.js, C:\Users\..., /home/... with optional :line:col */
const FILE_PATH_REGEX = /(?:(?:[A-Za-z]:\\|\/)[^\s:*?"<>|]+\.[a-zA-Z]{1,10}|(?:\.\/|(?:src|test|lib|dist|out|bin|packages?|apps?)\/)[^\s:*?"<>|]+\.[a-zA-Z]{1,10})(?::(\d+)(?::(\d+))?)?/g;

export interface TerminalLinkWithData extends vscode.TerminalLink {
  data: {
    type: 'github-ref' | 'ado-ref' | 'file-path';
    value: string;
    line?: number;
    column?: number;
  };
}

export class EditlessTerminalLinkProvider implements vscode.TerminalLinkProvider<TerminalLinkWithData> {
  constructor(
    private readonly _getAdoConfig: () => { org: string; project: string } | undefined,
    private readonly _getGitHubRepo: () => string | undefined,
  ) {}

  provideTerminalLinks(context: vscode.TerminalLinkContext): TerminalLinkWithData[] {
    const links: TerminalLinkWithData[] = [];
    const line = context.line;

    // Check reference patterns (GitHub, ADO)
    for (const { regex, type } of LINK_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        links.push({
          startIndex: match.index,
          length: match[0].length,
          tooltip: type === 'github-ref' ? `Open #${match[1]} on GitHub` : `Open ${match[0]} in Azure DevOps`,
          data: { type, value: match[1] },
        });
      }
    }

    // Check file paths
    FILE_PATH_REGEX.lastIndex = 0;
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = FILE_PATH_REGEX.exec(line)) !== null) {
      const filePath = fileMatch[0].replace(/:(\d+)(?::(\d+))?$/, '');
      const lineNum = fileMatch[1] ? parseInt(fileMatch[1], 10) : undefined;
      const colNum = fileMatch[2] ? parseInt(fileMatch[2], 10) : undefined;
      links.push({
        startIndex: fileMatch.index,
        length: fileMatch[0].length,
        tooltip: `Open ${path.basename(filePath)}`,
        data: { type: 'file-path', value: filePath, line: lineNum, column: colNum },
      });
    }

    return links;
  }

  async handleTerminalLink(link: TerminalLinkWithData): Promise<void> {
    const { type, value, line, column } = link.data;

    switch (type) {
      case 'github-ref': {
        const repo = this._getGitHubRepo();
        if (repo) {
          const url = `https://github.com/${repo}/issues/${value}`;
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } else {
          await vscode.window.showWarningMessage(`No GitHub repository configured. Cannot open #${value}.`);
        }
        break;
      }
      case 'ado-ref': {
        const adoConfig = this._getAdoConfig();
        if (adoConfig) {
          const url = `https://dev.azure.com/${adoConfig.org}/${adoConfig.project}/_workitems/edit/${value}`;
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } else {
          await vscode.window.showWarningMessage('No Azure DevOps configuration found. Cannot open work item.');
        }
        break;
      }
      case 'file-path': {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let uri: vscode.Uri | undefined;

        if (path.isAbsolute(value)) {
          uri = vscode.Uri.file(value);
        } else if (workspaceFolders?.length) {
          // Try to resolve relative path against workspace folders
          for (const folder of workspaceFolders) {
            const abs = path.join(folder.uri.fsPath, value);
            uri = vscode.Uri.file(abs);
            break;
          }
        }

        if (uri) {
          const options: vscode.TextDocumentShowOptions = {};
          if (line !== undefined) {
            const pos = new vscode.Position(line - 1, (column ?? 1) - 1);
            options.selection = new vscode.Range(pos, pos);
          }
          await vscode.window.showTextDocument(uri, options);
        }
        break;
      }
    }
  }
}
