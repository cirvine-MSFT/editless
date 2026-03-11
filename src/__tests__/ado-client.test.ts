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

import { fetchAdoWorkItems, fetchAdoPRs, fetchAdoMe, _resetAdoMeCache } from '../ado-client';

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
    expect(capturedPath).toContain('$top=50');
  });

  it('should include $top in WIQL POST URL with default limit', async () => {
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

    await fetchAdoWorkItems('myorg', 'proj', 'test-pat');
    expect(capturedPath).toContain('$top=200');
  });

  it('should send both recent and @me WIQL queries', async () => {
    const capturedBodies: string[] = [];
    mockHttpsRequest.mockImplementation((_opts: unknown, cb: Function) => {
      const resListeners = new Map<string, Function>();
      const res = {
        statusCode: 200,
        on: (event: string, handler: Function) => { resListeners.set(event, handler); return res; },
        resume: vi.fn(),
      };
      const reqListeners = new Map<string, Function>();
      const req = {
        on: (event: string, handler: Function) => { reqListeners.set(event, handler); return req; },
        write: vi.fn((data: string) => { capturedBodies.push(data); }),
        end: vi.fn(() => {
          Promise.resolve().then(() => {
            cb(res);
            resListeners.get('data')?.(Buffer.from(JSON.stringify({ workItems: [] })));
            resListeners.get('end')?.();
          });
        }),
        destroy: vi.fn(),
      };
      return req;
    });

    await fetchAdoWorkItems('myorg', 'proj', 'test-pat');
    expect(capturedBodies).toHaveLength(2);
    const queries = capturedBodies.map(b => JSON.parse(b).query as string);
    expect(queries.find(q => q.includes('ORDER BY'))).toBeTruthy();
    expect(queries.find(q => q.includes('@me'))).toBeTruthy();
  });

  it('should deduplicate IDs from both WIQL queries', async () => {
    let callIndex = 0;
    mockHttpsRequest.mockImplementation((_opts: unknown, cb: Function) => {
      callIndex++;
      const ids = callIndex === 1
        ? [{ id: 1 }, { id: 2 }, { id: 3 }]
        : [{ id: 2 }, { id: 3 }, { id: 4 }];
      const resListeners = new Map<string, Function>();
      const res = {
        statusCode: 200,
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
            resListeners.get('data')?.(Buffer.from(JSON.stringify({ workItems: ids })));
            resListeners.get('end')?.();
          });
        }),
        destroy: vi.fn(),
      };
      return req;
    });

    const idsRequested: number[] = [];
    mockHttpsGet.mockImplementation((opts: { path?: string }, cb: Function) => {
      const path = (opts as any).path || '';
      const match = path.match(/ids=([^&]+)/);
      if (match) idsRequested.push(...match[1].split(',').map(Number));
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
      const req = {
        on: (event: string, handler: Function) => { return req; },
        destroy: vi.fn(),
      };
      return req;
    });

    await fetchAdoWorkItems('myorg', 'proj', 'test-pat');
    expect(idsRequested.sort()).toEqual([1, 2, 3, 4]);
  });
  it('should include project name in work item details URL', async () => {
    // Setup a successful WIQL response with one ID
    setupRequestResponse(200, JSON.stringify({ workItems: [{ id: 1 }] }));

    let capturedDetailsPath = '';
    mockHttpsGet.mockImplementation((opts: { path?: string }, cb: Function) => {
      capturedDetailsPath = (opts as any).path || '';
      const body = JSON.stringify({ value: [{
        id: 1,
        fields: {
          'System.Title': 'Test',
          'System.State': 'Active',
          'System.WorkItemType': 'Bug',
          'System.AssignedTo': { displayName: 'Dev' },
          'System.AreaPath': 'Proj',
          'System.Tags': '',
        },
        _links: { html: { href: 'https://example.com' } },
      }] });
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
      const req = {
        on: (event: string, handler: Function) => { return req; },
        destroy: vi.fn(),
      };
      return req;
    });

    await fetchAdoWorkItems('https://dev.azure.com/myorg', 'MyProject', 'test-pat');
    // The details URL must include the project name between org and _apis
    expect(capturedDetailsPath).toContain('/MyProject/_apis/wit/workitems');
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

describe('fetchAdoMe', () => {
  beforeEach(() => {
    _resetAdoMeCache();
    mockHttpsGet.mockReset();
  });

  it('should return providerDisplayName, not email', async () => {
    setupGetResponse(200, JSON.stringify({
      authenticatedUser: {
        providerDisplayName: 'Russell Parry',
        properties: { Account: { $value: 'russellparry@microsoft.com' } },
      },
    }));

    const result = await fetchAdoMe('myorg', 'test-pat');
    expect(result).toBe('Russell Parry');
  });

  it('should return empty string on failure', async () => {
    setupGetResponse(401, 'Unauthorized');

    const result = await fetchAdoMe('myorg', 'test-pat');
    expect(result).toBe('');
  });
});
