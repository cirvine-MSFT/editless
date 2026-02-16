import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGet, mockShowWarningMessage, mockExecuteCommand } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockShowWarningMessage: vi.fn().mockResolvedValue(undefined),
  mockExecuteCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
    }),
  },
  window: {
    showWarningMessage: mockShowWarningMessage,
  },
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

import { isNotificationEnabled, NotificationManager } from '../notifications';
import type { AgentTeamConfig, SquadState } from '../types';

function configureSettings(settings: Record<string, boolean | undefined>) {
  mockGet.mockImplementation((key: string, defaultValue?: boolean) => {
    return key in settings ? settings[key] : defaultValue;
  });
}

function makeConfig(overrides?: Partial<AgentTeamConfig>): AgentTeamConfig {
  return {
    id: 'test-squad',
    name: 'Test Squad',
    path: '/tmp/test',
    icon: '🧪',
    universe: 'test',
    ...overrides,
  };
}

function makeState(overrides?: Partial<SquadState>): SquadState {
  return {
    config: makeConfig(),
    status: 'active',
    lastActivity: null,
    recentDecisions: [],
    recentLogs: [],
    recentOrchestration: [],
    activeAgents: [],
    inboxCount: 0,
    roster: [],
    charter: '',
    recentActivity: [],
    ...overrides,
  };
}

describe('isNotificationEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when both master and category are enabled', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': true,
    });
    expect(isNotificationEnabled('inbox')).toBe(true);
  });

  it('should return false when master is disabled', () => {
    configureSettings({
      'notifications.enabled': false,
      'notifications.inbox': true,
    });
    expect(isNotificationEnabled('inbox')).toBe(false);
  });

  it('should return false when category is disabled', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': false,
    });
    expect(isNotificationEnabled('inbox')).toBe(false);
  });

  it('should return false when both master and category are disabled', () => {
    configureSettings({
      'notifications.enabled': false,
      'notifications.inbox': false,
    });
    expect(isNotificationEnabled('inbox')).toBe(false);
  });

  it('should default to true when settings are not configured', () => {
    configureSettings({});
    expect(isNotificationEnabled('inbox')).toBe(true);
    expect(isNotificationEnabled('updates')).toBe(true);
  });

  it('should evaluate inbox and updates categories independently', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': true,
      'notifications.updates': false,
    });
    expect(isNotificationEnabled('inbox')).toBe(true);
    expect(isNotificationEnabled('updates')).toBe(false);
  });
});

describe('NotificationManager.checkAndNotify', () => {
  let manager: NotificationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new NotificationManager();
  });

  it('should show notification when inbox is enabled and count rises from zero', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': true,
    });

    const config = makeConfig();
    manager.checkAndNotify(config, makeState({ inboxCount: 3 }));

    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      '🧪 Test Squad: 3 decision(s) pending review',
      'Review',
    );
  });

  it('should suppress notification when inbox is disabled', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': false,
    });

    const config = makeConfig();
    manager.checkAndNotify(config, makeState({ inboxCount: 3 }));

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });

  it('should suppress notification when master is disabled', () => {
    configureSettings({
      'notifications.enabled': false,
      'notifications.inbox': true,
    });

    const config = makeConfig();
    manager.checkAndNotify(config, makeState({ inboxCount: 3 }));

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });

  it('should not notify when inbox count stays at zero', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': true,
    });

    const config = makeConfig();
    manager.checkAndNotify(config, makeState({ inboxCount: 0 }));

    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });

  it('should not notify when inbox count was already nonzero', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.inbox': true,
    });

    const config = makeConfig();
    manager.checkAndNotify(config, makeState({ inboxCount: 2 }));
    mockShowWarningMessage.mockClear();

    manager.checkAndNotify(config, makeState({ inboxCount: 5 }));
    expect(mockShowWarningMessage).not.toHaveBeenCalled();
  });
});
