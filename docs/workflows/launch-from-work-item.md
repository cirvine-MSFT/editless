# Open a session from a work item

Launch a terminal session connected to a specific issue or task. The agent gets full context about what needs to be done.

## Steps

1. In the **Work Items** panel (left sidebar), find a GitHub issue or Azure DevOps work item you want to work on
2. Right-click the work item → **Launch with Agent**
3. Pick which agent should work on this item from the quick-pick menu
4. A new terminal session opens with the Copilot CLI
5. The agent has the work item context (issue number, title, description)
6. The session is automatically labeled with work item info (e.g., "PR #234", "Bug #89")

## Perfect for two workflows

**Planning:** "Tell me what you think about this issue" — great for initial analysis and breaking down work.

**Execution:** "Implement this feature" — the agent knows exactly what to build because it has the context.

## Work item context includes

- Issue or task title
- Description and labels
- Linked PRs and related items
- Your agent gets this automatically — no copy/paste needed

<!-- TODO: Add GIF recording for this workflow -->

---

💡 **Tip:** Start with planning — ask your agent to analyze and summarize the issue before diving into implementation. It's a great way to catch edge cases early.

📖 **See Also:**
- [Create a session and name it](create-session.md)
- [GitHub Workflow](github-workflow.md)
- [ADO Workflow](ado-workflow.md)

← [Back to Common Workflows](README.md)
