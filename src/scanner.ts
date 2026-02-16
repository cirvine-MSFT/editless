import * as fs from 'fs';
import * as path from 'path';
import { resolveTeamDir } from './team-dir';
import type {
  AgentTeamConfig,
  SquadState,
  SquadStatus,
  DecisionEntry,
  LogEntry,
  OrchestrationEntry,
  AgentInfo,
  RecentActivity,
  WorkReference,
} from './types';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

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

export function parseDecisions(filePath: string, limit: number): DecisionEntry[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const entries: DecisionEntry[] = [];
    const blocks = content.split(/^(?=### \d{4}-\d{2}-\d{2}:)/m);

    for (const block of blocks) {
      const headerMatch = block.match(/^### (\d{4}-\d{2}-\d{2}): (.+)/);
      if (!headerMatch) continue;

      const date = headerMatch[1];
      const title = headerMatch[2].trim();

      const authorMatch = block.match(/\*\*By:\*\*\s*(.+)/);
      const author = authorMatch ? authorMatch[1].trim() : 'unknown';

      const lines = block.split('\n').slice(1);
      const summaryLines: string[] = [];
      let pastBy = false;
      for (const line of lines) {
        if (line.match(/\*\*By:\*\*/)) { pastBy = true; continue; }
        if (!pastBy) continue;
        const trimmed = line.trim();
        if (trimmed === '') { if (summaryLines.length > 0) break; continue; }
        summaryLines.push(trimmed);
      }
      const summary = summaryLines.slice(0, 3).join(' ');

      entries.push({ date, title, author, summary });
    }

    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

function parseLogEntries(dir: string, limit: number): LogEntry[] {
  const files = listFilesByMtime(dir);
  return files.slice(0, limit).map(f => {
    const name = f.name.replace(/\.md$/i, '');
    const dateMatch = name.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : f.mtime.toISOString().slice(0, 10);
    const topic = dateMatch ? name.slice(11).replace(/-/g, ' ') : name.replace(/-/g, ' ');

    let agents: string[] = [];
    let summary = '';
    try {
      const content = fs.readFileSync(path.join(dir, f.name), 'utf-8');
      const head = content.slice(0, 500);
      const agentMatch = head.match(/\*\*(?:Agent|By):\*\*\s*(.+)/i);
      if (agentMatch) agents = agentMatch[1].split(/[,&]/).map(a => a.trim());
      const summaryLine = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('*'));
      summary = summaryLine?.trim().slice(0, 200) || '';
    } catch { /* skip */ }

    return { date, filename: f.name, topic, agents, summary };
  });
}

function parseOrchestrationEntries(dir: string, limit: number): OrchestrationEntry[] {
  const files = listFilesByMtime(dir);
  const entries: OrchestrationEntry[] = [];

  for (const f of files) {
    if (entries.length >= limit) break;
    try {
      const content = fs.readFileSync(path.join(dir, f.name), 'utf-8');

      const extractField = (field: string): string => {
        const re = new RegExp(`\\|\\s*\\*\\*${field}\\*\\*\\s*\\|\\s*(.+?)\\s*\\|`, 'i');
        const m = content.match(re);
        return m ? m[1].trim() : '';
      };

      const agentRaw = extractField('Agent');
      const agentMatch = agentRaw.match(/^(\w+)/);
      const agent = agentMatch ? agentMatch[1] : '';

      if (!agent) {
        const headerMatch = content.match(/^#\s+.*?—\s*(\w+)\s*\(/m);
        if (!headerMatch) continue;
        const entry: OrchestrationEntry = {
          timestamp: f.name.match(/^(\d{4}-\d{2}-\d{2}T\d{4})/)?.[1] || f.mtime.toISOString(),
          agent: headerMatch[1],
          task: extractField('Routed because') || f.name.replace(/^\d{4}-\d{2}-\d{2}T\d{4}-/, '').replace(/\.md$/, ''),
          outcome: extractField('Outcome'),
        };
        entries.push(entry);
        continue;
      }

      const timestampMatch = f.name.match(/^(\d{4}-\d{2}-\d{2}T\d{4})/);

      entries.push({
        timestamp: timestampMatch ? timestampMatch[1] : f.mtime.toISOString(),
        agent,
        task: extractField('Routed because') || f.name.replace(/^\d{4}-\d{2}-\d{2}T\d{4}-/, '').replace(/\.md$/, ''),
        outcome: extractField('Outcome'),
      });
    } catch { /* skip */ }
  }

  return entries.slice(0, limit);
}

export function parseRoster(teamMdPath: string): AgentInfo[] {
  try {
    const content = fs.readFileSync(teamMdPath, 'utf-8');
    const agents: AgentInfo[] = [];

    const membersMatch = content.match(/##\s+Members\s+\|[\s\S]*?(?=\n##|\n\n##|$)/i);
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

function parseRecentActivity(
  orchDir: string,
  logDir: string,
  limit: number = 5
): RecentActivity[] {
  const activities: RecentActivity[] = [];

  const orchEntries = parseOrchestrationEntries(orchDir, limit);
  for (const entry of orchEntries) {
    const searchText = `${entry.task} ${entry.outcome}`;
    const references = extractReferences(searchText);

    activities.push({
      agent: entry.agent,
      task: entry.task,
      outcome: entry.outcome,
      timestamp: entry.timestamp,
      references,
    });
  }

  if (activities.length < limit) {
    try {
      const logFiles = fs.readdirSync(logDir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.md'))
        .map(e => ({ name: e.name, stat: fs.statSync(path.join(logDir, e.name)) }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())
        .slice(0, 3);

      for (const file of logFiles) {
        const filename = file.name.replace(/\.md$/i, '');
        const references = extractReferences(filename);

        const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
        const timestamp = dateMatch ? `${dateMatch[1]}T00:00:00Z` : file.stat.mtime.toISOString();

        const topic = dateMatch ? filename.slice(11).replace(/-/g, ' ') : filename.replace(/-/g, ' ');

        if (references.length > 0) {
          activities.push({
            agent: 'Session',
            task: topic,
            outcome: `Session logged: ${file.name}`,
            timestamp,
            references,
          });
        }
      }
    } catch { /* ignore errors reading log directory */ }
  }

  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

export function determineStatus(lastActivity: Date | null, inboxCount: number): SquadStatus {
  const now = Date.now();
  if (lastActivity && (now - lastActivity.getTime()) < ONE_HOUR) return 'active';
  if (inboxCount > 0) return 'needs-attention';
  if (!lastActivity || (now - lastActivity.getTime()) > ONE_DAY) return 'needs-attention';
  return 'idle';
}

export function scanSquad(config: AgentTeamConfig): SquadState {
  const aiTeamDir = resolveTeamDir(config.path);
  const teamMdPath = aiTeamDir ? path.join(aiTeamDir, 'team.md') : null;

  try {
    if (!aiTeamDir) {
      return {
        config,
        status: 'idle',
        lastActivity: null,
        recentDecisions: [],
        recentLogs: [],
        recentOrchestration: [],
        activeAgents: [],
        inboxCount: 0,
        error: `.squad/ (or .ai-team/) directory not found at ${config.path}`,
        roster: [],
        charter: '',
        recentActivity: [],
      };
    }

    const roster = teamMdPath && fs.existsSync(teamMdPath) ? parseRoster(teamMdPath) : [];
    const charter = teamMdPath ? parseCharter(config, teamMdPath) : '';

    const inboxDir = path.join(aiTeamDir, 'decisions', 'inbox');
    let inboxCount = 0;
    try {
      const inboxFiles = fs.readdirSync(inboxDir, { withFileTypes: true });
      inboxCount = inboxFiles.filter(e => e.isFile()).length;
    } catch { /* no inbox dir */ }

    const decisionsFile = path.join(aiTeamDir, 'decisions.md');
    const recentDecisions = parseDecisions(decisionsFile, 5);

    const logDir = path.join(aiTeamDir, 'log');
    const recentLogs = parseLogEntries(logDir, 5);

    const orchDir = path.join(aiTeamDir, 'orchestration-log');
    const recentOrchestration = parseOrchestrationEntries(orchDir, 10);

    const recentActivity = parseRecentActivity(orchDir, logDir, 5);

    const activeAgents = [...new Set(recentOrchestration.map(e => e.agent).filter(Boolean))];

    let lastMtime: Date | null = null;
    const allFiles = [
      ...listFilesByMtime(path.join(aiTeamDir, 'decisions', 'inbox')),
      ...listFilesByMtime(logDir),
      ...listFilesByMtime(orchDir),
    ];
    const decStat = safeStat(decisionsFile);
    if (decStat) allFiles.push({ name: 'decisions.md', mtime: decStat.mtime });

    for (const f of allFiles) {
      if (!lastMtime || f.mtime > lastMtime) lastMtime = f.mtime;
    }

    const status = determineStatus(lastMtime, inboxCount);

    return {
      config,
      status,
      lastActivity: lastMtime?.toISOString() || null,
      recentDecisions,
      recentLogs,
      recentOrchestration,
      activeAgents,
      inboxCount,
      roster,
      charter,
      recentActivity,
    };
  } catch (err) {
    return {
      config,
      status: 'idle',
      lastActivity: null,
      recentDecisions: [],
      recentLogs: [],
      recentOrchestration: [],
      activeAgents: [],
      inboxCount: 0,
      error: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      roster: [],
      charter: '',
      recentActivity: [],
    };
  }
}
