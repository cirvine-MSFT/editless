// ---------------------------------------------------------------------------
// Agent Team Registry
// ---------------------------------------------------------------------------

/** A single entry in the agent team registry. */
export interface AgentTeamConfig {
  /** Kebab-case slug, e.g. "internal-project-squad" */
  id: string;
  /** Display name, e.g. "Internal-Project Squad" */
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
  /** Command to launch in terminal (e.g., "agency copilot --agent squad ...") */
  launchCommand?: string;
}

// ---------------------------------------------------------------------------
// Squad Status
// ---------------------------------------------------------------------------

/** Runtime status of a squad. */
export type SquadStatus =
  | 'active'          // recent activity (file changes within last hour)
  | 'idle'            // no recent activity
  | 'needs-attention'; // stale inbox, unmerged decisions, errors

// ---------------------------------------------------------------------------
// Parsed Content Entries
// ---------------------------------------------------------------------------

/** A parsed decision from decisions.md. */
export interface DecisionEntry {
  date: string;
  title: string;
  author: string;
  summary: string;
}

/** A parsed session log entry. */
export interface LogEntry {
  date: string;
  filename: string;
  topic: string;
  /** Agents who worked in this session */
  agents: string[];
  summary: string;
}

/** A parsed orchestration log entry. */
export interface OrchestrationEntry {
  timestamp: string;
  agent: string;
  task: string;
  outcome: string;
}

/** A single agent in a squad roster. */
export interface AgentInfo {
  name: string;
  role: string;
  /** Charter file path (relative to .ai-team/) */
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

/** A single recent activity entry from orchestration logs. */
export interface RecentActivity {
  /** Agent name */
  agent: string;
  /** Task description (from "routed because" field) */
  task: string;
  /** Outcome text */
  outcome: string;
  /** When this activity occurred */
  timestamp: string;
  /** Extracted references (PR/WI/US numbers from task or outcome) */
  references: WorkReference[];
}

/** Terminal session metadata. */
export interface TerminalSession {
  /** Process ID of the pwsh.exe process */
  pid: number;
  /** Current working directory */
  cwd: string;
  /** Squad ID inferred from CWD or profile name */
  squadId: string | null;
  /** Windows Terminal profile name if detected */
  profileName?: string;
  /** Command line that started this process */
  commandLine: string;
  /** Process start time (ISO timestamp) */
  startTime: string;
  /** Last known window title (may be empty for pwsh in WT) */
  windowTitle?: string;
  /** Detected activity: 'idle', 'busy', 'running-command', 'copilot-session', 'waiting-for-input', 'orphan' */
  activity?: string;
  /** Brief human-readable description of what this session is doing */
  summary?: string;
  /** Copilot CLI session context if this is a copilot-session */
  sessionContext?: SessionContext;
  /** User-set label (overrides auto-generated summary when present) */
  userLabel?: string;
}

// ---------------------------------------------------------------------------
// Runtime State
// ---------------------------------------------------------------------------

/** Full runtime state of a squad — what the dashboard shows per squad. */
export interface SquadState {
  config: AgentTeamConfig;
  status: SquadStatus;
  /** ISO timestamp of most recent file change, or null if unknown */
  lastActivity: string | null;
  /** Last 5 decisions */
  recentDecisions: DecisionEntry[];
  /** Last 5 session logs */
  recentLogs: LogEntry[];
  /** Last 10 orchestration entries */
  recentOrchestration: OrchestrationEntry[];
  /** Agents with recent orchestration entries */
  activeAgents: string[];
  /** Number of files in decisions/inbox/ */
  inboxCount: number;
  /** Set if squad path is inaccessible or scanning failed */
  error?: string;
  /** Squad roster parsed from .ai-team/team.md */
  roster: AgentInfo[];
  /** Squad charter/description (from squad-registry.json or team.md header) */
  charter: string;
  /** Recent activity entries (last 3-5 orchestration entries) */
  recentActivity: RecentActivity[];
}

/** Top-level state the frontend renders. */
export interface DashboardState {
  squads: SquadState[];
  /** ISO timestamp — when the dashboard connected */
  connectedAt: string;
  /** ISO timestamp — last full refresh */
  lastRefresh: string;
  /** Active PowerShell terminal sessions */
  terminalSessions: TerminalSession[];
}

// ---------------------------------------------------------------------------
// WebSocket & API
// ---------------------------------------------------------------------------

/** Messages sent over WebSocket. */
export interface WebSocketMessage {
  type: 'full-refresh' | 'squad-update' | 'terminal-update' | 'error';
  payload: DashboardState | SquadState | TerminalSession[] | { message: string };
  timestamp: string;
}

/** POST body for launching a terminal session. */
export interface LaunchRequest {
  squadId: string;
  /** Override Windows Terminal profile */
  profileName?: string;
}
