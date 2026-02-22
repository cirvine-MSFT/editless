import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSessionName, launchAndLabel, MAX_SESSION_NAME } from '../launch-utils';
import type { TerminalManager } from '../terminal-manager';
import type { SessionLabelManager } from '../session-labels';
import type { AgentTeamConfig } from '../types';

describe('launch-utils', () => {
  describe('buildSessionName', () => {
    it('should return the raw name unchanged if within MAX_SESSION_NAME', () => {
      const shortName = 'Short name';
      expect(buildSessionName(shortName)).toBe(shortName);
    });

    it('should return the raw name unchanged if exactly MAX_SESSION_NAME', () => {
      const exactName = 'a'.repeat(MAX_SESSION_NAME);
      expect(buildSessionName(exactName)).toBe(exactName);
    });

    it('should truncate at word boundary and append ellipsis for long names', () => {
      const longName = 'This is a very long session name that exceeds the maximum allowed length';
      const result = buildSessionName(longName);
      
      expect(result.length).toBeLessThanOrEqual(MAX_SESSION_NAME + 1); // +1 for ellipsis
      expect(result).toMatch(/…$/);
      expect(result).not.toContain('  '); // Should not truncate mid-word leaving double spaces
    });

    it('should truncate at last space before MAX_SESSION_NAME when space exists', () => {
      // Create a name with a space at position 45, then more characters
      const nameWithSpace = 'This is a name with exactly forty-five chars then more text';
      const result = buildSessionName(nameWithSpace);
      
      expect(result).toMatch(/…$/);
      // Should truncate at the last space before position 50
      const truncatedWithoutEllipsis = result.slice(0, -1);
      expect(truncatedWithoutEllipsis).not.toMatch(/ $/); // Shouldn't end with space
      expect(nameWithSpace.startsWith(truncatedWithoutEllipsis)).toBe(true);
    });

    it('should truncate at MAX_SESSION_NAME when no space exists before limit', () => {
      // Create a name with no spaces near the limit
      const nameWithoutSpaces = 'a'.repeat(60);
      const result = buildSessionName(nameWithoutSpaces);
      
      expect(result).toBe('a'.repeat(MAX_SESSION_NAME) + '…');
      expect(result.length).toBe(MAX_SESSION_NAME + 1);
    });

    it('should handle names with spaces only after MAX_SESSION_NAME', () => {
      const name = 'a'.repeat(55) + ' more text';
      const result = buildSessionName(name);
      
      expect(result).toBe('a'.repeat(MAX_SESSION_NAME) + '…');
      expect(result.length).toBe(MAX_SESSION_NAME + 1);
    });

    it('should append ellipsis character (…) not three dots', () => {
      const longName = 'a'.repeat(60);
      const result = buildSessionName(longName);
      
      expect(result).toMatch(/…$/);
      expect(result).not.toMatch(/\.\.\.$/);
    });

    it('should handle real-world work item name', () => {
      const workItemName = '#12345 Implement user authentication with OAuth2 and JWT tokens for the new API';
      const result = buildSessionName(workItemName);
      
      expect(result.length).toBeLessThanOrEqual(MAX_SESSION_NAME + 1);
      expect(result).toMatch(/…$/);
      expect(result).toContain('#12345');
    });

    it('should handle real-world PR name', () => {
      const prName = 'PR #456 Fix critical security vulnerability in authentication middleware';
      const result = buildSessionName(prName);
      
      expect(result.length).toBeLessThanOrEqual(MAX_SESSION_NAME + 1);
      expect(result).toMatch(/…$/);
      expect(result).toContain('PR #456');
    });
  });

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

    it('should build session name, launch terminal, and set label', () => {
      const rawName = '#123 Test work item';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName);
      expect(mockTerminalManager.getLabelKey).toHaveBeenCalledWith(mockTerminal);
      expect(mockLabelManager.setLabel).toHaveBeenCalledWith('terminal:test-key', rawName);
    });

    it('should truncate long names before launching', () => {
      const longName = 'This is a very long session name that exceeds the maximum allowed length';
      const expectedTruncated = buildSessionName(longName);
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, longName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, expectedTruncated);
      expect(mockLabelManager.setLabel).toHaveBeenCalledWith('terminal:test-key', expectedTruncated);
    });

    it('should return the launched terminal', () => {
      const rawName = '#456 Another test';
      
      const result = launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(result).toBe(mockTerminal);
    });

    it('should handle work item format (#number title)', () => {
      const rawName = '#789 Implement new feature';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName);
    });

    it('should handle PR format (PR #number title)', () => {
      const rawName = 'PR #101 Fix bug in authentication';
      
      launchAndLabel(mockTerminalManager, mockLabelManager, mockConfig, rawName);

      expect(mockTerminalManager.launchTerminal).toHaveBeenCalledWith(mockConfig, rawName);
    });
  });
});
