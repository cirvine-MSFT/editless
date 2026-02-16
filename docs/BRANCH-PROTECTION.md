# Branch Protection Rules

## Overview

The `master` branch is protected to ensure code quality and prevent accidental breakage. All changes must pass CI before merging.

## Active Protections

| Rule | Setting | Description |
|------|---------|-------------|
| Required status checks | `Lint, Build & Test`, `VS Code Integration Tests`, `scan` | These CI jobs must pass before merging |
| Strict status checks | `true` | Branch must be up to date with `master` before merging |
| Enforce admins | `false` | Admins can bypass protection for emergency hotfixes |
| Required reviews | `null` | PR reviews are not enforced by branch protection |
| Required signatures | `false` | Not required — agents cannot sign commits |
| Required linear history | `false` | Not needed — squash merges keep history clean |
| Lock branch | `false` | Branch accepts pushes normally |
| Allow force pushes | `false` | Force pushes to master are blocked |
| Restrictions | `null` | No push restrictions beyond the above rules |

## Running the Setup Script

The branch protection rules are configured via the GitHub API using the `gh` CLI.

```bash
bash scripts/setup-branch-protection.sh
```

### Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated
- Admin access to the `cirvine-MSFT/editless` repository

## Emergency Hotfixes

Since `enforce_admins` is set to `false`, repository admins can push directly to `master` or merge without passing status checks in emergency situations. This should be used sparingly and only when:

1. A critical bug in production needs an immediate fix
2. CI infrastructure is down and a time-sensitive change is needed

After an emergency hotfix, open a follow-up PR to ensure the change is reviewed.
