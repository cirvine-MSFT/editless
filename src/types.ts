// ---------------------------------------------------------------------------
// Agent Team Registry
// ---------------------------------------------------------------------------

/** A single entry in the agent team registry. */
export interface AgentTeamConfig {
  /** Kebab-case slug, e.g. "my-squad" */
  id: string;
  /** Display name, e.g. "My Squad" */
  name: string;
  /** Absolute path to squad root */
  path: string;
  /** Emoji icon */
  icon: string;
  /** Casting universe name */
  universe: string;
  /** Squad description */
  description?: string;
  /** Windows Terminal profile GUID if known */
  terminalProfileGuid?: string;
  /** Windows Terminal profile name for matching */
  terminalProfileName?: string;
  /** Value for --model flag, if set */
  model?: string;
  /** Per-squad extra CLI flags (e.g., "--yolo") */
  additionalArgs?: string;
}

// ---------------------------------------------------------------------------
// Parsed Content Entries
// ---------------------------------------------------------------------------

/** A single agent in a squad roster. */
export interface AgentInfo {
  name: string;
  role: string;
  /** Charter file path (relative to .squad/ or .ai-team/) */
  charter?: string;
  /** Status badge: 'active', 'silent', 'monitor', or custom */
  status?: string;
}

/** Reference to external work items (PR, WI, US, Issue). */
export interface WorkReference {
  /** Type of reference */
  type: 'pr' | 'wi' | 'us' | 'issue';
  /** The number (e.g., 70684) */
  number: string;
  /** Display text (e.g., "PR #70684") */
  label: string;
  /** Optional URL to open the work item (e.g., Azure DevOps link) */
  url?: string;
}

/** Copilot CLI session context — resolved from process tree and session-state files. */
export interface SessionContext {
  /** Copilot session ID (UUID) */
  sessionId: string;
  /** What the session is working on */
  summary: string;
  /** Working directory */
  cwd: string;
  /** Git branch */
  branch: string;
  /** When session was created */
  createdAt: string;
  /** When session was last active */
  updatedAt: string;
  /** Extracted work references from plan.md (WI/PR/US numbers) */
  references: WorkReference[];
}

// ---------------------------------------------------------------------------
// Runtime State
// ---------------------------------------------------------------------------

/** Full runtime state of a squad — what the dashboard shows per squad. */
export interface SquadState {
  config: AgentTeamConfig;
  /** ISO timestamp of most recent file change, or null if unknown */
  lastActivity: string | null;
  /** Set if squad path is inaccessible or scanning failed */
  error?: string;
  /** Squad roster parsed from .squad/team.md (or .ai-team/team.md) */
  roster: AgentInfo[];
  /** Squad charter/description (from agent-registry.json or team.md header) */
  charter: string;
}


