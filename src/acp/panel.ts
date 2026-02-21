import * as vscode from 'vscode';

/**
 * ACP Panel — Interactive webview chat UI for ACP sessions.
 * 
 * Provides a clean, modern chat interface for Agent Communication Protocol sessions.
 * This is a pure view layer that emits events for user input and receives messages
 * from the extension to render conversation turns, tool calls, and status updates.
 */
export class AcpPanel implements vscode.Disposable {
  private static currentPanel: AcpPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _onDidReceiveMessageEmitter = new vscode.EventEmitter<unknown>();

  public readonly onDidReceiveMessage: vscode.Event<unknown> = this._onDidReceiveMessageEmitter.event;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.webview.html = this.getHtmlContent();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      message => {
        this._onDidReceiveMessageEmitter.fire(message);
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri): AcpPanel {
    if (AcpPanel.currentPanel) {
      AcpPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      return AcpPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'editless.acpChat',
      'Copilot (ACP)',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    AcpPanel.currentPanel = new AcpPanel(panel, extensionUri);
    return AcpPanel.currentPanel;
  }

  public postMessage(message: unknown): Thenable<boolean> {
    return this._panel.webview.postMessage(message);
  }

  public dispose(): void {
    AcpPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }

    this._onDidReceiveMessageEmitter.dispose();
  }

  private getHtmlContent(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Copilot (ACP)</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #status-bar {
      padding: 8px 16px;
      background-color: var(--vscode-statusBar-background);
      color: var(--vscode-statusBar-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #status-bar.connecting::before {
      content: '⏳';
    }

    #status-bar.ready::before {
      content: '✓';
      color: var(--vscode-testing-iconPassed);
    }

    #status-bar.thinking::before {
      content: '💭';
    }

    #status-bar.streaming::before {
      content: '▶';
    }

    #status-bar.error::before {
      content: '⚠';
      color: var(--vscode-errorForeground);
    }

    #toolbar {
      padding: 6px 16px;
      background-color: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      flex-wrap: wrap;
    }

    #toolbar label {
      opacity: 0.7;
    }

    #toolbar select {
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 2px;
      padding: 2px 4px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
      outline: none;
    }

    #toolbar select:focus {
      border-color: var(--vscode-focusBorder);
    }

    #agent-name {
      margin-left: auto;
      opacity: 0.6;
      font-style: italic;
    }

    .message.queued {
      align-self: flex-end;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      opacity: 0.55;
      position: relative;
    }

    .message.queued::after {
      content: '⏳ queued';
      display: block;
      font-size: 10px;
      opacity: 0.7;
      margin-top: 4px;
      text-align: right;
    }

    #conversation {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 8px;
      line-height: 1.5;
    }

    .message.user {
      align-self: flex-end;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .message.assistant {
      align-self: flex-start;
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
    }

    .message.assistant pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .message.assistant code {
      font-family: var(--vscode-editor-font-family);
      font-size: 0.9em;
    }

    .tool-call {
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 8px 12px;
      margin: 4px 0;
      cursor: pointer;
      user-select: none;
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .tool-call-name {
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-symbolIcon-functionForeground);
    }

    .tool-call-status {
      margin-left: auto;
      font-size: 11px;
      opacity: 0.7;
    }

    .tool-call.collapsed .tool-call-details {
      display: none;
    }

    .tool-call-details {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 12px;
      opacity: 0.8;
    }

    .thought {
      align-self: flex-start;
      font-style: italic;
      opacity: 0.6;
      font-size: 0.9em;
      padding: 8px 12px;
      max-width: 80%;
    }

    #input-area {
      border-top: 1px solid var(--vscode-panel-border);
      padding: 12px 16px;
      background-color: var(--vscode-editor-background);
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    #input-box {
      flex: 1;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: none;
      min-height: 36px;
      max-height: 200px;
      outline: none;
    }

    #input-box:focus {
      border-color: var(--vscode-focusBorder);
    }

    #send-button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      min-width: 60px;
    }

    #send-button:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }

    #send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .error-message {
      background-color: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-errorForeground);
      padding: 12px 16px;
      border-radius: 6px;
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div id="status-bar" class="connecting">Connecting...</div>
  <div id="toolbar">
    <label for="model-select">Model:</label>
    <select id="model-select" disabled><option>loading…</option></select>
    <label for="mode-select">Mode:</label>
    <select id="mode-select" disabled><option>loading…</option></select>
    <span id="agent-name"></span>
  </div>
  <div id="conversation"></div>
  <div id="input-area">
    <textarea id="input-box" placeholder="Type a message..." rows="1"></textarea>
    <button id="send-button">Send</button>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      const conversation = document.getElementById('conversation');
      const inputBox = document.getElementById('input-box');
      const sendButton = document.getElementById('send-button');
      const statusBar = document.getElementById('status-bar');
      const modelSelect = document.getElementById('model-select');
      const modeSelect = document.getElementById('mode-select');
      const agentName = document.getElementById('agent-name');

      let currentAssistantMessage = null;
      let isPrompting = false;
      const messageQueue = [];

      // --- Toolbar events ---
      modelSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'changeModel', modelId: modelSelect.value });
      });
      modeSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'changeMode', modeId: modeSelect.value });
      });

      // Auto-resize textarea
      inputBox.addEventListener('input', () => {
        inputBox.style.height = 'auto';
        inputBox.style.height = inputBox.scrollHeight + 'px';
      });

      // Send message on button click
      sendButton.addEventListener('click', sendMessage);

      // Send on Enter, newline on Shift+Enter
      inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      function sendMessage() {
        const text = inputBox.value.trim();
        if (!text) return;

        inputBox.value = '';
        inputBox.style.height = 'auto';

        if (isPrompting) {
          // Queue message and show visual indicator
          messageQueue.push(text);
          const msg = document.createElement('div');
          msg.className = 'message queued';
          msg.dataset.queueIndex = String(messageQueue.length - 1);
          msg.textContent = text;
          conversation.appendChild(msg);
          scrollToBottom();
          return;
        }

        vscode.postMessage({ type: 'sendMessage', text });
      }

      function drainQueue() {
        if (messageQueue.length === 0) return;
        const next = messageQueue.shift();
        // Remove the first queued message indicator
        const queued = conversation.querySelector('.message.queued');
        if (queued) {
          queued.classList.remove('queued');
          queued.classList.add('user');
        }
        vscode.postMessage({ type: 'sendMessage', text: next });
      }

      window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
          case 'addUserMessage':
            addUserMessage(message.text);
            break;
          case 'startAssistantMessage':
            startAssistantMessage();
            break;
          case 'appendChunk':
            appendChunk(message.text);
            break;
          case 'endAssistantMessage':
            endAssistantMessage();
            break;
          case 'toolCall':
            addToolCall(message.name, message.status);
            break;
          case 'thoughtChunk':
            addThought(message.text);
            break;
          case 'setStatus':
            setStatus(message.status);
            break;
          case 'setModels':
            populateModels(message.models);
            break;
          case 'setModes':
            populateModes(message.modes);
            break;
          case 'updateMode':
            if (modeSelect) modeSelect.value = message.modeId;
            break;
          case 'setAgent':
            agentName.textContent = message.name ? ('Agent: ' + message.name) : '';
            break;
          case 'promptStarted':
            isPrompting = true;
            break;
          case 'promptFinished':
            isPrompting = false;
            drainQueue();
            break;
          case 'error':
            showError(message.message);
            break;
        }
      });

      function addUserMessage(text) {
        const msg = document.createElement('div');
        msg.className = 'message user';
        msg.textContent = text;
        conversation.appendChild(msg);
        scrollToBottom();
      }

      function startAssistantMessage() {
        currentAssistantMessage = document.createElement('div');
        currentAssistantMessage.className = 'message assistant';
        currentAssistantMessage.textContent = '';
        conversation.appendChild(currentAssistantMessage);
        scrollToBottom();
      }

      function appendChunk(text) {
        if (!currentAssistantMessage) {
          startAssistantMessage();
        }
        currentAssistantMessage.textContent += text;
        scrollToBottom();
      }

      function endAssistantMessage() {
        if (currentAssistantMessage) {
          // Process markdown-style code blocks
          const content = currentAssistantMessage.textContent;
          const formatted = formatMessage(content);
          currentAssistantMessage.innerHTML = formatted;
        }
        currentAssistantMessage = null;
        scrollToBottom();
      }

      function formatMessage(text) {
        // Simple markdown formatting: code blocks only
        let html = text;
        html = html.replace(/\\\`\\\`\\\`([\\s\\S]*?)\\\`\\\`\\\`/g, '<pre><code>$1</code></pre>');
        html = html.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
        // Escape HTML in non-code parts (basic protection)
        const parts = html.split(/(<pre>.*?<\\/pre>|<code>.*?<\\/code>)/);
        html = parts.map((part, i) => {
          if (part.startsWith('<pre>') || part.startsWith('<code>')) {
            return part;
          }
          return escapeHtml(part);
        }).join('');
        return html;
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function addToolCall(name, status) {
        const toolCall = document.createElement('div');
        toolCall.className = 'tool-call collapsed';
        toolCall.innerHTML = '<div class="tool-call-header">' +
          '<span class="tool-call-name">' + escapeHtml(name) + '</span>' +
          '<span class="tool-call-status">' + escapeHtml(status) + '</span>' +
          '</div>' +
          '<div class="tool-call-details">Tool call: ' + escapeHtml(name) + '</div>';
        toolCall.addEventListener('click', () => {
          toolCall.classList.toggle('collapsed');
        });
        conversation.appendChild(toolCall);
        scrollToBottom();
      }

      function addThought(text) {
        const thought = document.createElement('div');
        thought.className = 'thought';
        thought.textContent = text;
        conversation.appendChild(thought);
        scrollToBottom();
      }

      function setStatus(status) {
        statusBar.className = status.toLowerCase();
        statusBar.textContent = status;
      }

      function showError(message) {
        const error = document.createElement('div');
        error.className = 'error-message';
        error.textContent = '⚠ ' + message;
        conversation.appendChild(error);
        scrollToBottom();
      }

      function scrollToBottom() {
        conversation.scrollTop = conversation.scrollHeight;
      }

      function populateModels(models) {
        modelSelect.innerHTML = '';
        if (!models || !models.availableModels) return;
        for (const m of models.availableModels) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          if (m.id === models.currentModelId) opt.selected = true;
          modelSelect.appendChild(opt);
        }
        modelSelect.disabled = false;
      }

      function populateModes(modes) {
        modeSelect.innerHTML = '';
        if (!modes || !modes.availableModes) return;
        for (const m of modes.availableModes) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name || m.id;
          if (m.id === modes.currentModeId) opt.selected = true;
          modeSelect.appendChild(opt);
        }
        modeSelect.disabled = false;
      }
    })();
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
