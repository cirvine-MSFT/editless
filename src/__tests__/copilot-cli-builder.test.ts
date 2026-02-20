import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be defined before vi.mock()
// ---------------------------------------------------------------------------

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
    }),
  },
}));

import { buildCopilotCommand, buildDefaultLaunchCommand, getCliCommand } from '../copilot-cli-builder';
import type { CopilotCommandOptions } from '../copilot-cli-builder';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('copilot-cli-builder', () => {
  beforeEach(() => {
    mockGet.mockReset();
    // Default mock: command=copilot, defaultAgent=squad
    mockGet.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'command') return 'copilot';
      if (key === 'defaultAgent') return 'squad';
      return defaultValue;
    });
  });

  describe('getCliCommand', () => {
    it('returns configured CLI binary name', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'gh-copilot';
        return def;
      });
      expect(getCliCommand()).toBe('gh-copilot');
    });

    it('defaults to "copilot"', () => {
      expect(getCliCommand()).toBe('copilot');
    });
  });

  describe('buildCopilotCommand', () => {
    it('returns bare command when no options', () => {
      expect(buildCopilotCommand()).toBe('copilot');
    });

    it('adds --agent flag', () => {
      expect(buildCopilotCommand({ agent: 'squad' })).toBe('copilot --agent squad');
    });

    it('adds --resume flag with session ID', () => {
      expect(buildCopilotCommand({ resume: 'abc-123' })).toBe('copilot --resume abc-123');
    });

    it('adds --continue flag', () => {
      expect(buildCopilotCommand({ continue: true })).toBe('copilot --continue');
    });

    it('omits --continue when false', () => {
      expect(buildCopilotCommand({ continue: false })).toBe('copilot');
    });

    it('adds --model flag', () => {
      expect(buildCopilotCommand({ model: 'gpt-5' })).toBe('copilot --model gpt-5');
    });

    it('adds multiple --add-dir flags', () => {
      const cmd = buildCopilotCommand({ addDirs: ['/path/a', '/path/b'] });
      expect(cmd).toBe('copilot --add-dir /path/a --add-dir /path/b');
    });

    it('adds --allow-all-tools flag', () => {
      expect(buildCopilotCommand({ allowAllTools: true })).toBe('copilot --allow-all-tools');
    });

    it('omits --allow-all-tools when false', () => {
      expect(buildCopilotCommand({ allowAllTools: false })).toBe('copilot');
    });

    it('combines all flags in correct order', () => {
      const opts: CopilotCommandOptions = {
        agent: 'my-agent',
        resume: 'sess-42',
        model: 'claude-sonnet-4',
        addDirs: ['/extra'],
        allowAllTools: true,
      };
      expect(buildCopilotCommand(opts)).toBe(
        'copilot --agent my-agent --resume sess-42 --model claude-sonnet-4 --add-dir /extra --allow-all-tools',
      );
    });

    it('uses configured CLI binary name', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'my-cli';
        return def;
      });
      expect(buildCopilotCommand({ agent: 'squad' })).toBe('my-cli --agent squad');
    });

    it('does not include $(agent) in output', () => {
      const cmd = buildCopilotCommand({ agent: 'squad' });
      expect(cmd).not.toContain('$(agent)');
    });
  });

  describe('buildDefaultLaunchCommand', () => {
    it('builds command with default agent type', () => {
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent squad');
    });

    it('uses configured defaultAgent setting', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'copilot';
        if (key === 'defaultAgent') return 'my-custom-agent';
        return def;
      });
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent my-custom-agent');
    });

    it('never produces $(agent) interpolation tokens', () => {
      const cmd = buildDefaultLaunchCommand();
      expect(cmd).not.toContain('$(');
      expect(cmd).not.toContain('${');
    });
  });
});
