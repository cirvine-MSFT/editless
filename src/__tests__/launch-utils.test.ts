import { describe, it, expect, vi, beforeEach } from 'vitest';
import { launchAndLabel } from '../launch-utils';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import type { AgentTeamConfig } from '../types';

describe('launch-utils', () => {
  describe('launchAndLabel', () => {
    let mockTerminalManager: TerminalManager;
    let mockLabelManager: SessionLabelManager;
    let mockConfig: AgentTeamConfig;
    let mockTerminal: any;

    beforeEach(() => {
      mockTerminal = { name: 'test-terminal' };
      
      mockTerminalManager = {
        launchTerminal: vi.fn().mockReturnValue(mockTerminal),
        getLabelKey: vi.fn().mockReturnValue('terminal:test-key'),
      } as any;

      mockLabelManager = {
        setLabel: vi.fn(),
      } as any;

      mockConfig = {
        id: 'test-squad',
        name: 'Test Squad',
        path: '/test/path',
        icon: '🧪',
        universe: 'test',
      };
    });

    it('should launch terminal and set label', () => {
      const rawName = '#123 Test work item';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName, undefined, undefined);
      expect(mockTerminalManager.getLabelKey).toHaveBeenCalledWith(mockTerminal);
      expect(mockLabelManager.setLabel).toHaveBeenCalledWith('terminal:test-key', rawName);
    });

    it('should handle long names without truncation', () => {
      const longName = 'This is a very long session name that can be displayed with native VS Code ellipsis handling';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, longName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, longName, undefined, undefined);
      expect(mockLabelManager.setLabel).toHaveBeenCalledWith('terminal:test-key', longName);
    });

    it('should return the launched terminal', () => {
      const rawName = '#456 Another test';
      
      const result = launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(result).toBe(mockTerminal);
    });

    it('should handle work item format (#number title)', () => {
      const rawName = '#789 Implement new feature';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName, undefined, undefined);
    });

    it('should handle PR format (PR #number title)', () => {
      const rawName = 'PR #101 Fix bug in authentication';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName, undefined, undefined);
    });

    it('should pass extraEnv to launchTerminal', () => {
      const rawName = '#42 Work item with env';
      const extraEnv = { EDITLESS_WORK_ITEM_URI: 'https://github.com/tasks/42' };

      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName, extraEnv);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName, extraEnv, undefined);
    });

    it('should pass initialPrompt to launchTerminal when provided', () => {
      const rawName = '#99 Prompted item';
      const extraEnv = { EDITLESS_WORK_ITEM_URI: 'https://github.com/tasks/99' };
      const initialPrompt = 'Issue#99: Prompted item';

      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName, extraEnv, initialPrompt);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(
        mockConfig,
        rawName,
        extraEnv,
        initialPrompt,
      );
      expect(mockLabelManager.setLabel).toHaveBeenCalledWith('terminal:test-key', rawName);
    });
  });
});
