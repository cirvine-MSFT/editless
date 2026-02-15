import * as vscode from 'vscode';

export function isInsiders(): boolean {
  return vscode.env.appName.includes('Insiders');
}

export function getEdition(): 'insiders' | 'stable' {
  return isInsiders() ? 'insiders' : 'stable';
}

export function hasApi(obj: unknown, method: string): boolean {
  return typeof obj === 'object' && obj !== null && typeof (obj as Record<string, unknown>)[method] === 'function';
}
