#!/usr/bin/env bash
# Read-only deploy snapshot: extracts deploy and secret declarations from
# GitHub Actions workflow files and prints recent runs for each workflow.
# Usage: deploy-snapshot.sh [-R owner/repo] [-n limit] [--local-only] [workflow ...]
#   -R            repository (default: origin remote)
#   -n            number of recent runs per workflow (default: 5)
#   --local-only  print workflow declarations only without calling gh
#   workflow      workflow file names under .github/workflows/ (default: all *.yml and *.yaml)
# GH_TIMEOUT bounds each gh call in seconds (default 20).
set -euo pipefail

usage() {
  echo "usage: deploy-snapshot.sh [-R owner/repo] [-n limit] [--local-only] [workflow ...]" >&2
  exit 2
}

repo=""
count="5"
local_only=0
workflows=()

while (($# > 0)); do
  case "$1" in
    -R)
      (($# >= 2)) || usage
      repo="$2"
      shift 2
      ;;
    -n)
      (($# >= 2)) || usage
      count="$2"
      shift 2
      ;;
    --local-only)
      local_only=1
      shift
      ;;
    -h | --help)
      usage
      ;;
    -*)
      usage
      ;;
    *)
      workflows+=("$1")
      shift
      ;;
  esac
done

[[ "$count" =~ ^[1-9][0-9]*$ ]] || { echo "deploy-snapshot: -n must be a positive integer" >&2; exit 2; }
limit="${GH_TIMEOUT:-20}"
[[ "$limit" =~ ^[1-9][0-9]*$ ]] || { echo "deploy-snapshot: GH_TIMEOUT must be a positive number of seconds" >&2; exit 2; }

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "deploy-snapshot: not inside a Git worktree" >&2; exit 2; }
workflow_dir="$root/.github/workflows"

if ((${#workflows[@]} == 0)); then
  if [[ -d "$workflow_dir" ]]; then
    while IFS= read -r path; do
      workflows+=("$(basename "$path")")
    done < <(find "$workflow_dir" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)
  fi
fi

if ((${#workflows[@]} == 0)); then
  echo "deploy-snapshot: no workflow files found in .github/workflows" >&2
  exit 1
fi

if ((local_only == 0)); then
  if [[ -z "$repo" ]]; then
    url="$(git remote get-url origin 2>/dev/null)" || { echo "deploy-snapshot: no origin remote; pass -R owner/repo or --local-only" >&2; exit 2; }
    repo="$(printf '%s' "$url" | sed -E 's#/+$##; s#\.git$##' | awk -F'[/:]' '{print $(NF-1) "/" $NF}')"
  fi
  if command -v perl >/dev/null; then
    limit_cmd=(perl -e '$t = shift; defined(my $pid = fork) or die "fork: $!\n"; if (!$pid) { setpgrp(0, 0); exec @ARGV or die "exec: $!\n" } my $stop = sub { kill $_[0] => -$pid; for (1 .. 10) { waitpid($pid, 1); last unless kill 0 => -$pid; sleep 1 } kill KILL => -$pid; waitpid $pid, 0; exit $_[1] }; for my $s (qw(INT TERM HUP)) { $SIG{$s} = sub { $stop->($s, 128 + { INT => 2, TERM => 15, HUP => 1 }->{$s}) } } $SIG{ALRM} = sub { $stop->(TERM => 124) }; alarm $t; waitpid $pid, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)' "$limit")
  elif command -v timeout >/dev/null; then
    limit_cmd=(timeout -k 10 "$limit")
  elif command -v gtimeout >/dev/null; then
    limit_cmd=(gtimeout -k 10 "$limit")
  else
    echo "deploy-snapshot: need perl, timeout, or gtimeout to bound external calls" >&2
    exit 2
  fi
fi

failed=0
has_gh=0
if ((local_only == 0)) && command -v gh >/dev/null; then
  has_gh=1
fi

for wf in "${workflows[@]}"; do
  base="$(basename "$wf")"
  path="$workflow_dir/$base"
  echo "=== .github/workflows/$base ==="
  if [[ ! -f "$path" ]]; then
    echo "deploy-snapshot: workflow file not found: .github/workflows/$base" >&2
    failed=1
    continue
  fi

  grep -nE '^[[:space:]]*(name|on|run|if|environment|env-slug|secret-path):' "$path" || echo "(no matching declarations)"

  if ((local_only == 0)); then
    echo "Recent runs (id, branch, event, status, conclusion, sha, url)"
    if ((has_gh == 0)); then
      echo "deploy-snapshot: section failed: gh is not installed (pass --local-only to skip runs)" >&2
      failed=1
    elif ! "${limit_cmd[@]}" gh api "repos/$repo/actions/workflows/$base/runs" -X GET -F per_page="$count" \
      --jq '.workflow_runs[] | [.id, .head_branch, .event, .status, (.conclusion // "-"), .head_sha[0:8], .html_url] | @tsv'; then
      echo "deploy-snapshot: section failed: recent runs for $base" >&2
      failed=1
    fi
  fi
  echo
done

exit "$failed"
