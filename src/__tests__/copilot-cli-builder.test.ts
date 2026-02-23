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

import { buildCopilotCommand, buildDefaultLaunchCommand, buildLaunchCommandForConfig, getCliCommand } from '../copilot-cli-builder';
import type { CopilotCommandOptions } from '../copilot-cli-builder';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('copilot-cli-builder', () => {
  beforeEach(() => {
    mockGet.mockReset();
    // Default mock: additionalArgs=''
    mockGet.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'additionalArgs') return '';
      return defaultValue;
    });
  });

  describe('getCliCommand', () => {
    it('always returns "copilot"', () => {
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

    it('adds multiple --add-dir flags', () => {
      const cmd = buildCopilotCommand({ addDirs: ['/path/a', '/path/b'] });
      expect(cmd).toBe('copilot --add-dir /path/a --add-dir /path/b');
    });

    it('combines typed flags with extraArgs in correct order', () => {
      const opts: CopilotCommandOptions = {
        agent: 'my-agent',
        resume: 'sess-42',
        addDirs: ['/extra'],
        extraArgs: ['--model', 'claude-sonnet-4', '--yolo'],
      };
      expect(buildCopilotCommand(opts)).toBe(
        'copilot --agent my-agent --resume sess-42 --add-dir /extra --model claude-sonnet-4 --yolo',
      );
    });

    it('uses configured CLI binary name', () => {
      // CLI binary is now hardcoded to "copilot"
      expect(buildCopilotCommand({ agent: 'squad' })).toBe('copilot --agent squad');
    });

    it('does not include $(agent) in output', () => {
      const cmd = buildCopilotCommand({ agent: 'squad' });
      expect(cmd).not.toContain('$(agent)');
    });
  });

  describe('extraArgs', () => {
    it('passes through unknown flags', () => {
      expect(buildCopilotCommand({ extraArgs: ['--yolo', '--verbose'] })).toBe(
        'copilot --yolo --verbose',
      );
    });

    it('passes through non-flag arguments', () => {
      expect(buildCopilotCommand({ extraArgs: ['some-value'] })).toBe(
        'copilot some-value',
      );
    });

    it('deduplicates typed flags that are already set (typed wins, drops value)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildCopilotCommand({ agent: 'squad', extraArgs: ['--agent', 'other'] });
      expect(cmd).toBe('copilot --agent squad');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--agent'),
      );
      warnSpy.mockRestore();
    });

    it('passes through CLI flags like --model, --yolo, --continue via extraArgs', () => {
      expect(buildCopilotCommand({ extraArgs: ['--model', 'gpt-5'] })).toBe(
        'copilot --model gpt-5',
      );
      expect(buildCopilotCommand({ extraArgs: ['--yolo'] })).toBe('copilot --yolo');
      expect(buildCopilotCommand({ extraArgs: ['--continue'] })).toBe('copilot --continue');
    });

    it('does not affect output when empty', () => {
      expect(buildCopilotCommand({ extraArgs: [] })).toBe('copilot');
    });

    it('warns on console when dedup occurs', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildCopilotCommand({ agent: 'squad', extraArgs: ['--agent', 'other'] });
      expect(cmd).toBe('copilot --agent squad');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('--agent'),
      );
      warnSpy.mockRestore();
    });

    it('appends after typed flags', () => {
      const cmd = buildCopilotCommand({ agent: 'squad', extraArgs: ['--yolo'] });
      expect(cmd).toBe('copilot --agent squad --yolo');
    });
  });

  describe('buildDefaultLaunchCommand', () => {
    it('builds command with hardcoded agent "squad"', () => {
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent squad');
    });

    it('appends additionalArgs from settings', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'additionalArgs') return '--yolo --model gpt-5';
        return def;
      });
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent squad --yolo --model gpt-5');
    });

    it('handles empty additionalArgs', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'additionalArgs') return '';
        return def;
      });
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent squad');
    });

    it('handles whitespace-only additionalArgs', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'additionalArgs') return '   ';
        return def;
      });
      expect(buildDefaultLaunchCommand()).toBe('copilot --agent squad');
    });

    it('never produces $(agent) interpolation tokens', () => {
      const cmd = buildDefaultLaunchCommand();
      expect(cmd).not.toContain('$(');
      expect(cmd).not.toContain('${');
    });
  });

  describe('buildLaunchCommandForConfig', () => {
    it('builds command with squad agent flag derived from universe', () => {
      expect(buildLaunchCommandForConfig({ id: 'my-squad', universe: 'rick-and-morty' })).toBe('copilot --agent squad');
    });

    it('builds bare command when id is builtin:copilot-cli', () => {
      expect(buildLaunchCommandForConfig({ id: 'builtin:copilot-cli', universe: 'unknown' })).toBe('copilot');
    });

    it('includes --model when model is set', () => {
      expect(buildLaunchCommandForConfig({ id: 'my-squad', universe: 'rick-and-morty', model: 'gpt-5' }))
        .toBe('copilot --agent squad --model gpt-5');
    });

    it('includes per-config additionalArgs', () => {
      expect(buildLaunchCommandForConfig({ id: 'my-squad', universe: 'rick-and-morty', additionalArgs: '--yolo' }))
        .toBe('copilot --agent squad --yolo');
    });

    it('merges per-config and global additionalArgs', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'additionalArgs') return '--verbose';
        return def;
      });
      expect(buildLaunchCommandForConfig({ id: 'my-squad', universe: 'rick-and-morty', additionalArgs: '--yolo' }))
        .toBe('copilot --agent squad --yolo --verbose');
    });

    it('includes model before additionalArgs', () => {
      expect(buildLaunchCommandForConfig({ id: 'my-agent', universe: 'standalone', model: 'gpt-5', additionalArgs: '--yolo' }))
        .toBe('copilot --agent my-agent --model gpt-5 --yolo');
    });

    it('handles all undefined fields except id/universe', () => {
      expect(buildLaunchCommandForConfig({ id: 'builtin:copilot-cli', universe: 'unknown' })).toBe('copilot');
    });
  });

  describe('shell quoting', () => {
    it('quotes addDirs paths that contain spaces', () => {
      const cmd = buildCopilotCommand({ addDirs: ['C:\\Program Files\\MyApp'] });
      expect(cmd).toBe('copilot --add-dir "C:\\Program Files\\MyApp"');
    });

    it('does not quote addDirs paths without spaces', () => {
      const cmd = buildCopilotCommand({ addDirs: ['/simple/path'] });
      expect(cmd).toBe('copilot --add-dir /simple/path');
    });

    it('quotes extraArgs values that contain spaces', () => {
      const cmd = buildCopilotCommand({ extraArgs: ['some value with spaces'] });
      expect(cmd).toBe('copilot "some value with spaces"');
    });

    it('shell metacharacters in values with spaces get quoted (documented behavior)', () => {
      const cmd = buildCopilotCommand({ extraArgs: ['--flag', 'val;rm -rf /'] });
      expect(cmd).toBe('copilot --flag "val;rm -rf /"');
    });
  });

  describe('dedup edge cases', () => {
    it('drops both flag AND its dangling value when deduplicating', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildCopilotCommand({
        agent: 'squad',
        extraArgs: ['--agent', 'other', '--yolo'],
      });
      expect(cmd).toBe('copilot --agent squad --yolo');
      warnSpy.mockRestore();
    });

    it('deduplicates --flag=value syntax', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildCopilotCommand({
        agent: 'squad',
        extraArgs: ['--agent=other'],
      });
      expect(cmd).toBe('copilot --agent squad');
      warnSpy.mockRestore();
    });

    it('does not skip the next arg when dedup flag is followed by another flag', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildCopilotCommand({
        agent: 'squad',
        extraArgs: ['--agent', '--yolo'],
      });
      expect(cmd).toBe('copilot --agent squad --yolo');
      warnSpy.mockRestore();
    });
  });

  describe('defensive filtering', () => {
    it('filters null/undefined values in extraArgs without crashing', () => {
      const cmd = buildCopilotCommand({ extraArgs: [undefined as any, null as any, '--yolo'] });
      expect(cmd).toBe('copilot --yolo');
    });

    it('filters empty strings in extraArgs', () => {
      const cmd = buildCopilotCommand({ extraArgs: ['', '--yolo'] });
      expect(cmd).toBe('copilot --yolo');
    });
  });

  describe('legacy config stripping', () => {
    it('getCliCommand always returns "copilot" regardless of mock', () => {
      expect(getCliCommand()).toBe('copilot');
    });
  });
});
