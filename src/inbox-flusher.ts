import * as fs from 'fs';
import * as path from 'path';

export interface FlushResult {
  flushed: number;
  errors: string[];
}

/**
 * Reads all .md files from the decisions inbox, appends their content
 * to decisions.md, and deletes the inbox files.
 * Returns silently if inbox is empty or doesn't exist.
 */
export function flushDecisionsInbox(teamDir: string): FlushResult {
  const inboxDir = path.join(teamDir, 'decisions', 'inbox');
  const decisionsFile = path.join(teamDir, 'decisions.md');

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(inboxDir, { withFileTypes: true });
  } catch {
    return { flushed: 0, errors: [] };
  }

  const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
  if (mdFiles.length === 0) {
    return { flushed: 0, errors: [] };
  }

  const errors: string[] = [];
  const chunks: string[] = [];

  for (const file of mdFiles) {
    const filePath = path.join(inboxDir, file.name);
    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (content.length > 0) {
        chunks.push(content);
      }
    } catch (err) {
      errors.push(`Failed to read ${file.name}: ${err}`);
    }
  }

  if (chunks.length > 0) {
    const separator = '\n\n';
    const appendText = separator + chunks.join(separator) + '\n';
    try {
      fs.appendFileSync(decisionsFile, appendText, 'utf-8');
    } catch (err) {
      return { flushed: 0, errors: [`Failed to write decisions.md: ${err}`] };
    }
  }

  let flushed = 0;
  for (const file of mdFiles) {
    const filePath = path.join(inboxDir, file.name);
    try {
      fs.unlinkSync(filePath);
      flushed++;
    } catch (err) {
      errors.push(`Failed to delete ${file.name}: ${err}`);
    }
  }

  return { flushed, errors };
}
