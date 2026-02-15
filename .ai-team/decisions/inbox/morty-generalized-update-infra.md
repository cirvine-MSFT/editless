### Generalized provider update infrastructure

**By:** Morty (Extension Dev), issue #14
**What:** CLI update checking is now driven by optional fields on `CliProvider` (`updateCommand`, `upToDatePattern`, `updateRunCommand`). To add update support for a new CLI provider, populate these fields in `KNOWN_PROFILES` — no new code paths needed. The startup loop (`checkProviderUpdatesOnStartup`) iterates all detected providers with `updateCommand` set, and cache keys are scoped per-provider.
**Why:** Avoids duplicating update logic per CLI. When we discover how `copilot` or `claude` check for updates, we just add the fields to their profile entries.
