#!/usr/bin/env bash
# Create the GitHub repo (if missing) and apply the same restrictions as
# ralton-dev/url_utilities — general settings + "main-protection" ruleset.
#
# Idempotent: safe to re-run.
#
# Usage:
#   ./scripts/github-bootstrap.sh
#
# Requires:
#   - gh CLI authenticated as a user with admin access to ralton-dev
#   - jq

set -euo pipefail

OWNER="ralton-dev"
REPO="url_utilities_admin"
FULL="${OWNER}/${REPO}"
DESCRIPTION="Admin UI for the url-utilities URL shortener"

command -v gh >/dev/null || { echo "gh is not installed" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is not installed" >&2; exit 1; }

echo "==> 1. Ensure repo ${FULL} exists"
if gh repo view "${FULL}" >/dev/null 2>&1; then
  echo "    ${FULL} already exists"
else
  echo "    creating ${FULL} (public) and pushing the current branch"
  gh repo create "${FULL}" \
    --public \
    --description "${DESCRIPTION}" \
    --source . \
    --remote origin \
    --push
fi

echo "==> 2. Apply general repo settings (matches ralton-dev/url_utilities)"
gh api --method PATCH "repos/${FULL}" \
  -F has_issues=true \
  -F has_projects=true \
  -F has_wiki=false \
  -F allow_merge_commit=true \
  -F allow_squash_merge=true \
  -F allow_rebase_merge=true \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=false \
  -f squash_merge_commit_title=COMMIT_OR_PR_TITLE \
  -f squash_merge_commit_message=COMMIT_MESSAGES \
  >/dev/null

echo "==> 3. Install/update the 'main-protection' ruleset"
RULESET_PAYLOAD=$(cat <<'JSON'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge", "squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Lint, typecheck, build" }
        ]
      }
    }
  ],
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ]
}
JSON
)

EXISTING_ID=$(gh api "repos/${FULL}/rulesets" --jq '.[] | select(.name == "main-protection") | .id' 2>/dev/null || echo "")

if [ -z "${EXISTING_ID}" ]; then
  echo "    creating 'main-protection'"
  echo "${RULESET_PAYLOAD}" | gh api --method POST "repos/${FULL}/rulesets" --input - >/dev/null
else
  echo "    updating 'main-protection' (ruleset ${EXISTING_ID})"
  echo "${RULESET_PAYLOAD}" | gh api --method PUT "repos/${FULL}/rulesets/${EXISTING_ID}" --input - >/dev/null
fi

echo "==> Done."
echo ""
echo "Verify:"
echo "  gh api repos/${FULL}/rulesets"
echo "  gh repo view ${FULL} --json hasIssuesEnabled,hasProjectsEnabled,hasWikiEnabled,mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed"
