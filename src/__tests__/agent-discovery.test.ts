import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverAgentsInWorkspace, discoverAgentsInCopilotDir, discoverAllAgents } from '../agent-discovery';

let tmpDir: string;

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-discovery-test-'));
}

function writeFixture(relPath: string, content: string): string {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function wsFolder(fsPath: string): { uri: { fsPath: string } } {
  return { uri: { fsPath } };
}

beforeEach(() => {
  tmpDir = makeTmp();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('discoverAgentsInWorkspace', () => {
  it('should discover .agent.md files in .github/agents/', () => {
    writeFixture('workspace/.github/agents/squad.agent.md', '# Squad Agent\n> Manages squads.\n');
    writeFixture('workspace/.github/agents/reviewer.agent.md', '# Code Reviewer\n> Reviews PRs.\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'workspace'))]);

    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toContain('squad');
    expect(result.map(a => a.id)).toContain('reviewer');
  });

  it('should discover .agent.md files at workspace root (1 level deep)', () => {
    writeFixture('workspace/my-helper.agent.md', '# My Helper\n> Helps with things.\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'workspace'))]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('my-helper');
    expect(result[0].name).toBe('My Helper');
  });

  it('should parse name from first heading', () => {
    writeFixture('ws/.github/agents/test.agent.md', '# Custom Agent Name\nSome content.\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].name).toBe('Custom Agent Name');
  });

  it('should fall back to filename when no heading exists', () => {
    writeFixture('ws/.github/agents/my-agent.agent.md', 'No heading here.\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].name).toBe('my-agent');
  });

  it('should parse description from blockquote', () => {
    writeFixture('ws/.github/agents/test.agent.md', '# Test\n> This is the description.\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].description).toBe('This is the description.');
  });

  it('should parse description from YAML frontmatter description field', () => {
    writeFixture('ws/.github/agents/test.agent.md', 'description: A YAML description\n# Test\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].description).toBe('A YAML description');
  });

  it('should prefer YAML description over blockquote', () => {
    writeFixture('ws/.github/agents/test.agent.md', 'description: From YAML\n# Test\n> From blockquote\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].description).toBe('From YAML');
  });

  it('should set source to workspace', () => {
    writeFixture('ws/.github/agents/test.agent.md', '# Test\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].source).toBe('workspace');
  });

  it('should generate kebab-case id from filename', () => {
    writeFixture('ws/.github/agents/MyAgent.agent.md', '# My Agent\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].id).toBe('my-agent');
  });

  it('should deduplicate agents with the same id across locations', () => {
    writeFixture('ws/.github/agents/test.agent.md', '# Test From Agents Dir\n');
    writeFixture('ws/test.agent.md', '# Test From Root\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    // .github/agents/ is scanned first, so it wins
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test From Agents Dir');
  });

  it('should handle multiple workspace folders', () => {
    writeFixture('ws1/.github/agents/alpha.agent.md', '# Alpha\n');
    writeFixture('ws2/.github/agents/beta.agent.md', '# Beta\n');

    const result = discoverAgentsInWorkspace([
      wsFolder(path.join(tmpDir, 'ws1')),
      wsFolder(path.join(tmpDir, 'ws2')),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map(a => a.name)).toContain('Alpha');
    expect(result.map(a => a.name)).toContain('Beta');
  });

  it('should return empty array when no agent files exist', () => {
    fs.mkdirSync(path.join(tmpDir, 'empty'), { recursive: true });

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'empty'))]);

    expect(result).toEqual([]);
  });

  it('should return empty array for empty workspace folders list', () => {
    const result = discoverAgentsInWorkspace([]);
    expect(result).toEqual([]);
  });

  it('should ignore non-.agent.md files', () => {
    writeFixture('ws/.github/agents/readme.md', '# Not an agent\n');
    writeFixture('ws/.github/agents/test.agent.md', '# Real Agent\n');
    writeFixture('ws/.github/agents/config.json', '{}');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Real Agent');
  });

  it('should store the correct filePath', () => {
    const written = writeFixture('ws/.github/agents/test.agent.md', '# Test\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    expect(result[0].filePath).toBe(written);
  });
});

describe('discoverAllAgents', () => {
  it('should combine workspace and copilot-dir results', () => {
    writeFixture('ws/.github/agents/ws-agent.agent.md', '# Workspace Agent\n');

    const result = discoverAllAgents([wsFolder(path.join(tmpDir, 'ws'))]);

    // At minimum we get the workspace agent; copilot-dir results depend on host
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.find(a => a.id === 'ws-agent')).toBeDefined();
  });
});

describe('discoverAgentsInCopilotDir', () => {
  let originalHome: string;

  beforeEach(() => {
    originalHome = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const fakeHome = path.join(tmpDir, 'fakehome');
    fs.mkdirSync(fakeHome, { recursive: true });
    // Override homedir for the module
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  });

  afterEach(() => {
    if (originalHome) {
      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalHome;
    }
  });

  it('should discover agents in ~/.copilot/agents/ subdirectory', () => {
    const fakeHome = process.env.HOME!;
    const agentsDir = path.join(fakeHome, '.copilot', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'foo.agent.md'), '# Foo Agent\n> Foo description\n', 'utf-8');

    const result = discoverAgentsInCopilotDir();

    expect(result.find(a => a.id === 'foo')).toBeDefined();
  });

  it('should discover agents in ~/.config/copilot/agents/ subdirectory', () => {
    const fakeHome = process.env.HOME!;
    const agentsDir = path.join(fakeHome, '.config', 'copilot', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'bar.agent.md'), '# Bar Agent\n> Bar description\n', 'utf-8');

    const result = discoverAgentsInCopilotDir();

    expect(result.find(a => a.id === 'bar')).toBeDefined();
  });
});
