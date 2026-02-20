import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamDir } from './team-dir';
import type {
  AgentTeamConfig,
  SquadState,
  AgentInfo,
  WorkReference,
} from './types';

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function listFilesByMtime(dir: string): { name: string; mtime: Date }[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => {
        const stat = fs.statSync(path.join(dir, e.name));
        return { name: e.name, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch {
    return [];
  }
}

export function parseRoster(teamMdPath: string): AgentInfo[] {
  try {
    const content = fs.readFileSync(teamMdPath, 'utf-8');
    const agents: AgentInfo[] = [];

    const membersMatch = content.match(/##\s+Members\s*\n+\|[\s\S]*?(?=\n##|\n\n##|$)/i);
    if (!membersMatch) return [];

    const tableContent = membersMatch[0];
    const rows = tableContent.split('\n').filter(line => line.includes('|'));

    let foundHeader = false;
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim());

      if (cols.some(c => c.toLowerCase() === 'name' || c.toLowerCase() === 'role')) {
        foundHeader = true;
        continue;
      }

      if (cols.some(c => c.match(/^-+$/))) continue;

      if (!foundHeader || cols.length < 4) continue;

      const name = cols[1];
      const role = cols[2];
      const charter = cols[3];
      const statusRaw = cols[4] || '';

      if (!name || !role) continue;

      const status = statusRaw.replace(/[^\w\s-]/g, '').trim().toLowerCase();

      agents.push({
        name,
        role,
        charter: charter && !charter.includes('—') ? charter : undefined,
        status: status || undefined,
      });
    }

    return agents;
  } catch {
    return [];
  }
}

function parseCharter(config: AgentTeamConfig, teamMdPath: string): string {
  if (config.description) {
    return config.description.slice(0, 300);
  }

  try {
    const content = fs.readFileSync(teamMdPath, 'utf-8');
    const firstParagraphMatch = content.match(/^#\s+[^\n]+\n\n>\s*(.+?)(?=\n\n|$)/m);
    if (firstParagraphMatch) {
      return firstParagraphMatch[1].trim().slice(0, 300);
    }
  } catch { /* fallback failed */ }

  return '';
}

export function extractReferences(text: string): WorkReference[] {
  const references: WorkReference[] = [];
  const seenRefs = new Set<string>();

  const prMatches = text.matchAll(/\bPR\s*#?(\d+)/gi);
  for (const match of prMatches) {
    const number = match[1];
    const key = `pr-${number}`;
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      references.push({ type: 'pr', number, label: `PR #${number}` });
    }
  }

  const wiMatches = text.matchAll(/\bWI[#\s-]?(\d+)/gi);
  for (const match of wiMatches) {
    const number = match[1];
    const key = `wi-${number}`;
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      references.push({ type: 'wi', number, label: `WI #${number}` });
    }
  }

  const usMatches = text.matchAll(/\bUS[#\s-]?(\d+)/gi);
  for (const match of usMatches) {
    const number = match[1];
    const key = `us-${number}`;
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      references.push({ type: 'us', number, label: `US #${number}` });
    }
  }

  return references;
}

export function scanSquad(config: AgentTeamConfig): SquadState {
  const aiTeamDir = resolveTeamDir(config.path);
  const teamMdPath = aiTeamDir ? path.join(aiTeamDir, 'team.md') : null;

  try {
    if (!aiTeamDir) {
      return {
        config,
        lastActivity: null,
        error: `.squad/ (or .ai-team/) directory not found at ${config.path}`,
        roster: [],
        charter: '',
      };
    }

    const roster = teamMdPath && fs.existsSync(teamMdPath) ? parseRoster(teamMdPath) : [];
    const charter = teamMdPath ? parseCharter(config, teamMdPath) : '';

    const logDir = path.join(aiTeamDir, 'log');
    const orchDir = path.join(aiTeamDir, 'orchestration-log');

    let lastMtime: Date | null = null;
    const allFiles = [
      ...listFilesByMtime(logDir),
      ...listFilesByMtime(orchDir),
    ];

    for (const f of allFiles) {
      if (!lastMtime || f.mtime > lastMtime) lastMtime = f.mtime;
    }

    return {
      config,
      lastActivity: lastMtime?.toISOString() || null,
      roster,
      charter,
    };
  } catch (err) {
    return {
      config,
      lastActivity: null,
      error: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      roster: [],
      charter: '',
    };
  }
}
