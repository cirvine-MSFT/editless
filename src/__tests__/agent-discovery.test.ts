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

  it('should discover agents in ~/.copilot/installed-plugins/ subdirectories', () => {
    const fakeHome = process.env.HOME!;
    const pluginDir = path.join(fakeHome, '.copilot', 'installed-plugins', 'dev-team');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'dev-team.agent.md'), '# Dev Team\n> A dev team agent\n', 'utf-8');

    const result = discoverAgentsInCopilotDir();

    const agent = result.find(a => a.id === 'dev-team');
    expect(agent).toBeDefined();
    expect(agent!.source).toBe('installed-plugin');
    expect(agent!.name).toBe('Dev Team');
    expect(agent!.description).toBe('A dev team agent');
  });

  it('should discover agents nested deeply inside installed-plugins/', () => {
    const fakeHome = process.env.HOME!;
    const nestedDir = path.join(fakeHome, '.copilot', 'installed-plugins', 'org', 'sub-plugin');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(nestedDir, 'nested.agent.md'), '# Nested Agent\n> Deep plugin\n', 'utf-8');

    const result = discoverAgentsInCopilotDir();

    const agent = result.find(a => a.id === 'nested');
    expect(agent).toBeDefined();
    expect(agent!.source).toBe('installed-plugin');
  });

  it('should return empty when installed-plugins/ directory does not exist', () => {
    const fakeHome = process.env.HOME!;
    // Ensure .copilot exists but installed-plugins/ does not
    fs.mkdirSync(path.join(fakeHome, '.copilot'), { recursive: true });

    const result = discoverAgentsInCopilotDir();

    const pluginAgents = result.filter(a => a.source === 'installed-plugin');
    expect(pluginAgents).toHaveLength(0);
  });

  it('should deduplicate installed-plugin agents with copilot-dir agents', () => {
    const fakeHome = process.env.HOME!;
    // Same agent ID in both agents/ and installed-plugins/
    const agentsDir = path.join(fakeHome, '.copilot', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'dupe.agent.md'), '# Dupe From Agents\n', 'utf-8');

    const pluginDir = path.join(fakeHome, '.copilot', 'installed-plugins', 'dupe-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'dupe.agent.md'), '# Dupe From Plugin\n', 'utf-8');

    const result = discoverAgentsInCopilotDir();

    const dupes = result.filter(a => a.id === 'dupe');
    expect(dupes).toHaveLength(1);
    // agents/ is scanned first, so copilot-dir wins
    expect(dupes[0].source).toBe('copilot-dir');
  });

  it('should discover installed-plugins inside a configDirOverride', () => {
    const customConfig = path.join(tmpDir, 'custom-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'my-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'custom.agent.md'), '# Custom Plugin\n> From config dir\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    const agent = result.find(a => a.id === 'custom');
    expect(agent).toBeDefined();
    expect(agent!.source).toBe('installed-plugin');
    expect(agent!.description).toBe('From config dir');
  });

  it('should scan configDirOverride agents/ AND installed-plugins/', () => {
    const customConfig = path.join(tmpDir, 'custom-config');
    const agentsDir = path.join(customConfig, 'agents');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'plugin-a');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'local.agent.md'), '# Local Agent\n', 'utf-8');
    fs.writeFileSync(path.join(pluginDir, 'plugin.agent.md'), '# Plugin Agent\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    expect(result.find(a => a.id === 'local' && a.source === 'copilot-dir')).toBeDefined();
    expect(result.find(a => a.id === 'plugin' && a.source === 'installed-plugin')).toBeDefined();
  });

  it('should skip symlinks in installed-plugins/ to prevent cycles', () => {
    const customConfig = path.join(tmpDir, 'symlink-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'real-plugin');
    const symlinkTarget = path.join(tmpDir, 'symlink-target');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(symlinkTarget, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'real.agent.md'), '# Real Agent\n', 'utf-8');
    fs.writeFileSync(path.join(symlinkTarget, 'ghost.agent.md'), '# Ghost Agent\n', 'utf-8');

    const symlinkPath = path.join(customConfig, 'installed-plugins', 'linked-plugin');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(symlinkTarget, symlinkPath, 'junction');
      symlinkCreated = true;
    } catch {
      // Symlinks may require elevated privileges on Windows — skip assertion
    }

    const result = discoverAgentsInCopilotDir(customConfig);

    expect(result.find(a => a.id === 'real')).toBeDefined();
    if (symlinkCreated) {
      expect(result.find(a => a.id === 'ghost')).toBeUndefined();
    }
  });

  it('should enforce max depth limit and ignore agents nested too deeply', () => {
    const customConfig = path.join(tmpDir, 'deep-config');
    // Build a 12-level deep directory inside installed-plugins/
    let deepDir = path.join(customConfig, 'installed-plugins');
    for (let i = 0; i < 12; i++) {
      deepDir = path.join(deepDir, `level-${i}`);
    }
    fs.mkdirSync(deepDir, { recursive: true });
    fs.writeFileSync(path.join(deepDir, 'too-deep.agent.md'), '# Too Deep\n', 'utf-8');

    // Also place an agent within the depth limit (level 2)
    const shallowDir = path.join(customConfig, 'installed-plugins', 'shallow-plugin');
    fs.mkdirSync(shallowDir, { recursive: true });
    fs.writeFileSync(path.join(shallowDir, 'shallow.agent.md'), '# Shallow Agent\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    expect(result.find(a => a.id === 'shallow')).toBeDefined();
    expect(result.find(a => a.id === 'too-deep')).toBeUndefined();
  });

  it('should discover agent files at installed-plugins/ root level', () => {
    const customConfig = path.join(tmpDir, 'root-level-config');
    const pluginsDir = path.join(customConfig, 'installed-plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(path.join(pluginsDir, 'root-agent.agent.md'), '# Root Agent\n> At root of installed-plugins\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    const agent = result.find(a => a.id === 'root-agent');
    expect(agent).toBeDefined();
    expect(agent!.source).toBe('installed-plugin');
  });
});
