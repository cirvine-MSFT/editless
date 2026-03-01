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
    // Default mock: command='copilot', additionalArgs=''
    mockGet.mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'additionalArgs') return '';
      if (key === 'command') return 'copilot';
      return defaultValue;
    });
  });

  describe('getCliCommand', () => {
    it('returns "copilot" by default', () => {
      expect(getCliCommand()).toBe('copilot');
    });

    it('returns override when provided', () => {
      expect(getCliCommand('my-custom-cli')).toBe('my-custom-cli');
    });

    it('reads from editless.cli.command setting', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return '/usr/local/bin/my-copilot';
        return def;
      });
      expect(getCliCommand()).toBe('/usr/local/bin/my-copilot');
    });

    it('override takes precedence over global setting', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'global-cli';
        return def;
      });
      expect(getCliCommand('per-agent-cli')).toBe('per-agent-cli');
    });

    it('falls through to config when override is empty string', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'global-cli';
        return def;
      });
      expect(getCliCommand('')).toBe('global-cli');
    });

    it('falls back to "copilot" when config returns empty string', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return '';
        return def;
      });
      expect(getCliCommand()).toBe('copilot');
    });

    it('falls back to "copilot" when config returns whitespace-only', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return '   ';
        return def;
      });
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
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'custom-copilot';
        return def;
      });
      expect(buildCopilotCommand({ agent: 'squad' })).toBe('custom-copilot --agent squad');
    });

    it('uses command override from options', () => {
      expect(buildCopilotCommand({ command: 'my-cli', agent: 'squad' })).toBe('my-cli --agent squad');
    });

    it('supports multi-word command without quoting', () => {
      expect(buildCopilotCommand({ command: 'my-wrapper copilot', agent: 'squad' }))
        .toBe('my-wrapper copilot --agent squad');
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

    it('uses global editless.cli.command setting', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'custom-copilot';
        if (key === 'additionalArgs') return '';
        return def;
      });
      expect(buildDefaultLaunchCommand()).toBe('custom-copilot --agent squad');
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

    it('strips --model from additionalArgs when config.model is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', model: 'gpt-5', additionalArgs: '--model claude-sonnet',
      });
      expect(cmd).toBe('copilot --agent squad --model gpt-5');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--model'));
      warnSpy.mockRestore();
    });

    it('strips --agent from additionalArgs when agentFlag is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', additionalArgs: '--agent other',
      });
      expect(cmd).toBe('copilot --agent squad');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--agent'));
      warnSpy.mockRestore();
    });

    it('preserves non-duplicate flags in additionalArgs after stripping', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', model: 'gpt-5', additionalArgs: '--model claude-sonnet --yolo --verbose',
      });
      expect(cmd).toBe('copilot --agent squad --model gpt-5 --yolo --verbose');
      warnSpy.mockRestore();
    });

    it('strips --model from global additionalArgs when config.model is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'additionalArgs') return '--model claude-sonnet';
        return def;
      });
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', model: 'gpt-5',
      });
      expect(cmd).toBe('copilot --agent squad --model gpt-5');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--model'));
      warnSpy.mockRestore();
    });

    it('passes through --model in additionalArgs when config.model is not set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', additionalArgs: '--model gpt-5',
      });
      expect(cmd).toBe('copilot --agent squad --model gpt-5');
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('strips --model=value syntax from additionalArgs when config.model is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', model: 'gpt-5', additionalArgs: '--model=claude-sonnet',
      });
      expect(cmd).toBe('copilot --agent squad --model gpt-5');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--model'));
      warnSpy.mockRestore();
    });

    it('strips --agent=value syntax from additionalArgs when agentFlag is set', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', additionalArgs: '--agent=other-agent --yolo',
      });
      expect(cmd).toBe('copilot --agent squad --yolo');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--agent'));
      warnSpy.mockRestore();
    });

    it('uses per-agent command override', () => {
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', command: 'my-cli',
      });
      expect(cmd).toBe('my-cli --agent squad');
    });

    it('uses global editless.cli.command when no per-agent command', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'global-cli';
        if (key === 'additionalArgs') return '';
        return def;
      });
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty',
      });
      expect(cmd).toBe('global-cli --agent squad');
    });

    it('per-agent command takes precedence over global setting', () => {
      mockGet.mockImplementation((key: string, def?: unknown) => {
        if (key === 'command') return 'global-cli';
        if (key === 'additionalArgs') return '';
        return def;
      });
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', command: 'agent-cli',
      });
      expect(cmd).toBe('agent-cli --agent squad');
    });

    it('supports multi-word command in buildLaunchCommandForConfig', () => {
      const cmd = buildLaunchCommandForConfig({
        id: 'my-squad', universe: 'rick-and-morty', command: 'my-wrapper copilot',
      });
      expect(cmd).toBe('my-wrapper copilot --agent squad');
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
    it('getCliCommand returns "copilot" when no override and default setting', () => {
      expect(getCliCommand()).toBe('copilot');
    });
  });
});
