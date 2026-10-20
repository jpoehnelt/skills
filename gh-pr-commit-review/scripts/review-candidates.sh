#!/usr/bin/env bash
# Read-only: lists open PRs updated after a cutoff (number, updated, title, url), REST API only.
# Usage: review-candidates.sh <iso-8601-cutoff> [owner/repo]   (repo defaults to the origin remote)
# GH_TIMEOUT bounds the gh call in seconds (default 60).
set -euo pipefail

[[ -n "${1:-}" ]] || { echo "usage: review-candidates.sh <iso-8601-cutoff> [owner/repo]" >&2; exit 2; }
cutoff="$1"
limit="${GH_TIMEOUT:-60}"

# Strict form keeps the comparison meaningful and the value safe to embed in the jq filter.
[[ "$cutoff" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)?$ ]] || {
  echo "review-candidates: cutoff must be UTC, YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ" >&2
  exit 2
}

command -v gh >/dev/null || { echo "review-candidates: gh is required" >&2; exit 2; }

if [[ -n "${2:-}" ]]; then
  repo="$2"
else
  url="$(git remote get-url origin)" || { echo "review-candidates: no origin remote; pass owner/repo" >&2; exit 2; }
  # Last two path segments, so https, ssh, and proxied remotes all work.
  repo="$(printf '%s' "$url" | sed -E 's#/+$##; s#\.git$##' | awk -F'[/:]' '{print $(NF-1) "/" $NF}')"
fi

# Open PRs sorted by last update, newest first; keep those after the cutoff. GitHub
# timestamps are UTC ISO-8601 (YYYY-MM-DDTHH:MM:SSZ), so string comparison is ordering
# when the cutoff uses the same form. --paginate reads every page of open PRs.
# Deadline every call: timeout(1), gtimeout (macOS coreutils), or a perl alarm; never unbounded.
if command -v timeout >/dev/null; then limit_cmd=(timeout "$limit")
elif command -v gtimeout >/dev/null; then limit_cmd=(gtimeout "$limit")
elif command -v perl >/dev/null; then limit_cmd=(perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' "$limit")
else echo "$(basename "$0"): need timeout, gtimeout, or perl to bound external calls" >&2; exit 2; fi
"${limit_cmd[@]}" gh api --paginate "repos/$repo/pulls?state=open&sort=updated&direction=desc&per_page=100" \
  --jq ".[] | select(.updated_at > \"$cutoff\") | [.number, .updated_at, .title, .html_url] | @tsv"
