#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_WORKTREE="${TEMP_WORKTREE:-/tmp/hiking-main-sync-publish}"
COMMIT_REF="${1:-HEAD}"

cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

COMMIT_HASH="$(git rev-parse "$COMMIT_REF")"

echo "Publishing commit $COMMIT_HASH"
echo "1/4 Push develop"
git push origin develop

echo "2/4 Prepare main worktree"
git fetch origin main
rm -rf "$TEMP_WORKTREE"
git worktree add "$TEMP_WORKTREE" origin/main

cleanup() {
  rm -rf "$TEMP_WORKTREE"
}

trap cleanup EXIT

echo "3/4 Cherry-pick to main"
if ! git -C "$TEMP_WORKTREE" cherry-pick "$COMMIT_HASH"; then
  echo "Cherry-pick failed. Temporary worktree left at: $TEMP_WORKTREE"
  trap - EXIT
  exit 1
fi

echo "4/4 Push main"
git -C "$TEMP_WORKTREE" push origin HEAD:main

echo "Done: develop and main are synced for $COMMIT_HASH"
