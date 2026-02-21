import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter as NodeEventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockSpawn,
  mockOutputChannel,
  mockBuildCopilotCommand,
  mockVscodeEventEmitter,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockOutputChannel: {
    appendLine: vi.fn(),
    append: vi.fn(),
    clear: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    dispose: vi.fn(),
    name: 'ACP Test',
    replace: vi.fn(),
  },
  mockBuildCopilotCommand: vi.fn(),
  mockVscodeEventEmitter: class<T> {
    private listeners: Array<(e: T) => void> = [];
    get event() {
      return (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data: T) {
      this.listeners.forEach(l => l(data));
    }
    dispose() {
      this.listeners = [];
    }
  },
}));

vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

vi.mock('vscode', () => ({
  EventEmitter: mockVscodeEventEmitter,
  workspace: {
    workspaceFolders: [],
  },
}));

vi.mock('../copilot-cli-builder', () => ({
  buildCopilotCommand: mockBuildCopilotCommand,
}));

import { AcpClient, AcpRequestHandler } from '../acp/client';
import type * as types from '../acp/types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

class FakeChildProcess extends NodeEventEmitter {
  stdin = {
    write: vi.fn(),
  };
  stdout = new NodeEventEmitter();
  stderr = new NodeEventEmitter();
  kill = vi.fn();
}

function createMockHandler(): AcpRequestHandler {
  return {
    onPermissionRequest: vi.fn().mockResolvedValue({ approved: true }),
    onReadTextFile: vi.fn().mockResolvedValue({ content: 'test file content' }),
    onWriteTextFile: vi.fn().mockResolvedValue({ success: true }),
    onTerminalCreate: vi.fn().mockResolvedValue({ terminalId: 'term-123' }),
    onTerminalOutput: vi.fn().mockResolvedValue({ output: 'test output' }),
    onTerminalWaitForExit: vi.fn().mockResolvedValue({ exitCode: 0 }),
    onTerminalKill: vi.fn().mockResolvedValue({ success: true }),
    onTerminalRelease: vi.fn().mockResolvedValue({ success: true }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcpClient', () => {
  let fakeProcess: FakeChildProcess;
  let handler: AcpRequestHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeProcess = new FakeChildProcess();
    mockSpawn.mockReturnValue(fakeProcess as unknown as ChildProcess);
    mockBuildCopilotCommand.mockReturnValue('copilot --acp --stdio');
    handler = createMockHandler();
  });

  describe('NDJSON Parser', () => {
    it('parses single complete JSON-RPC message from a line', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      // Send response on next tick
      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test Agent', version: '1.0.0' },
            authMethods: [],
          },
        };
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });

      const result = await initPromise;
      expect(result.agentInfo.name).toBe('Test');
    });

    it('handles multiple messages in one data chunk (split by newline)', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const messageChunks: string[] = [];
      client.onMessageChunk((chunk) => messageChunks.push(chunk));

      const initPromise = client.initialize({});

      setImmediate(() => {
        // Send init response
        const initResponse: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        };

        // Send multiple notifications in one chunk
        const notif1: types.JsonRpcNotification = {
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'sess-1',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'Hello' },
            },
          },
        };

        const notif2: types.JsonRpcNotification = {
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 'sess-1',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: ' world' },
            },
          },
        };

        const combined = JSON.stringify(initResponse) + '\n' +
                        JSON.stringify(notif1) + '\n' +
                        JSON.stringify(notif2) + '\n';
        fakeProcess.stdout.emit('data', Buffer.from(combined));
      });

      await initPromise;
      expect(messageChunks).toEqual(['Hello', ' world']);
    });

    it('handles partial messages split across data chunks', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        };

        const fullMessage = JSON.stringify(response) + '\n';
        const midpoint = Math.floor(fullMessage.length / 2);

        // Send first half
        fakeProcess.stdout.emit('data', Buffer.from(fullMessage.slice(0, midpoint)));
        
        // Send second half after a delay
        setTimeout(() => {
          fakeProcess.stdout.emit('data', Buffer.from(fullMessage.slice(midpoint)));
        }, 10);
      });

      const result = await initPromise;
      expect(result.agentInfo.name).toBe('Test');
    });

    it('ignores empty lines', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        };

        // Send with empty lines interspersed
        const data = '\n\n' + JSON.stringify(response) + '\n\n\n';
        fakeProcess.stdout.emit('data', Buffer.from(data));
      });

      const result = await initPromise;
      expect(result.agentInfo.name).toBe('Test');
    });

    it('handles malformed JSON gracefully (emits error, does not crash)', () => {
      const client = new AcpClient(handler, mockOutputChannel);

      // Send malformed JSON - should not crash
      expect(() => {
        fakeProcess.stdout.emit('data', Buffer.from('{ invalid json }\n'));
      }).not.toThrow();
    });
  });

  describe('Request/Response tracking', () => {
    it('sends JSON-RPC request with incrementing IDs', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      // Start initialization
      const initPromise = client.initialize({});
      expect(fakeProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"id":1')
      );

      // Resolve init
      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        };
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });

      await initPromise;

      // Send another request
      const sessionPromise = client.createSession('/test/path');
      expect(fakeProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('"id":2')
      );

      // Resolve session
      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 2,
          result: {
            sessionId: 'sess-123',
            models: { availableModels: [], currentModelId: 'claude-sonnet-4.6' },
            modes: { availableModes: [], currentModeId: 'agent' },
          },
        };
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });

      await sessionPromise;
    });

    it('resolves pending promise when matching response arrives', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      const response: types.JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: 1,
          agentCapabilities: {},
          agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
          authMethods: [],
        },
      };

      fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));

      const result = await initPromise;
      expect(result.agentInfo.name).toBe('Test');
    });

    it('rejects pending promise on error response', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      const errorResponse: types.JsonRpcResponse = {
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32600,
          message: 'Invalid request',
        },
      };

      fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(errorResponse) + '\n'));

      await expect(initPromise).rejects.toThrow('Invalid request');
    });
  });

  describe('Notification routing', () => {
    it('routes session/update with agent_message_chunk event', () => {
      const client = new AcpClient(handler, mockOutputChannel);

      const notification: types.JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hello!' },
          },
        },
      };

      // Should process without throwing
      expect(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(notification) + '\n'));
      }).not.toThrow();
    });

    it('routes session/update with agent_thought_chunk event', () => {
      const client = new AcpClient(handler, mockOutputChannel);

      const notification: types.JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'Thinking...' },
          },
        },
      };

      expect(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(notification) + '\n'));
      }).not.toThrow();
    });

    it('routes session/update with tool_call event', () => {
      const client = new AcpClient(handler, mockOutputChannel);

      const notification: types.JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'tool_call',
            toolCall: {
              id: 'tool-1',
              name: 'read_file',
              arguments: { path: '/test.txt' },
            },
          },
        },
      };

      expect(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(notification) + '\n'));
      }).not.toThrow();
    });

    it('routes session/update with tool_call_update event', () => {
      const client = new AcpClient(handler, mockOutputChannel);

      const notification: types.JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'session/update',
        params: {
          sessionId: 'sess-1',
          update: {
            sessionUpdate: 'tool_call_update',
            toolCallId: 'tool-1',
            update: {
              type: 'complete',
              result: { success: true },
            },
          },
        },
      };

      expect(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(notification) + '\n'));
      }).not.toThrow();
    });
  });

  describe('Agent→Client requests', () => {
    it('routes fs/read_text_file to handler.onReadTextFile', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      // Complete initialization first
      const initPromise = client.initialize({});
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        }) + '\n'));
      });
      await initPromise;

      const request: types.JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'agent-req-1',
        method: 'fs/read_text_file',
        params: { path: '/test.txt' },
      };

      fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(request) + '\n'));

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(handler.onReadTextFile).toHaveBeenCalledWith({ path: '/test.txt' });
    });

    it('routes session/request_permission to handler.onPermissionRequest', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      // Complete initialization first
      const initPromise = client.initialize({});
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        }) + '\n'));
      });
      await initPromise;

      const request: types.JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'agent-req-2',
        method: 'session/request_permission',
        params: {
          sessionId: 'sess-1',
          action: 'execute_command',
          details: { command: 'ls' },
        },
      };

      fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(request) + '\n'));

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(handler.onPermissionRequest).toHaveBeenCalledWith({
        sessionId: 'sess-1',
        action: 'execute_command',
        details: { command: 'ls' },
      });
    });

    it('sends response back to agent with matching ID', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      // Complete initialization first
      const initPromise = client.initialize({});
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        }) + '\n'));
      });
      await initPromise;

      const request: types.JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'agent-req-3',
        method: 'fs/read_text_file',
        params: { path: '/test.txt' },
      };

      fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(request) + '\n'));

      await new Promise(resolve => setTimeout(resolve, 50));

      // Check that response was sent
      const writeCalls = fakeProcess.stdin.write.mock.calls;
      const responseCall = writeCalls.find((call: any) => 
        call[0].includes('"id":"agent-req-3"')
      );
      expect(responseCall).toBeDefined();
      expect(responseCall![0]).toContain('"result"');
    });
  });

  describe('Lifecycle', () => {
    it('initialize() sends correct JSON-RPC message', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({ fs: { readTextFile: true } });

      const writeCall = fakeProcess.stdin.write.mock.calls[0][0] as string;
      const message = JSON.parse(writeCall.trim());

      expect(message).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: true } },
        },
      });

      // Resolve to avoid hanging
      setImmediate(() => {
        const response: types.JsonRpcResponse = {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        };
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify(response) + '\n'));
      });

      await initPromise;
    });

    it('createSession() sends session/new with cwd', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      const initPromise = client.initialize({});
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        }) + '\n'));
      });
      await initPromise;

      const sessionPromise = client.createSession('/test/cwd');

      const writeCall = fakeProcess.stdin.write.mock.calls.find((call: any) =>
        call[0].includes('session/new')
      )![0] as string;
      const message = JSON.parse(writeCall.trim());

      expect(message).toMatchObject({
        jsonrpc: '2.0',
        method: 'session/new',
        params: {
          cwd: '/test/cwd',
          mcpServers: [],
        },
      });

      // Resolve
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            sessionId: 'sess-123',
            models: { availableModels: [], currentModelId: 'claude-sonnet-4.6' },
            modes: { availableModes: [], currentModeId: 'agent' },
          },
        }) + '\n'));
      });

      await sessionPromise;
    });

    it('prompt() sends session/prompt with sessionId and text', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      
      const initPromise = client.initialize({});
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: 1,
            agentCapabilities: {},
            agentInfo: { name: 'Test', title: 'Test', version: '1.0.0' },
            authMethods: [],
          },
        }) + '\n'));
      });
      await initPromise;

      const promptPromise = client.prompt('sess-123', 'Hello agent');

      const writeCall = fakeProcess.stdin.write.mock.calls.find((call: any) =>
        call[0].includes('session/prompt')
      )![0] as string;
      const message = JSON.parse(writeCall.trim());

      expect(message).toMatchObject({
        jsonrpc: '2.0',
        method: 'session/prompt',
        params: {
          sessionId: 'sess-123',
          prompt: [{ type: 'text', text: 'Hello agent' }],
        },
      });

      // Resolve
      setImmediate(() => {
        fakeProcess.stdout.emit('data', Buffer.from(JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { stopReason: 'end_turn' },
        }) + '\n'));
      });

      await promptPromise;
    });

    it('dispose() kills child process and rejects pending requests', async () => {
      const client = new AcpClient(handler, mockOutputChannel);
      const initPromise = client.initialize({});

      client.dispose();

      expect(fakeProcess.kill).toHaveBeenCalled();
      await expect(initPromise).rejects.toThrow('ACP client disposed');
    });
  });
});
