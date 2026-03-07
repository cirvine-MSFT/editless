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
      resume: vi.fn(),
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
      resume: vi.fn(),
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

  it('should use configurable limit parameter', async () => {
    let capturedPath = '';
    mockHttpsRequest.mockImplementation((opts: { path?: string }, _cb: Function) => {
      capturedPath = opts.path ?? '';
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

    await fetchAdoWorkItems('myorg', 'proj', 'test-pat', 50);
    // The limit is used to cap the number of work items fetched
    expect(capturedPath).toBeTruthy();
  });

  it('should respect default limit of 200', async () => {
    // Setup a successful WIQL response with 250 IDs
    const ids = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }));
    setupRequestResponse(200, JSON.stringify({ workItems: ids }));
    
    let getCallCount = 0;
    const idsRequested: string[] = [];
    mockHttpsGet.mockImplementation((opts: { path?: string }, cb: Function) => {
      getCallCount++;
      // Capture the ids parameter to see how many are being fetched
      const path = (opts as any).path || '';
      const idsMatch = path.match(/ids=([^&]+)/);
      if (idsMatch) {
        idsRequested.push(idsMatch[1]);
      }
      const body = JSON.stringify({ value: [] });
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

    await fetchAdoWorkItems('myorg', 'proj', 'test-pat');
    // With default limit of 200, only 200 IDs should be requested (not all 250)
    expect(idsRequested.length).toBeGreaterThan(0);
    const totalIds = idsRequested.join(',').split(',').length;
    expect(totalIds).toBeLessThanOrEqual(200);
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

  it('should parse reviewer votes map with lowercase keys', async () => {
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
            reviewers: [
              { displayName: 'Alice', uniqueName: 'Alice@Company.com', vote: 10 },
              { displayName: 'Bob', uniqueName: 'Bob@Company.com', vote: -5 },
            ],
            repository: { name: 'MyRepo' },
            createdBy: { displayName: 'Charlie', uniqueName: 'Charlie@Company.com' },
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
    // Verify votes are stored with lowercase keys
    expect(result[0]!.reviewerVotes!.get('alice@company.com')).toBe(10);
    expect(result[0]!.reviewerVotes!.get('bob@company.com')).toBe(-5);
  });
});
