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
# The shape check passes 2026-99-99 or T99:00:00Z; reject dates and times that do not exist.
y=$((10#${cutoff:0:4})) m=$((10#${cutoff:5:2})) d=$((10#${cutoff:8:2}))
days=(31 28 31 30 31 30 31 31 30 31 30 31)
((y % 4 == 0 && (y % 100 != 0 || y % 400 == 0))) && days[1]=29
valid=true
((m >= 1 && m <= 12)) && ((d >= 1 && d <= days[m - 1])) || valid=false
if [[ "$valid" == true && ${#cutoff} -gt 10 ]]; then
  ((10#${cutoff:11:2} <= 23 && 10#${cutoff:14:2} <= 59 && 10#${cutoff:17:2} <= 59)) || valid=false
fi
[[ "$valid" == true ]] || { echo "review-candidates: cutoff is not a real UTC date and time: $cutoff" >&2; exit 2; }

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
# Each sends TERM at the deadline and KILL 10s later, so a command that ignores TERM still stops.
if command -v timeout >/dev/null; then limit_cmd=(timeout -k 10 "$limit")
elif command -v gtimeout >/dev/null; then limit_cmd=(gtimeout -k 10 "$limit")
elif command -v perl >/dev/null; then limit_cmd=(perl -e '$t = shift; defined(my $pid = fork) or die "fork: $!\n"; if (!$pid) { exec @ARGV or die "exec: $!\n" } $SIG{ALRM} = sub { kill TERM => $pid; sleep 10; kill KILL => $pid; waitpid $pid, 0; exit 124 }; alarm $t; waitpid $pid, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)' "$limit")
else echo "$(basename "$0"): need timeout, gtimeout, or perl to bound external calls" >&2; exit 2; fi
"${limit_cmd[@]}" gh api --paginate "repos/$repo/pulls?state=open&sort=updated&direction=desc&per_page=100" \
  --jq ".[] | select(.updated_at > \"$cutoff\") | [.number, .updated_at, .title, .html_url] | @tsv"
