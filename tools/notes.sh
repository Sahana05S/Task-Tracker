#!/usr/bin/env bash
# Sync the private planning notes with the private repo Sahana05S/taskpulse-notes.
#
# docs/plans/ and reference/ are gitignored here (this repository is public).
# The notes repo keeps them at the same paths: its git data lives in .notes.git
# and its work tree is this checkout, so nothing moves.
#
#   bash tools/notes.sh pull            first run clones, later runs fast-forward
#   bash tools/notes.sh push "message"  commit docs/plans and reference, then push
#   bash tools/notes.sh status          changed note files
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
url="${TASKPULSE_NOTES_URL:-https://github.com/Sahana05S/taskpulse-notes.git}"
notes() { git --git-dir="$root/.notes.git" --work-tree="$root" "$@"; }

case "${1:-pull}" in
  pull)
    if [ ! -d .notes.git ]; then
      git clone --quiet --bare "$url" .notes.git
      notes config core.bare false
      notes config status.showUntrackedFiles no
      notes config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
      notes fetch --quiet origin
      notes branch --quiet --set-upstream-to=origin/main main
      # Writes only files the notes repo tracks (docs/plans, reference).
      notes reset --quiet --hard HEAD
    else
      notes pull --quiet --ff-only origin main
    fi
    echo "Notes ready: docs/plans/ and reference/ ($(notes log -1 --format='%h %cs %s'))"
    ;;
  push)
    # The main repo's .gitignore ignores both folders, so new files need -f.
    notes add -A -f -- docs/plans reference \
      ':(exclude,glob)**/__pycache__/**' ':(exclude,glob)**/node_modules/**' ':(exclude,glob)**/*.pyc'
    if notes diff --cached --quiet; then
      echo "No note changes to commit."
    else
      notes commit --quiet -m "${2:-Update notes}"
    fi
    notes push --quiet origin main
    echo "Notes pushed: $(notes log -1 --format='%h %s')"
    ;;
  status)
    notes status --short -- docs/plans reference
    ;;
  *)
    echo "usage: bash tools/notes.sh [pull|push \"message\"|status]" >&2
    exit 2
    ;;
esac
