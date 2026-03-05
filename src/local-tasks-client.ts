import * as fs from 'fs';
import * as path from 'path';
import type { UnifiedState } from './work-item-types';

export interface LocalTask {
  id: string;
  title: string;
  state: string;
  created: string;
  sessionId: string | null;
  filePath: string;
  folderPath: string;
  folderName: string;
  parentName: string;
  body: string;
}

interface Frontmatter {
  state: string;
  created: string;
  session_id: string | null;
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } | null {
  const trimmed = raw.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('---')) return null;

  const secondMarker = trimmed.indexOf('---', 3);
  if (secondMarker === -1) return null;

  const yamlBlock = trimmed.slice(3, secondMarker).trim();
  const body = trimmed.slice(secondMarker + 3).trim();

  const fields: Record<string, string | null> = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fields[key] = value === 'null' ? null : value;
  }

  if (!fields.state || !fields.created) return null;

  return {
    frontmatter: {
      state: fields.state as string,
      created: fields.created as string,
      session_id: fields.session_id ?? null,
    },
    body,
  };
}

function extractTitle(body: string): string {
  for (const line of body.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('# ')) return trimmedLine.slice(2).trim();
  }
  return '';
}

export async function fetchLocalTasks(folderPath: string): Promise<LocalTask[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(folderPath);
  } catch {
    return [];
  }

  const mdFiles = entries.filter(e => e.endsWith('.md'));
  const tasks: LocalTask[] = [];

  for (const file of mdFiles) {
    try {
      const filePath = path.join(folderPath, file);
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) continue;

      tasks.push({
        id: path.basename(file, '.md'),
        title: extractTitle(parsed.body),
        state: parsed.frontmatter.state,
        created: parsed.frontmatter.created,
        sessionId: parsed.frontmatter.session_id,
        filePath,
        folderPath,
        folderName: path.basename(folderPath),
        parentName: path.basename(path.dirname(folderPath)),
        body: parsed.body,
      });
    } catch {
      continue;
    }
  }

  return tasks;
}

export function mapLocalState(task: LocalTask): UnifiedState {
  if (task.state === 'Done') return 'closed';
  if (task.sessionId !== null) return 'active';
  return 'open';
}
