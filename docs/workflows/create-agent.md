# Create a New Agent or Squad

Add an AI agent or squad to your EditLess workspace so you can launch sessions, delegate work, and manage everything from the sidebar.

<!-- TODO: Add GIF recording for this workflow -->

## Before You Start

EditLess **auto-discovers** agents in your workspace. If you've already set up a [Squad](https://github.com/bradygaster/squad) or placed agent files in `.squad/`, `.ai-team/`, `.github/agents/`, `.copilot/agents/`, or `~/.copilot/agents/`, they'll appear in the sidebar automatically — no manual steps needed.

This guide covers what happens when you click the **Add...** button to point EditLess at an agent or squad that isn't in a standard discovery location.

## Steps

1. **Open the Agents panel** in the EditLess sidebar.

2. **Click the `+` (Add...) button** in the panel header.

3. **Choose what to add:**
   - **Add Agent** — point to a single agent definition file (e.g., `C:\agents\my-agent.md`)
   - **Add Squad** — point to a squad directory that contains your team configuration

4. **Provide the path** when prompted. For agents, this is the path to the agent file. For squads, this is the directory containing the squad configuration (`.squad/` or `.ai-team/`).

5. **Your agent or squad appears** in the sidebar tree, ready to launch sessions.

**Note:** If you're adding an agent to a standard discovery location (like `~/.copilot/agents/` or your workspace's `.squad/` folder), you don't need to use the Add button — it will appear automatically.

## 📖 See Also

- [Create and Name a Session](create-session.md) — launch your first session with the new agent
- [Getting Started](../getting-started.md) — full onboarding guide

← [Back to Common Workflows](README.md)
