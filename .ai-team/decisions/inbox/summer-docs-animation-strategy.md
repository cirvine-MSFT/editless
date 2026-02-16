# Documentation Animation Strategy for EditLess

**Date:** 2026-02-16  
**Issue:** #43 — Visual workflow documentation with UI demos  
**Author:** Summer (Product Designer)

## Executive Summary

EditLess should use **optimized GIFs stored in the repo** with the following approach:

- **Primary Format:** GIF (universal, well-supported, no audio needed)
- **Recording Tool:** ScreenToGif (Windows, built-in editor, GIF + MP4 fallback)
- **Storage Location:** `docs/media/` directory in repo
- **Marketplace Strategy:** Relative paths in README for GitHub/Marketplace rendering
- **Maintainability:** Document re-recording triggers in PR templates; track UI change impact in code reviews

---

## Findings from Research

### What Popular Extensions Do

**GitLens, ErrorLens, Todo Tree, Thunder Client, REST Client:**
- All embed **GIF animations** directly in README.md via relative paths
- Store GIFs in dedicated folders: `/images`, `/media`, or `/assets`
- Reference them with standard Markdown: `![Description](media/demo.gif)`
- Both GitHub and VS Code Marketplace render these inline automatically
- No third-party CDN hosting—GIFs live in the repo for reliability

### VS Code Marketplace Constraints

- **File size guidance:** Under 1 MB per GIF (community best practice, not a hard limit)
- **Resolution:** Up to 800px width recommended (for mobile/web rendering)
- **Duration:** 3–8 seconds per demo (balances demonstration clarity vs. file size)
- **Frame rate:** 10–15 fps (smooth without bloating file size)
- **Format support:** GIF (best), animated WebP (lighter but less universal), MP4 (GitHub renders inline, VS Code Marketplace does NOT)
- **Hosting:** Relative paths in repo = reliable; external CDN = risk of link rot

---

## Recording Tool Comparison

### For EditLess (Windows-based, VS Code sidebar UI)

| Tool | Platform | Strengths | Weaknesses | Verdict |
|------|----------|-----------|-----------|---------|
| **ScreenToGif** | Windows | Built-in frame-by-frame editor, GIF + MP4 export, open-source, frequent updates | Windows-only | ✅ **PRIMARY** |
| LICEcap | Windows, macOS | Ultra-simple, lightweight | No editing, limited features | 🟡 Backup (too minimal for UI tweaks) |
| asciinema | Cross-platform | Terminal demos only | Not for GUI / sidebar UIs | 🔴 Not suitable |
| RecDev | Cross-platform | Interactive playback, code searchable | Overkill for simple demos, not free | 🔴 Overkill |

**Recommendation: ScreenToGif**
- Records directly to optimized GIF (or MP4 as fallback)
- Built-in timeline editor allows trimming, frame removal, speed adjustments to hit the <1 MB target
- Windows-native, zero dependencies
- Open-source, actively maintained

---

## Repository Structure

```
editless/
├── docs/
│   ├── media/                    # All demo animations
│   │   ├── planning-feature.gif  # Planning with agents flow
│   │   ├── review-prs.gif        # Reviewing PRs from work items
│   │   ├── switch-sessions.gif   # Switching tasks / terminal sessions
│   │   ├── manage-squad.gif      # Managing squad roster
│   │   └── vibe-loop.gif         # Full vibe coding loop
│   └── workflows/                # Existing workflow docs
├── README.md
└── package.json
```

---

## File Naming Convention

- **Descriptive, kebab-case:** `planning-feature.gif`, not `demo1.gif`
- **Reflects workflow:** Name = what the user learns, not the tool used
- **Consistency with code style:** Matches EditLess naming conventions

---

## Markdown Integration in Docs

Example (from new `docs/workflows.md` or similar):

```markdown
## Planning a Feature with Agents

With EditLess, you can see all your agents in one place and plan work collaboratively.

![Planning a feature: Click an agent, describe your task, and watch the conversation unfold](../media/planning-feature.gif)

1. Click the agent in the sidebar
2. Open a chat session
3. Describe the feature you want to build
4. Your agent creates work items and opens PRs — no context switching required

### Next: [Reviewing PRs from the Work Items View](...)
```

---

## Creation & Maintenance Workflow

### Initial Recording

1. Open ScreenToGif
2. Set recording region to capture sidebar + relevant VS Code area (recommended: 1280×720 or 1024×768)
3. Perform the workflow naturally (3–8 seconds)
4. Open built-in editor:
   - Remove excessive pauses (frame-by-frame)
   - Adjust FPS if needed to stay under 1 MB
   - Trim to essentials
5. Export as GIF (optimize for web)
6. Place in `docs/media/`
7. Add to README or workflow docs with descriptive alt text

### When to Re-record

**Trigger re-recording in these cases:**
- Tree view structure or hierarchy changes (e.g., item order, collapsing behavior)
- Command names or keyboard shortcuts change
- Button labels or icons change significantly
- Sidebar layout or panel positioning changes
- Workflow involves changed features

**Process:**
- Add a task to the related PR: "Update demo GIF for `[feature]` in `docs/media/`"
- Re-run ScreenToGif with the new UI
- Replace the old GIF (keep the same filename for doc consistency)
- Commit updated GIF + docs in the same PR

**Tracking:**
- In PR template, add checkbox: "❯ Did this change EditLess UI? If yes, update or create a demo GIF in `docs/media/`"
- In code review checklist: "Are demo GIFs outdated or missing for this feature?"

---

## Accessibility & Alt Text

Every GIF must have:
1. **Descriptive `![alt text]`** describing the workflow, not just "Demo"
2. Example: `![Planning a feature with agents: agent tree → chat session → create work items]`
3. This alt text appears in Marketplace listings, GitHub, and helps users with visual impairments understand the flow

---

## Recommended Workflows to Document (Issue #43)

1. **Planning a feature with agents** — Agent discovery → Chat → Issue creation
2. **Reviewing PRs from work items view** — Click PR → See linked issues → Approve/comment
3. **Switching tasks / terminal sessions** — Terminal list → Click session → Resume work
4. **Managing your squad roster** — Add squad → View agents → Manage skills/roles
5. **The full vibe coding loop** — Create work → Delegate to agent → Review PRs → Close issue

---

## Tools & Tooling

- **Recording:** ScreenToGif (free, open-source, Windows)
- **Optimization:** ScreenToGif's built-in editor (frame removal, FPS reduction)
- **Conversion (if needed):** ffmpeg CLI or online tools like ezgif.com
- **VS Code tools:** Markdown Preview (test rendering locally) + VS Code Marketplace preview (final check)

---

## Success Criteria

- [ ] All 5 core workflows documented with GIFs in `docs/media/`
- [ ] Each GIF < 1 MB, 800px width max, 3–8 seconds duration
- [ ] Descriptive alt text on every GIF
- [ ] Integration into docs (linking from main README)
- [ ] PR template includes UI change + demo GIF checklist
- [ ] Team agrees on re-recording triggers and workflow

---

## Next Steps

1. **Summer** creates `docs/workflows.md` with workflow descriptions and GIF placeholders
2. **Casey** (or delegate) records 5 core workflow GIFs using ScreenToGif
3. **Integrate GIFs** into workflow docs and main README
4. **Add re-recording checklist** to PR template
5. **Publish** before v0.1 release (per issue #43 deadline)
