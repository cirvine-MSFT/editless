import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditlessTreeProvider, EditlessTreeItem } from '../editless-tree';
import { ThemeIcon, ThemeColor } from 'vscode';

// Mock AgentSettingsManager
const mockAgentSettings = {
  get: vi.fn(),
  getAll: vi.fn(),
  isHidden: vi.fn(),
  getHiddenIds: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  showAll: vi.fn(),
  reload: vi.fn(),
  settingsPath: '/mock/settings.json',
};

// Mock dependencies
vi.mock('vscode', () => ({
  ThemeIcon: class {
    constructor(public readonly id: string, public readonly color?: ThemeColor) {}
  },
  ThemeColor: class {
    constructor(public readonly id: string) {}
  },
  TreeItem: class {
    constructor(public label: string, public collapsibleState?: number) {}
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  MarkdownString: class {
    constructor(public value: string) {}
  },
}));

describe('EditlessTreeProvider — Extra Visibility Tests', () => {
  let provider: EditlessTreeProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAgentSettings.isHidden.mockReturnValue(false);
    mockAgentSettings.getHiddenIds.mockReturnValue([]);
    // Cast to never to bypass strict typing of mock vs real
    provider = new EditlessTreeProvider(mockAgentSettings as never);
  });

  it('renders hidden agents with dimmed icon and (hidden) description inside group', () => {
    const hiddenId = 'squad-hidden';
    mockAgentSettings.isHidden.mockImplementation((id: string) => id === hiddenId);
    
    provider.setDiscoveredItems([
      { id: hiddenId, name: 'Hidden Squad', type: 'squad', source: 'workspace', path: '/path' }
    ]);

    const roots = provider.getChildren();
    // Hidden agents are inside a collapsible "Hidden" group
    const hiddenGroup = roots.find(r => r.type === 'category' && r.categoryKind === 'hidden');
    expect(hiddenGroup).toBeDefined();

    const hiddenChildren = provider.getChildren(hiddenGroup!);
    const hiddenItem = hiddenChildren.find(r => r.squadId === hiddenId);

    expect(hiddenItem).toBeDefined();
    expect(hiddenItem!.contextValue).toBe('squad-hidden');
    expect(hiddenItem!.description).toContain('(hidden)');
    
    // Check icon is dimmed
    const icon = hiddenItem!.iconPath as ThemeIcon;
    expect(icon).toBeInstanceOf(ThemeIcon);
    expect(icon.color).toBeInstanceOf(ThemeColor);
    expect((icon.color as ThemeColor).id).toBe('disabledForeground');
  });

  it('shows collapsible Hidden group instead of placeholder when all agents hidden', () => {
    mockAgentSettings.isHidden.mockReturnValue(true);
    mockAgentSettings.getHiddenIds.mockReturnValue(['squad-1']);

    provider.setDiscoveredItems([
      { id: 'squad-1', name: 'S1', type: 'squad', source: 'workspace', path: '/path' }
    ]);

    const roots = provider.getChildren();
    const placeholder = roots.find(r => typeof r.label === 'string' && r.label.includes('All agents hidden'));
    expect(placeholder).toBeUndefined();

    // Should have a collapsible "Hidden" group instead
    const hiddenGroup = roots.find(r => r.type === 'category' && r.categoryKind === 'hidden');
    expect(hiddenGroup).toBeDefined();
    expect(hiddenGroup!.label).toBe('Hidden (1)');
  });
});
