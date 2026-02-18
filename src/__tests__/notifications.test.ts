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

import { isNotificationEnabled } from '../notifications';

function configureSettings(settings: Record<string, boolean | undefined>) {
  mockGet.mockImplementation((key: string, defaultValue?: boolean) => {
    return key in settings ? settings[key] : defaultValue;
  });
}

describe('isNotificationEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when both master and category are enabled', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.updates': true,
    });
    expect(isNotificationEnabled('updates')).toBe(true);
  });

  it('should return false when master is disabled', () => {
    configureSettings({
      'notifications.enabled': false,
      'notifications.updates': true,
    });
    expect(isNotificationEnabled('updates')).toBe(false);
  });

  it('should return false when category is disabled', () => {
    configureSettings({
      'notifications.enabled': true,
      'notifications.updates': false,
    });
    expect(isNotificationEnabled('updates')).toBe(false);
  });

  it('should return false when both master and category are disabled', () => {
    configureSettings({
      'notifications.enabled': false,
      'notifications.updates': false,
    });
    expect(isNotificationEnabled('updates')).toBe(false);
  });

  it('should default to true when settings are not configured', () => {
    configureSettings({});
    expect(isNotificationEnabled('updates')).toBe(true);
  });
});
