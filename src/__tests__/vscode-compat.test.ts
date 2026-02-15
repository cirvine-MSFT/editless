import { describe, it, expect, vi, beforeEach } from 'vitest';

const envMock = vi.hoisted(() => ({ appName: 'Visual Studio Code' }));
vi.mock('vscode', () => ({ env: envMock }));

import { isInsiders, getEdition, hasApi } from '../vscode-compat';

describe('vscode-compat', () => {
  beforeEach(() => {
    envMock.appName = 'Visual Studio Code';
  });

  describe('isInsiders', () => {
    it('should return false for stable edition', () => {
      envMock.appName = 'Visual Studio Code';
      expect(isInsiders()).toBe(false);
    });

    it('should return true for Insiders edition', () => {
      envMock.appName = 'Visual Studio Code - Insiders';
      expect(isInsiders()).toBe(true);
    });
  });

  describe('getEdition', () => {
    it('should return "stable" for stable edition', () => {
      envMock.appName = 'Visual Studio Code';
      expect(getEdition()).toBe('stable');
    });

    it('should return "insiders" for Insiders edition', () => {
      envMock.appName = 'Visual Studio Code - Insiders';
      expect(getEdition()).toBe('insiders');
    });
  });

  describe('hasApi', () => {
    it('should return true when object has the method', () => {
      const obj = { doSomething: () => {} };
      expect(hasApi(obj, 'doSomething')).toBe(true);
    });

    it('should return false when object lacks the method', () => {
      const obj = { other: () => {} };
      expect(hasApi(obj, 'doSomething')).toBe(false);
    });

    it('should return false when property is not a function', () => {
      const obj = { doSomething: 42 };
      expect(hasApi(obj, 'doSomething')).toBe(false);
    });

    it('should return false for null', () => {
      expect(hasApi(null, 'doSomething')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(hasApi(undefined, 'doSomething')).toBe(false);
    });

    it('should return false for non-object primitives', () => {
      expect(hasApi(42, 'toString')).toBe(false);
      expect(hasApi('string', 'charAt')).toBe(false);
    });
  });
});
