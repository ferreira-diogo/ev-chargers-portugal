#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---check}"
if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage: bash rollback-nap-availability-20260930.sh [--check|--apply]" >&2
  exit 2
fi

BACKUP_BRANCH="backup/nap-availability-20260930-1301"
BACKUP_COMMIT="4d6536b7cdd7d2cb2a8100fc465898cdb75b5ed4"
WORKFLOW=".github/workflows/refresh-nap-availability.yml"
SCRIPT="ev-charge-portugal-github-ready/scripts/refresh-nap-availability-kv.mjs"
TEST="ev-charge-portugal-github-ready/scripts/refresh-nap-availability-kv.test.mjs"
cd "$(git rev-parse --show-toplevel)"

if ! git cat-file -e "$BACKUP_COMMIT^{commit}" 2>/dev/null; then
  git fetch --no-tags origin "refs/heads/$BACKUP_BRANCH"
fi
git cat-file -e "$BACKUP_COMMIT:$WORKFLOW"
git cat-file -e "$BACKUP_COMMIT:$SCRIPT"
if [[ "$MODE" == "--check" ]]; then
  echo "Backup is available: $BACKUP_COMMIT"
  echo "Rollback restores only $WORKFLOW and $SCRIPT and removes $TEST."
  exit 0
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash existing tracked changes before applying the rollback." >&2
  exit 1
fi
git restore --source="$BACKUP_COMMIT" --staged --worktree -- "$WORKFLOW" "$SCRIPT"
if git ls-files --error-unmatch "$TEST" >/dev/null 2>&1; then
  git rm -- "$TEST"
fi
git diff --cached --stat
echo "Rollback staged locally. Review git diff --cached, then commit and push through the normal release process."
