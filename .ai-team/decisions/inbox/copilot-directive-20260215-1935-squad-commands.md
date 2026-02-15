### 2026-02-15: Squad CLI commands — init vs upgrade
**By:** Casey Irvine (via Copilot)
**What:** Squad uses `squad init` for initial install (no `.ai-team/` exists yet) and `squad upgrade` for upgrading an existing squad. EditLess must be mindful of whether a squad has been initted or not and use the correct command.
**Why:** User request — captured for team memory

### 2026-02-15: Table agency install feature
**By:** Casey Irvine (via Copilot)
**What:** Do NOT offer to install Agency if it's not detected. Checking the Agency endpoint or exposing where Agency is available would leak first-party Microsoft information into this repo. Agency install/detection is out of scope for the internals release. Squad install (via npx) is fine to offer.
**Why:** User request — too much first-party Microsoft info to put into a public-facing repo
