import type { SessionContextResolver } from './session-context';
import type { TerminalInfo } from './terminal-types';

/**
 * Detect session IDs for terminals missing agentSessionId.
 * Matches session-state directories whose cwd matches the terminal's agentPath.
 * Returns true if any changes were made.
 */
export function detectAndAssignSessionIds(
  terminals: Map<unknown, TerminalInfo>,
  sessionResolver: SessionContextResolver,
): boolean {
  const agentPaths: string[] = [];
  for (const info of terminals.values()) {
    if (!info.agentSessionId && info.agentPath) {
      agentPaths.push(info.agentPath);
    }
  }
  if (agentPaths.length === 0) return false;

  const sessions = sessionResolver.resolveAll(agentPaths);
  let changed = false;

  for (const info of terminals.values()) {
    if (info.agentSessionId || !info.agentPath) continue;
    const ctx = sessions.get(info.agentPath);
    if (!ctx) continue;

    // Only claim sessions created after the terminal was launched
    const sessionCreated = new Date(ctx.createdAt).getTime();
    if (sessionCreated < info.createdAt.getTime()) continue;

    // Check this session ID isn't already claimed by another terminal
    const alreadyClaimed = [...terminals.values()].some(
      other => other !== info && other.agentSessionId === ctx.sessionId,
    );
    if (alreadyClaimed) continue;

    info.agentSessionId = ctx.sessionId;
    changed = true;
  }

  return changed;
}
