#!/usr/bin/env bash
# Read-only CI snapshot over the REST API: PR head, check runs and statuses on that head,
# workflow runs for the head, and recent runs on the base branch for a base-red comparison.
# Usage: ci-snapshot.sh [-R owner/repo] [-w workflow] [pr-number]
#   -R  repository (default: origin remote)
#   -w  workflow file name or id to compare on the base branch (default: all workflows)
#   With no PR, prints only recent runs on the default branch.
# GH_TIMEOUT bounds each gh call in seconds (default 60).
set -euo pipefail

usage() { echo "usage: ci-snapshot.sh [-R owner/repo] [-w workflow] [pr-number]" >&2; exit 2; }

repo=""
workflow=""
while getopts ":R:w:" opt; do
  case "$opt" in
    R) repo="$OPTARG" ;;
    w) workflow="$OPTARG" ;;
    *) usage ;;
  esac
done
shift $((OPTIND - 1))
pr="${1:-}"
# A GitHub PR URL carries its own repository; use it unless one is passed explicitly.
url_repo=""
if [[ "$pr" =~ github\.com[/:]([^/]+/[^/]+)/pull/([0-9]+) ]]; then
  url_repo="${BASH_REMATCH[1]}"
  pr="${BASH_REMATCH[2]}"
fi
pr="${pr##*/}"
limit="${GH_TIMEOUT:-60}"

command -v gh >/dev/null || { echo "ci-snapshot: gh is required" >&2; exit 2; }

if [[ -z "$repo" && -n "$url_repo" ]]; then
  repo="$url_repo"
fi
if [[ -z "$repo" ]]; then
  url="$(git remote get-url origin)" || { echo "ci-snapshot: no origin remote; pass -R owner/repo" >&2; exit 2; }
  # Last two path segments, so https, ssh, and proxied remotes all work.
  repo="$(printf '%s' "$url" | sed -E 's#/+$##; s#\.git$##' | awk -F'[/:]' '{print $(NF-1) "/" $NF}')"
fi

default_branch() {
  local ref
  if ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"; then
    echo "${ref#origin/}"
  elif git show-ref --verify --quiet refs/remotes/origin/main; then
    echo main
  elif git show-ref --verify --quiet refs/remotes/origin/master; then
    echo master
  else
    echo "ci-snapshot: cannot find the default branch; run 'git remote set-head origin --auto'" >&2
    return 1
  fi
}

# Bound each call with timeout(1) when available (gtimeout on macOS with coreutils).
limit_cmd=()
if command -v timeout >/dev/null; then limit_cmd=(timeout "$limit")
elif command -v gtimeout >/dev/null; then limit_cmd=(gtimeout "$limit"); fi
api() { ${limit_cmd[@]+"${limit_cmd[@]}"} gh api "$@"; }
# A failed section is reported and the rest still prints; the exit status stays non-zero.
failed=0
section() { "$@" || { echo "ci-snapshot: section failed: ${*:2:1}" >&2; failed=1; }; }

if [[ -n "$pr" ]]; then
  api "repos/$repo/pulls/$pr" --jq '{number, url: .html_url, state, draft, merged,
    base: .base.ref, head: .head.ref, sha: .head.sha, mergeable_state}'
  head_sha="$(api "repos/$repo/pulls/$pr" --jq .head.sha)"
  base="$(api "repos/$repo/pulls/$pr" --jq .base.ref)"

  echo
  echo "Check runs on $head_sha (status, conclusion, name, url)"
  section api "repos/$repo/commits/$head_sha/check-runs?per_page=100" --paginate \
    --jq '.check_runs[] | [.status, (.conclusion // "-"), .name, .html_url] | @tsv'

  echo
  echo "Commit statuses (state, context, url)"
  section api "repos/$repo/commits/$head_sha/status" \
    --jq '.statuses[] | [.state, .context, (.target_url // "-")] | @tsv'

  echo
  echo "Workflow runs for $head_sha (id, workflow, status, conclusion, url)"
  section api "repos/$repo/actions/runs?head_sha=$head_sha&per_page=20" \
    --jq '.workflow_runs[] | [.id, .name, .status, (.conclusion // "-"), .html_url] | @tsv'
else
  # The selected repository's default branch; fall back to the local origin's.
  base="$(api "repos/$repo" --jq .default_branch 2>/dev/null)" || base="$(default_branch)"
fi

if [[ -n "$workflow" ]]; then
  path="repos/$repo/actions/workflows/$workflow/runs?branch=$base&per_page=10"
else
  path="repos/$repo/actions/runs?branch=$base&per_page=10"
fi
echo
echo "Recent runs on $base${workflow:+ for $workflow} (id, workflow, status, conclusion, sha, url)"
section api "$path" \
  --jq '.workflow_runs[] | [.id, .name, .status, (.conclusion // "-"), .head_sha[0:8], .html_url] | @tsv'

exit "$failed"
