import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let _cachedAzToken: { token: string; expiresAt: number } | undefined;
const AZ_TOKEN_TTL_MS = 30 * 60 * 1000;
let _output: vscode.OutputChannel | undefined;

export function setAdoAuthOutput(channel: vscode.OutputChannel): void {
  _output = channel;
}

/**
 * Layered ADO auth. Tries in order:
 * 1. VS Code Microsoft auth provider (zero config for corp users)
 * 2. PAT from secret storage
 * 3. az CLI token (cached 30min)
 */
export async function getAdoToken(secrets: vscode.SecretStorage): Promise<string | undefined> {
  // Strategy 1: VS Code Microsoft auth provider
  try {
    const session = await vscode.authentication.getSession(
      'microsoft',
      ['499b84ac-1321-427f-aa17-267ca6975798/.default'],
      { createIfNone: false },
    );
    if (session?.accessToken) {
      return session.accessToken;
    }
  } catch (err) {
    _output?.appendLine(`[ADO auth] Microsoft auth provider error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 2: PAT from secret storage
  const pat = await secrets.get('editless.ado.pat');
  if (pat) {
    return pat;
  }

  // Strategy 3: az CLI
  if (_cachedAzToken && Date.now() < _cachedAzToken.expiresAt) {
    return _cachedAzToken.token;
  }
  try {
    const { stdout } = await execFileAsync('az', [
      'account', 'get-access-token',
      '--resource', '499b84ac-1321-427f-aa17-267ca6975798',
      '--query', 'accessToken', '-o', 'tsv',
    ]);
    const token = stdout.trim();
    if (token) {
      _cachedAzToken = { token, expiresAt: Date.now() + AZ_TOKEN_TTL_MS };
      return token;
    }
  } catch (err) {
    _output?.appendLine(`[ADO auth] az CLI error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return undefined;
}

export async function promptAdoSignIn(): Promise<string | undefined> {
  try {
    const session = await vscode.authentication.getSession(
      'microsoft',
      ['499b84ac-1321-427f-aa17-267ca6975798/.default'],
      { createIfNone: true },
    );
    return session?.accessToken;
  } catch (err) {
    _output?.appendLine(`[ADO auth] Sign-in error: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export function clearAzTokenCache(): void {
  _cachedAzToken = undefined;
}
