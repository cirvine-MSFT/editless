#!/usr/bin/env bash
# Sets up branch protection rules for the master branch.
# Run manually: bash scripts/setup-branch-protection.sh
# Requires: gh CLI authenticated with admin access

set -euo pipefail

REPO="cirvine-MSFT/editless"

echo "Setting branch protection on master..."
gh api -X PUT "repos/$REPO/branches/master/protection" \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint, Build & Test", "VS Code Integration Tests", "scan"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF

echo "✅ Branch protection configured for master"
echo "  - Required checks: Lint, Build & Test, VS Code Integration Tests, scan"
echo "  - Branch must be up to date before merge"
echo "  - gh pr merge --auto --squash will wait for these checks"
