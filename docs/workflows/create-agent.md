# Create a New Agent or Squad

Add an AI agent or squad to your EditLess workspace so you can launch sessions, delegate work, and manage everything from the sidebar.

<!-- TODO: Add GIF recording for this workflow -->

## Before You Start

EditLess **auto-discovers** agents in your workspace. If you've already set up a [Squad](https://github.com/bradygaster/squad) or placed agent files in `.github/agents/`, `.copilot/agents/`, or similar locations, they'll appear in the sidebar automatically — no manual steps needed.

This guide covers adding agents or squads that aren't auto-discovered, or adding them from a different location.

## Steps

1. **Open the Agents panel** in the EditLess sidebar.

2. **Click the `+` (Add...) button** in the panel header.

3. **Choose what to add:**
   - **Add Agent** — point to a single agent definition file (e.g., `.github/agents/my-agent.md`)
   - **Add Squad** — point to a squad directory that contains your team configuration

4. **Provide the path** when prompted. For agents, this is the path to the agent file. For squads, this is the directory containing the squad configuration.

5. **Your agent or squad appears** in the sidebar tree, ready to launch sessions.

## 💡 Tip

You can also right-click a discovered agent and select **Add to Registry** to promote it from auto-discovered to a permanent entry. This is useful when you want to ensure an agent always appears, even if the auto-discovery path changes.

## 📖 See Also

- [Create and Name a Session](create-session.md) — launch your first session with the new agent
- [Getting Started](../getting-started.md) — full onboarding guide

← [Back to Common Workflows](README.md)
