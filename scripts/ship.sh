#!/bin/bash
# Commits, pushes, opens and merges pull requests the way this repository expects:
# Conventional Commits in English, and no co-author or "generated with" trailers anywhere,
# including the squash commit GitHub writes on merge.
#
# Usage:
#   scripts/ship.sh setup                        Turn on the commit-msg hook that checks every commit
#   scripts/ship.sh branch <name>                Update main and start a branch from it
#   scripts/ship.sh commit <subject> [body-file] Commit what is staged ("-" reads the body from stdin)
#   scripts/ship.sh push [--force]               Push the current branch (--force uses --force-with-lease)
#   scripts/ship.sh pr [body-file]               Open a pull request titled after the branch's first commit
#   scripts/ship.sh merge <number>               Squash-merge once checks pass, then update main
#   scripts/ship.sh check <message-file>         Check a commit message (used by the hook)
#
# A subject looks like `feat(linear): read every page of the cycle's issues`: a type, an optional
# scope, and a lowercase summary in English, 72 characters at most.
set -euo pipefail
cd "$(dirname "$0")/.."

TYPES="feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
SUBJECT_PATTERN="^($TYPES)(\([a-z0-9-]+\))?!?: [a-z0-9].*[^.]$"
# Lines that must never appear: co-author trailers and tool attribution.
FORBIDDEN_PATTERN="^co-authored-by:|generated with \[?claude|noreply@anthropic\.com"

fail() {
  echo "ship: $*" >&2
  exit 1
}

check_subject() {
  local subject="$1"
  [[ "$subject" =~ $SUBJECT_PATTERN ]] ||
    fail "\"$subject\" is not a Conventional Commit subject, e.g. \"fix(linear): read every page\" (types: ${TYPES//|/, })"
  [ "${#subject}" -le 72 ] || fail "the subject has ${#subject} characters; keep it to 72"
  # Letters outside ASCII usually mean the subject isn't in English.
  if LC_ALL=C grep -q '[^ -~]' <<<"$subject"; then
    fail "write the subject in English, without accented letters: \"$subject\""
  fi
}

check_text() {
  if grep -Eiq "$FORBIDDEN_PATTERN" <<<"$1"; then
    fail "remove the co-author or attribution lines: $(grep -Ei "$FORBIDDEN_PATTERN" <<<"$1" | head -1)"
  fi
}

# Drops co-author lines from text GitHub would otherwise copy into the squash commit.
strip_trailers() {
  grep -Eiv "$FORBIDDEN_PATTERN" || true
}

current_branch() {
  git rev-parse --abbrev-ref HEAD
}

require_feature_branch() {
  local branch
  branch="$(current_branch)"
  [ "$branch" != "main" ] || fail "main is protected; start a branch with: scripts/ship.sh branch <name>"
}

command="${1:-}"
shift || true

case "$command" in
  setup)
    git config core.hooksPath .githooks
    echo "Commit messages are now checked by .githooks/commit-msg."
    ;;

  branch)
    name="${1:?usage: scripts/ship.sh branch <name>}"
    git switch main
    git pull --ff-only
    git switch -c "$name"
    ;;

  commit)
    subject="${1:?usage: scripts/ship.sh commit <subject> [body-file]}"
    body_file="${2:-}"
    require_feature_branch
    git diff --cached --quiet && fail "nothing is staged; use git add first"
    message="$subject"
    if [ -n "$body_file" ]; then
      body="$(if [ "$body_file" = "-" ]; then cat; else cat "$body_file"; fi)"
      message="$subject"$'\n\n'"$body"
    fi
    check_subject "$subject"
    check_text "$message"
    git commit --cleanup=strip -F - <<<"$message"
    ;;

  push)
    require_feature_branch
    if [ "${1:-}" = "--force" ]; then
      git push --force-with-lease -u origin HEAD
    else
      git push -u origin HEAD
    fi
    ;;

  pr)
    require_feature_branch
    body_file="${1:-}"
    first="$(git log --reverse --format=%H main..HEAD | head -1)"
    [ -n "$first" ] || fail "this branch has no commits ahead of main"
    title="$(git log -1 --format=%s "$first")"
    if [ -n "$body_file" ]; then
      body="$(cat "$body_file")"
    else
      # Without a body file, the description is the first commit's body.
      body="$(git log -1 --format=%b "$first")"
    fi
    check_subject "$title"
    check_text "$body"
    gh pr create --base main --head "$(current_branch)" --title "$title" --body "$body"
    ;;

  merge)
    number="${1:?usage: scripts/ship.sh merge <number>}"
    title="$(gh pr view "$number" --json title --jq .title)"
    check_subject "$title"
    gh pr checks "$number" >/dev/null || fail "checks on #$number are failing or still running: gh pr checks $number"
    # The squash commit gets the PR title and the commits' messages, minus any co-author lines.
    body="$(gh pr view "$number" --json commits --jq '.commits[] | .messageHeadline + "\n\n" + .messageBody' | strip_trailers)"
    head="$(gh pr view "$number" --json headRefName --jq .headRefName)"
    if ! gh pr merge "$number" --squash --admin --delete-branch --subject "$title (#$number)" --body "$body"; then
      # gh also deletes the local branch; that fails when a worktree still uses it, after the merge.
      [ "$(gh pr view "$number" --json state --jq .state)" = "MERGED" ] || fail "#$number was not merged"
      echo "ship: #$number is merged; its local branch was kept (in use by a worktree?)" >&2
    fi
    # Leave whatever branch you're working on alone: only move to main if you were on the merged
    # branch (or on main already); otherwise just bring the local main up to date.
    if [ "$(current_branch)" = "$head" ] || [ "$(current_branch)" = "main" ]; then
      git switch main
      git pull --ff-only
    else
      git fetch -q origin main:main
      echo "ship: main is up to date; you're still on $(current_branch)"
    fi
    ;;

  check)
    file="${1:?usage: scripts/ship.sh check <message-file>}"
    message="$(grep -v '^#' "$file" || true)"
    subject="$(head -1 <<<"$message")"
    # Messages git writes itself (merges, fixups, reverts) are left alone.
    if [[ "$subject" =~ ^(Merge |Revert \"|fixup!|squash!|amend!) ]]; then exit 0; fi
    check_subject "$subject"
    check_text "$message"
    ;;

  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    [ -z "$command" ] || exit 1
    ;;
esac
