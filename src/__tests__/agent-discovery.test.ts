import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  discoverAgentsInWorkspace,
  discoverAgentsInCopilotDir,
  discoverAllAgents,
  agencyResolver,
  registerResolver,
  type PluginManifest,
  type ManifestResolver,
} from '../agent-discovery';

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

  it('should skip unreadable agent file without crashing (#474)', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create a valid agent file
    writeFixture('ws/.github/agents/good.agent.md', '# Good Agent\n> Works fine.\n');
    
    // Create a file that will be unreadable (we'll delete it to simulate corruption)
    const badFile = writeFixture('ws/.github/agents/bad.agent.md', '# Bad Agent\n');
    
    // Another valid agent file to verify discovery continues
    writeFixture('ws/.github/agents/another.agent.md', '# Another Agent\n> Also works.\n');
    
    // Make the file unreadable by deleting it and creating a directory with the same name
    // This will cause fs.readFileSync to throw EISDIR error
    fs.unlinkSync(badFile);
    fs.mkdirSync(badFile);

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    // Should have discovered the two valid agents, skipped the bad one
    expect(result).toHaveLength(2);
    expect(result.map(a => a.id)).toContain('good');
    expect(result.map(a => a.id)).toContain('another');
    expect(result.map(a => a.id)).not.toContain('bad');

    // Should have logged a warning about the unreadable file
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[editless] Skipping unreadable agent file:',
      badFile
    );

    consoleWarnSpy.mockRestore();
  });

  it('should warn and skip duplicate agent ID from different files (#475)', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Create two files that will produce the same ID
    // .github/agents/ is scanned first, so it will be kept
    const keptPath = writeFixture('ws/.github/agents/helper.agent.md', '# Helper From Agents Dir\n');
    const skippedPath = writeFixture('ws/helper.agent.md', '# Helper From Root\n');

    const result = discoverAgentsInWorkspace([wsFolder(path.join(tmpDir, 'ws'))]);

    // Should only have one agent (the first one encountered)
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Helper From Agents Dir');
    expect(result[0].id).toBe('helper');

    // Should have logged a warning about the collision including both file paths
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[editless] Agent ID collision — skipping duplicate:',
      'helper',
      'from',
      skippedPath,
      '(keeping',
      keptPath + ')'
    );

    consoleWarnSpy.mockRestore();
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

  describe('ManifestResolver plugin discovery', () => {
    it('should discover entry-point agent from agency plugin with agency.json', () => {
      const customConfig = path.join(tmpDir, 'agency-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'agency-playground', 'dev-team');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      // Create agency.json
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'], category: 'developer-tools' }),
        'utf-8'
      );
      
      // Create entry-point agent matching plugin directory name
      fs.writeFileSync(
        path.join(agentsDir, 'dev-team.md'),
        '---\nname: dev-team\ndescription: Your AI development team\n---\n# Dev Team\nContent here.',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'dev-team');
      expect(agent).toBeDefined();
      expect(agent!.source).toBe('installed-plugin');
      expect(agent!.name).toBe('dev-team');
      expect(agent!.description).toBe('Your AI development team');
    });

    it('should parse name and description from YAML frontmatter in agency plugin', () => {
      const customConfig = path.join(tmpDir, 'agency-yaml-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'test-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(agentsDir, 'test-plugin.md'),
        '---\nname: Test Agent\ndescription: A test agent from frontmatter\n---\n# Test Content',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'test-plugin');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Test Agent');
      expect(agent!.description).toBe('A test agent from frontmatter');
    });

    it('should match entry-point by directory name when multiple agents exist', () => {
      const customConfig = path.join(tmpDir, 'multi-agent-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'squad-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      // Create multiple agents
      fs.writeFileSync(path.join(agentsDir, 'architect.md'), '---\nname: Architect\n---\nArchitect agent', 'utf-8');
      fs.writeFileSync(path.join(agentsDir, 'coder.md'), '---\nname: Coder\n---\nCoder agent', 'utf-8');
      fs.writeFileSync(path.join(agentsDir, 'squad-plugin.md'), '---\nname: Squad Entry\n---\nEntry point', 'utf-8');

      const result = discoverAgentsInCopilotDir(customConfig);

      // Should discover the entry-point agent (matches directory name)
      const entryAgent = result.find(a => a.id === 'squad-plugin');
      expect(entryAgent).toBeDefined();
      expect(entryAgent!.name).toBe('Squad Entry');
      
      // Note: Other agents in agents/ subdirectory may or may not be discovered
      // depending on implementation — this test only verifies the entry-point
    });

    it('should skip plugins without agency.json', () => {
      const customConfig = path.join(tmpDir, 'no-agency-json-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'regular-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      // No agency.json, but has agents/ subdirectory
      fs.writeFileSync(
        path.join(agentsDir, 'regular-plugin.md'),
        '---\nname: Regular\n---\nShould not be found by agency logic',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      // Should not discover via agency plugin logic
      // (may still be discovered by traditional *.agent.md recursive scan if named correctly)
      const agencyAgents = result.filter(a => 
        a.filePath.includes('agents') && 
        a.filePath.endsWith('.md') && 
        !a.filePath.endsWith('.agent.md')
      );
      expect(agencyAgents).toHaveLength(0);
    });

    it('should skip plugins with invalid/malformed agency.json', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const customConfig = path.join(tmpDir, 'bad-json-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'broken-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      // Write malformed JSON
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        '{engines: [copilot] this is not valid json',
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(agentsDir, 'broken-plugin.md'),
        '---\nname: Broken\n---\nShould not crash',
        'utf-8'
      );

      // Should not throw an error
      const result = discoverAgentsInCopilotDir(customConfig);

      // Should not discover the agent from the broken plugin
      const brokenAgents = result.filter(a => a.filePath.includes('broken-plugin'));
      expect(brokenAgents).toHaveLength(0);
      
      consoleWarnSpy.mockRestore();
    });

    it('should handle missing agents/ subdirectory in agency plugin', () => {
      const customConfig = path.join(tmpDir, 'no-agents-dir-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'no-agents-plugin');
      fs.mkdirSync(pluginDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      // No agents/ subdirectory created

      // Should not crash
      const result = discoverAgentsInCopilotDir(customConfig);

      const agents = result.filter(a => a.filePath.includes('no-agents-plugin'));
      expect(agents).toHaveLength(0);
    });

    it('should handle empty agents/ subdirectory in agency plugin', () => {
      const customConfig = path.join(tmpDir, 'empty-agents-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'empty-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      // Empty agents/ directory

      const result = discoverAgentsInCopilotDir(customConfig);

      const agents = result.filter(a => a.filePath.includes('empty-plugin'));
      expect(agents).toHaveLength(0);
    });

    it('should work with configDirOverride for agency plugins', () => {
      const customConfig = path.join(tmpDir, 'custom-agency-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'custom-agency');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(agentsDir, 'custom-agency.md'),
        '---\nname: Custom Agency\ndescription: From custom config dir\n---\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'custom-agency');
      expect(agent).toBeDefined();
      expect(agent!.source).toBe('installed-plugin');
      expect(agent!.description).toBe('From custom config dir');
    });

    it('should deduplicate agency plugin agents with existing *.agent.md agents', () => {
      const customConfig = path.join(tmpDir, 'dedup-agency-config');
      
      // Traditional .agent.md file in agents/
      const agentsDir = path.join(customConfig, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, 'dupe-agent.agent.md'),
        '# Dupe from traditional\n',
        'utf-8'
      );
      
      // Agency plugin with same ID
      const pluginDir = path.join(customConfig, 'installed-plugins', 'dupe-agent');
      const pluginAgentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(pluginAgentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(pluginAgentsDir, 'dupe-agent.md'),
        '---\nname: Dupe from agency\n---\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const dupes = result.filter(a => a.id === 'dupe-agent');
      expect(dupes).toHaveLength(1);
      // copilot-dir agents/ is scanned before installed-plugins, so traditional wins
      expect(dupes[0].name).toBe('Dupe from traditional');
      expect(dupes[0].source).toBe('copilot-dir');
    });

    it('should NOT include README.md or non-agents/ .md files as agents', () => {
      const customConfig = path.join(tmpDir, 'readme-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'doc-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      // README at plugin root
      fs.writeFileSync(
        path.join(pluginDir, 'README.md'),
        '# This is a README\nNot an agent',
        'utf-8'
      );
      
      // CHANGELOG at plugin root
      fs.writeFileSync(
        path.join(pluginDir, 'CHANGELOG.md'),
        '# Changelog\nNot an agent',
        'utf-8'
      );
      
      // Valid agent inside agents/
      fs.writeFileSync(
        path.join(agentsDir, 'doc-plugin.md'),
        '---\nname: Doc Plugin\n---\nReal agent',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const pluginAgents = result.filter(a => a.filePath.includes('doc-plugin'));
      
      // Should only discover the one agent from agents/ subdirectory
      expect(pluginAgents).toHaveLength(1);
      expect(pluginAgents[0].name).toBe('Doc Plugin');
      
      // Should not discover README or CHANGELOG
      expect(result.find(a => a.filePath.includes('README.md'))).toBeUndefined();
      expect(result.find(a => a.filePath.includes('CHANGELOG.md'))).toBeUndefined();
    });

    it('should handle nested marketplace directories', () => {
      const customConfig = path.join(tmpDir, 'nested-marketplace-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'marketplace-name', 'plugin-name');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      // agency.json at the plugin-name level
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'], category: 'utility' }),
        'utf-8'
      );
      
      fs.writeFileSync(
        path.join(agentsDir, 'plugin-name.md'),
        '---\nname: Nested Plugin\ndescription: From nested structure\n---\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'plugin-name');
      expect(agent).toBeDefined();
      expect(agent!.source).toBe('installed-plugin');
      expect(agent!.name).toBe('Nested Plugin');
      expect(agent!.description).toBe('From nested structure');
    });

    it('resolver-claimed directory is NOT double-discovered by recursive scan', () => {
      const customConfig = path.join(tmpDir, 'no-double-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'agency-playground', 'my-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });

      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );

      // The entry-point agent — resolver will find this via agency.json
      fs.writeFileSync(
        path.join(agentsDir, 'my-plugin.md'),
        '---\nname: My Plugin\ndescription: Found by resolver\n---\n',
        'utf-8'
      );

      // An *.agent.md in the same plugin dir — would be found by recursive scan
      fs.writeFileSync(
        path.join(pluginDir, 'my-plugin.agent.md'),
        '# My Plugin\n> Would be a dupe if recursive scan ran over claimed dirs\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      // There should be exactly ONE agent with id 'my-plugin' — no duplicates
      const matches = result.filter(a => a.id === 'my-plugin');
      expect(matches).toHaveLength(1);
      // The resolver path should be the one that won (it runs first)
      expect(matches[0].resolverSource).toBe('agency');
    });

    it('resolver is the PRIMARY discovery path — metadata flows through', () => {
      const customConfig = path.join(tmpDir, 'primary-resolver-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'test-marketplace', 'meta-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });

      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'], category: 'productivity' }),
        'utf-8'
      );

      fs.writeFileSync(
        path.join(agentsDir, 'meta-plugin.md'),
        '---\nname: Meta Plugin\ndescription: Resolver metadata test\n---\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'meta-plugin');
      expect(agent).toBeDefined();
      expect(agent!.resolverSource).toBe('agency');
      expect(agent!.marketplace).toBe('test-marketplace');
    });

    it('recursive scan still discovers *.agent.md in directories NOT claimed by a resolver', () => {
      const customConfig = path.join(tmpDir, 'mixed-config');
      // An agency plugin (has agency.json — resolver claims it)
      const agencyDir = path.join(customConfig, 'installed-plugins', 'claimed-plugin');
      const agencyAgentsDir = path.join(agencyDir, 'agents');
      fs.mkdirSync(agencyAgentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agencyDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      fs.writeFileSync(
        path.join(agencyAgentsDir, 'claimed-plugin.md'),
        '---\nname: Claimed\n---\n',
        'utf-8'
      );

      // A plain *.agent.md plugin (no agency.json — resolver skips, recursive scan finds it)
      const plainDir = path.join(customConfig, 'installed-plugins', 'plain-plugin');
      fs.mkdirSync(plainDir, { recursive: true });
      fs.writeFileSync(
        path.join(plainDir, 'plain.agent.md'),
        '# Plain Agent\n> Found by recursive scan\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      // Resolver-claimed agent has resolverSource
      const claimed = result.find(a => a.id === 'claimed-plugin');
      expect(claimed).toBeDefined();
      expect(claimed!.resolverSource).toBe('agency');

      // Plain agent discovered by fallback scan — no resolverSource
      const plain = result.find(a => a.id === 'plain');
      expect(plain).toBeDefined();
      expect(plain!.resolverSource).toBeUndefined();
      expect(plain!.source).toBe('installed-plugin');
    });

    it('agents without resolverSource or marketplace have undefined for those fields', () => {
      const customConfig = path.join(tmpDir, 'no-resolver-fields-config');
      const agentsDir = path.join(customConfig, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, 'plain.agent.md'),
        '# Plain\n> Traditional agent\n',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'plain');
      expect(agent).toBeDefined();
      expect(agent!.resolverSource).toBeUndefined();
      expect(agent!.marketplace).toBeUndefined();
    });

    it('should handle multiline YAML frontmatter description', () => {
      const customConfig = path.join(tmpDir, 'multiline-yaml-config');
      const pluginDir = path.join(customConfig, 'installed-plugins', 'multiline-plugin');
      const agentsDir = path.join(pluginDir, 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      
      fs.writeFileSync(
        path.join(pluginDir, 'agency.json'),
        JSON.stringify({ engines: ['copilot'] }),
        'utf-8'
      );
      
      // YAML with multiline description using >
      fs.writeFileSync(
        path.join(agentsDir, 'multiline-plugin.md'),
        '---\nname: Multiline Agent\ndescription: >\n  This is a multiline\n  description that spans\n  multiple lines\n---\n# Content',
        'utf-8'
      );

      const result = discoverAgentsInCopilotDir(customConfig);

      const agent = result.find(a => a.id === 'multiline-plugin');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Multiline Agent');
      // Note: Description parsing may vary based on YAML parser implementation
      // At minimum, should have some description value
      expect(agent!.description).toBeDefined();
      expect(agent!.description!.length).toBeGreaterThan(0);
    });
  });
});

describe('agencyResolver', () => {
  it('should implement ManifestResolver interface', () => {
    expect(agencyResolver.id).toBe('agency');
    expect(typeof agencyResolver.canResolve).toBe('function');
    expect(typeof agencyResolver.resolve).toBe('function');
  });

  it('canResolve returns true when agency.json exists', () => {
    const pluginDir = path.join(tmpDir, 'has-agency');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'agency.json'), '{}', 'utf-8');

    expect(agencyResolver.canResolve(pluginDir)).toBe(true);
  });

  it('canResolve returns false when agency.json is missing', () => {
    const pluginDir = path.join(tmpDir, 'no-agency');
    fs.mkdirSync(pluginDir, { recursive: true });

    expect(agencyResolver.canResolve(pluginDir)).toBe(false);
  });

  it('resolve returns PluginManifest with correct source field', () => {
    const pluginDir = path.join(tmpDir, 'source-test');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'], name: 'Source Test' }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'source-test.md'), '# Source\n', 'utf-8');

    const result = agencyResolver.resolve(pluginDir, 'my-marketplace');

    expect(result).not.toBeNull();
    expect(result!.source).toBe('agency');
    expect(result!.marketplace).toBe('my-marketplace');
    expect(result!.name).toBe('Source Test');
  });

  it('resolve returns null for non-copilot engines', () => {
    const pluginDir = path.join(tmpDir, 'wrong-engine');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['some-other-engine'] }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'wrong-engine.md'), '# Agent\n', 'utf-8');

    expect(agencyResolver.resolve(pluginDir, null)).toBeNull();
  });

  it('resolve stores category in metadata', () => {
    const pluginDir = path.join(tmpDir, 'category-test');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'], category: 'developer-tools' }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'category-test.md'), '# Agent\n', 'utf-8');

    const result = agencyResolver.resolve(pluginDir, null);

    expect(result).not.toBeNull();
    expect(result!.metadata).toEqual({ category: 'developer-tools' });
  });

  it('resolve defaults marketplace to "direct" when null', () => {
    const pluginDir = path.join(tmpDir, 'direct-test');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'] }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'direct-test.md'), '# Agent\n', 'utf-8');

    const result = agencyResolver.resolve(pluginDir, null);

    expect(result).not.toBeNull();
    expect(result!.marketplace).toBe('direct');
  });

  it('resolve returns null when agents/ directory is missing', () => {
    const pluginDir = path.join(tmpDir, 'no-agents-dir');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'] }),
      'utf-8'
    );

    expect(agencyResolver.resolve(pluginDir, null)).toBeNull();
  });

  it('resolve returns null when agents/ directory is empty', () => {
    const pluginDir = path.join(tmpDir, 'empty-agents');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'] }),
      'utf-8'
    );

    expect(agencyResolver.resolve(pluginDir, null)).toBeNull();
  });

  it('resolve returns null for malformed agency.json', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pluginDir = path.join(tmpDir, 'bad-json');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'agency.json'), 'NOT VALID JSON', 'utf-8');
    fs.writeFileSync(path.join(agentsDir, 'bad-json.md'), '# Agent\n', 'utf-8');

    expect(agencyResolver.resolve(pluginDir, null)).toBeNull();
    consoleWarnSpy.mockRestore();
  });
});

describe('registerResolver / resolver chain', () => {
  it('agency resolver is registered by default', () => {
    // Verify by creating a plugin with agency.json and discovering through public API
    const customConfig = path.join(tmpDir, 'default-resolver-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'default-test');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'] }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'default-test.md'), '# Default\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    expect(result.find(a => a.id === 'default-test')).toBeDefined();
  });

  it('first-match-wins: agency resolver handles agency.json directories', () => {
    // If we register a second resolver that also handles agency.json,
    // the agency resolver (registered first) should still win
    const secondResolver: ManifestResolver = {
      id: 'second',
      canResolve: (dir) => fs.existsSync(path.join(dir, 'agency.json')),
      resolve: (_dir, _mkt) => ({
        name: 'from-second-resolver',
        pluginDir: _dir,
        entryAgentPath: path.join(_dir, 'agents', 'test.md'),
        source: 'second',
      }),
    };
    registerResolver(secondResolver);

    const customConfig = path.join(tmpDir, 'first-wins-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'first-wins');
    const agentsDir = path.join(pluginDir, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'agency.json'),
      JSON.stringify({ engines: ['copilot'] }),
      'utf-8'
    );
    fs.writeFileSync(path.join(agentsDir, 'first-wins.md'), '# First Wins\n', 'utf-8');

    const result = discoverAgentsInCopilotDir(customConfig);

    // Agency resolver was registered first — it should win
    // The agent is discovered through the agency resolver path which calls readAndPushAgent
    const agent = result.find(a => a.id === 'first-wins');
    expect(agent).toBeDefined();
    expect(agent!.name).toBe('First Wins');
  });

  it('unknown format is skipped when no resolver matches', () => {
    const customConfig = path.join(tmpDir, 'unknown-format-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'unknown-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    // Create a plugin.json (not agency.json) — no resolver handles this
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({ format: 'github' }),
      'utf-8'
    );

    const result = discoverAgentsInCopilotDir(customConfig);

    // No resolver can handle plugin.json, so no agents discovered from this dir
    const unknownAgents = result.filter(a => a.filePath.includes('unknown-plugin'));
    expect(unknownAgents).toHaveLength(0);
  });

  it('custom resolver discovers plugins in its own format', () => {
    const customResolver: ManifestResolver = {
      id: 'custom-test',
      canResolve: (dir) => fs.existsSync(path.join(dir, 'custom-manifest.json')),
      resolve: (dir, marketplace) => {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'custom-manifest.json'), 'utf-8'));
          const agentFile = path.join(dir, manifest.entryPoint);
          if (!fs.existsSync(agentFile)) return null;
          return {
            name: manifest.name,
            pluginDir: dir,
            entryAgentPath: agentFile,
            source: 'custom-test',
            marketplace: marketplace || 'direct',
          };
        } catch {
          return null;
        }
      },
    };
    registerResolver(customResolver);

    const customConfig = path.join(tmpDir, 'custom-resolver-config');
    const pluginDir = path.join(customConfig, 'installed-plugins', 'custom-format-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'custom-manifest.json'),
      JSON.stringify({ name: 'Custom Format', entryPoint: 'main.agent.md' }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(pluginDir, 'main.agent.md'),
      '# Custom Format Agent\n> Discovered via custom resolver\n',
      'utf-8'
    );

    const result = discoverAgentsInCopilotDir(customConfig);

    // The agent should be discovered since our custom resolver can handle custom-manifest.json
    // Note: The .agent.md file will also be found by recursive scan, but dedup ensures single entry
    const agent = result.find(a => a.id === 'main');
    expect(agent).toBeDefined();
  });
});
