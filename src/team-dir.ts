import * as fs from 'fs';
import * as path from 'path';

/** Folder names to check, in priority order: new convention first, legacy fallback second. */
export const TEAM_DIR_NAMES = ['.squad', '.ai-team'] as const;

/**
 * Resolves the team directory for a given base path.
 * Checks `.squad/` first (new convention), then `.ai-team/` (legacy).
 * Returns the full path to the team directory, or null if neither exists.
 */
export function resolveTeamDir(basePath: string): string | null {
  for (const name of TEAM_DIR_NAMES) {
    const candidate = path.join(basePath, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolves the team.md file path within a base path.
 * Checks `.squad/team.md` first, then `.ai-team/team.md`.
 * Returns the full path to the team.md file, or null if neither exists.
 */
export function resolveTeamMd(basePath: string): string | null {
  for (const name of TEAM_DIR_NAMES) {
    const candidate = path.join(basePath, name, 'team.md');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
