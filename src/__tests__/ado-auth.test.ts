import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetSession,
  mockSecretGet,
  mockExecFile,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockSecretGet: vi.fn(),
  mockExecFile: vi.fn(),
}));

vi.mock('vscode', () => ({
  authentication: {
    getSession: mockGetSession,
  },
}));

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('util', () => ({
  promisify: (fn: Function) => fn,
}));

import { getAdoToken, promptAdoSignIn, clearAzTokenCache, setAdoAuthOutput } from '../ado-auth';

function makeSecrets(): { get: typeof mockSecretGet } {
  return { get: mockSecretGet };
}

describe('getAdoToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAzTokenCache();
  });

  it('should return VS Code Microsoft auth token when available', async () => {
    mockGetSession.mockResolvedValue({ accessToken: 'vscode-token-123' });
    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBe('vscode-token-123');
  });

  it('should fall back to PAT from secret storage when auth provider fails', async () => {
    mockGetSession.mockRejectedValue(new Error('not signed in'));
    mockSecretGet.mockResolvedValue('pat-token-abc');
    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBe('pat-token-abc');
  });

  it('should fall back to az CLI when auth and PAT unavailable', async () => {
    mockGetSession.mockResolvedValue(undefined);
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValue({ stdout: '  az-cli-token-xyz  \n' });
    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBe('az-cli-token-xyz');
  });

  it('should cache az CLI token on second call', async () => {
    mockGetSession.mockResolvedValue(undefined);
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValue({ stdout: 'cached-token\n' });

    await getAdoToken(makeSecrets() as never);
    await getAdoToken(makeSecrets() as never);

    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });

  it('should return undefined when all strategies fail', async () => {
    mockGetSession.mockRejectedValue(new Error('nope'));
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValue(new Error('az not found'));
    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBeUndefined();
  });

  it('should prefer VS Code auth over PAT and az CLI', async () => {
    mockGetSession.mockResolvedValue({ accessToken: 'vscode-first' });
    mockSecretGet.mockResolvedValue('pat-second');
    mockExecFile.mockResolvedValue({ stdout: 'az-third\n' });

    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBe('vscode-first');
    expect(mockSecretGet).not.toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should return undefined when az CLI returns empty string', async () => {
    mockGetSession.mockResolvedValue(undefined);
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValue({ stdout: '  \n' });
    const token = await getAdoToken(makeSecrets() as never);
    expect(token).toBeUndefined();
  });
});

describe('promptAdoSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return access token on successful sign-in', async () => {
    mockGetSession.mockResolvedValue({ accessToken: 'signed-in-token' });
    const token = await promptAdoSignIn();
    expect(token).toBe('signed-in-token');
    expect(mockGetSession).toHaveBeenCalledWith(
      'microsoft',
      expect.any(Array),
      expect.objectContaining({ createIfNone: true }),
    );
  });

  it('should return undefined when user cancels sign-in', async () => {
    mockGetSession.mockRejectedValue(new Error('cancelled'));
    const token = await promptAdoSignIn();
    expect(token).toBeUndefined();
  });
});

describe('clearAzTokenCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAzTokenCache();
  });

  it('should force az CLI re-fetch after cache clear', async () => {
    mockGetSession.mockResolvedValue(undefined);
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValue({ stdout: 'first-token\n' });

    await getAdoToken(makeSecrets() as never);
    expect(mockExecFile).toHaveBeenCalledTimes(1);

    clearAzTokenCache();
    mockExecFile.mockResolvedValue({ stdout: 'second-token\n' });

    const token = await getAdoToken(makeSecrets() as never);
    expect(mockExecFile).toHaveBeenCalledTimes(2);
    expect(token).toBe('second-token');
  });
});

// --- Regression tests for #252: error logging ---

describe('error logging (#252)', () => {
  const mockAppendLine = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearAzTokenCache();
    setAdoAuthOutput({ appendLine: mockAppendLine } as never);
  });

  afterEach(() => {
    setAdoAuthOutput(undefined as never);
  });

  it('should log auth provider errors to output channel instead of swallowing', async () => {
    const authError = new Error('Microsoft auth unavailable');
    mockGetSession.mockRejectedValue(authError);
    mockSecretGet.mockResolvedValue('fallback-pat');

    await getAdoToken(makeSecrets() as never);

    expect(mockAppendLine).toHaveBeenCalledWith(
      expect.stringContaining('Microsoft auth unavailable'),
    );
  });

  it('should log az CLI errors to output channel instead of swallowing', async () => {
    mockGetSession.mockResolvedValue(undefined);
    mockSecretGet.mockResolvedValue(undefined);
    const azError = new Error('az: command not found');
    mockExecFile.mockRejectedValue(azError);

    await getAdoToken(makeSecrets() as never);

    expect(mockAppendLine).toHaveBeenCalledWith(
      expect.stringContaining('az: command not found'),
    );
  });

  it('should log promptAdoSignIn errors to output channel instead of swallowing', async () => {
    const signInError = new Error('User cancelled auth');
    mockGetSession.mockRejectedValue(signInError);

    await promptAdoSignIn();

    expect(mockAppendLine).toHaveBeenCalledWith(
      expect.stringContaining('User cancelled auth'),
    );
  });

  it('should not throw when output channel is not set', async () => {
    setAdoAuthOutput(undefined as never);
    mockGetSession.mockRejectedValue(new Error('fail'));
    mockSecretGet.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValue(new Error('fail'));

    await expect(getAdoToken(makeSecrets() as never)).resolves.toBeUndefined();
  });
});
