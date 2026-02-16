import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the https module for all ADO API calls
const { mockHttpsGet, mockHttpsRequest } = vi.hoisted(() => ({
  mockHttpsGet: vi.fn(),
  mockHttpsRequest: vi.fn(),
}));

vi.mock('https', () => ({
  get: mockHttpsGet,
  request: mockHttpsRequest,
}));

import { fetchAdoWorkItems, fetchAdoPRs } from '../ado-client';

/**
 * Creates a mock HTTP response that immediately fires data+end events
 * when the callback is invoked.
 */
function setupGetResponse(statusCode: number, body: string) {
  mockHttpsGet.mockImplementation((_opts: unknown, cb: Function) => {
    const resListeners = new Map<string, Function>();
    const res = {
      statusCode,
      on: (event: string, handler: Function) => { resListeners.set(event, handler); return res; },
    };
    // Schedule callback + events on next microtask so listeners are registered first
    Promise.resolve().then(() => {
      cb(res);
      resListeners.get('data')?.(Buffer.from(body));
      resListeners.get('end')?.();
    });
    const reqListeners = new Map<string, Function>();
    const req = {
      on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
      destroy: vi.fn(),
    };
    return req;
  });
}

function setupRequestResponse(statusCode: number, body: string) {
  mockHttpsRequest.mockImplementation((_opts: unknown, cb: Function) => {
    const resListeners = new Map<string, Function>();
    const res = {
      statusCode,
      on: (event: string, handler: Function) => { resListeners.set(event, handler); return res; },
    };
    const reqListeners = new Map<string, Function>();
    const req = {
      on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
      write: vi.fn(),
      end: vi.fn(() => {
        Promise.resolve().then(() => {
          cb(res);
          resListeners.get('data')?.(Buffer.from(body));
          resListeners.get('end')?.();
        });
      }),
      destroy: vi.fn(),
    };
    return req;
  });
}

function setupRequestError() {
  mockHttpsRequest.mockImplementation((_opts: unknown, _cb: Function) => {
    const reqListeners = new Map<string, Function>();
    const req = {
      on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
      write: vi.fn(),
      end: vi.fn(() => {
        Promise.resolve().then(() => reqListeners.get('error')?.(new Error('network fail')));
      }),
      destroy: vi.fn(),
    };
    return req;
  });
}

describe('fetchAdoWorkItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when WIQL query fails', async () => {
    setupRequestError();
    const result = await fetchAdoWorkItems('myorg', 'myproject', 'test-pat');
    expect(result).toEqual([]);
  });

  it('should return empty array when WIQL returns no work items', async () => {
    setupRequestResponse(200, JSON.stringify({ workItems: [] }));
    const result = await fetchAdoWorkItems('myorg', 'myproject', 'test-pat');
    expect(result).toEqual([]);
  });

  it('should use Basic auth header for PAT tokens', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockHttpsRequest.mockImplementation((opts: { headers?: Record<string, string> }, _cb: Function) => {
      capturedHeaders = opts.headers ?? {};
      const reqListeners = new Map<string, Function>();
      const req = {
        on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
        write: vi.fn(),
        end: vi.fn(() => {
          Promise.resolve().then(() => reqListeners.get('error')?.(new Error('stop')));
        }),
        destroy: vi.fn(),
      };
      return req;
    });

    await fetchAdoWorkItems('myorg', 'proj', 'my-pat-token');
    expect(capturedHeaders['Authorization']).toMatch(/^Basic /);
  });

  it('should use Bearer auth header for JWT tokens', async () => {
    let capturedHeaders: Record<string, string> = {};
    mockHttpsRequest.mockImplementation((opts: { headers?: Record<string, string> }, _cb: Function) => {
      capturedHeaders = opts.headers ?? {};
      const reqListeners = new Map<string, Function>();
      const req = {
        on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
        write: vi.fn(),
        end: vi.fn(() => {
          Promise.resolve().then(() => reqListeners.get('error')?.(new Error('stop')));
        }),
        destroy: vi.fn(),
      };
      return req;
    });

    await fetchAdoWorkItems('myorg', 'proj', 'eyJhbGciOiJSUzI1NiJ9.test.token');
    expect(capturedHeaders['Authorization']).toMatch(/^Bearer /);
  });
});

describe('fetchAdoPRs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when repos fetch fails', async () => {
    setupGetResponse(500, 'error');
    const result = await fetchAdoPRs('myorg', 'myproject', 'test-pat');
    expect(result).toEqual([]);
  });

  it('should return empty array when no repos found', async () => {
    setupGetResponse(200, JSON.stringify({ value: [] }));
    const result = await fetchAdoPRs('myorg', 'myproject', 'test-pat');
    expect(result).toEqual([]);
  });

  it('should map PR status correctly', async () => {
    let callCount = 0;
    mockHttpsGet.mockImplementation((_opts: unknown, cb: Function) => {
      callCount++;
      let body: string;
      if (callCount === 1) {
        body = JSON.stringify({ value: [{ id: 'repo-1', name: 'MyRepo' }] });
      } else {
        body = JSON.stringify({
          value: [{
            pullRequestId: 42,
            title: 'Test PR',
            status: 'active',
            isDraft: false,
            sourceRefName: 'refs/heads/feature',
            targetRefName: 'refs/heads/main',
            reviewers: [{ displayName: 'Alice' }],
            repository: { name: 'MyRepo' },
          }],
        });
      }
      const resListeners = new Map<string, Function>();
      const res = {
        statusCode: 200,
        on: (event: string, handler: Function) => { resListeners.set(event, handler); return res; },
      };
      Promise.resolve().then(() => {
        cb(res);
        resListeners.get('data')?.(Buffer.from(body));
        resListeners.get('end')?.();
      });
      const reqListeners = new Map<string, Function>();
      const req = {
        on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
        destroy: vi.fn(),
      };
      return req;
    });

    const result = await fetchAdoPRs('myorg', 'myproject', 'test-pat');
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('open');
    expect(result[0].sourceRef).toBe('feature');
    expect(result[0].targetRef).toBe('main');
    expect(result[0].reviewers).toEqual(['Alice']);
  });
});
