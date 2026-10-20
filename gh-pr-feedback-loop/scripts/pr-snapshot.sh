#!/usr/bin/env bash
# Read-only PR state: head, base, checks, reviews, unresolved threads, inline comments.
# Uses the REST API, plus GraphQL only for thread resolution state.
# Usage: pr-snapshot.sh <pr-number-or-url> [owner/repo]   (repo defaults to the origin remote)
# GH_TIMEOUT bounds each gh call in seconds (default 60).
set -euo pipefail

[[ -n "${1:-}" ]] || { echo "usage: pr-snapshot.sh <pr-number-or-url> [owner/repo]" >&2; exit 2; }
pr="$1"
# A GitHub PR URL carries its own repository; use it unless one is passed explicitly.
url_repo=""
if [[ "$pr" =~ github\.com[/:]([^/]+/[^/]+)/pull/([0-9]+) ]]; then
  url_repo="${BASH_REMATCH[1]}"
  pr="${BASH_REMATCH[2]}"
fi
num="${pr##*/}"
limit="${GH_TIMEOUT:-60}"

command -v gh >/dev/null || { echo "pr-snapshot: gh is required" >&2; exit 2; }

if [[ -n "${2:-}" ]]; then
  repo="$2"
elif [[ -n "$url_repo" ]]; then
  repo="$url_repo"
else
  url="$(git remote get-url origin)" || { echo "pr-snapshot: no origin remote; pass owner/repo" >&2; exit 2; }
  # Last two path segments, so https, ssh, and proxied remotes (http://host/git/owner/repo) all work.
  repo="$(printf '%s' "$url" | sed -E 's#/+$##; s#\.git$##' | awk -F'[/:]' '{print $(NF-1) "/" $NF}')"
fi

# Deadline every call: timeout(1), gtimeout (macOS coreutils), or a perl alarm; never unbounded.
if command -v timeout >/dev/null; then limit_cmd=(timeout "$limit")
elif command -v gtimeout >/dev/null; then limit_cmd=(gtimeout "$limit")
elif command -v perl >/dev/null; then limit_cmd=(perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' "$limit")
else echo "$(basename "$0"): need timeout, gtimeout, or perl to bound external calls" >&2; exit 2; fi
api() { "${limit_cmd[@]}" gh api "$@"; }
# A failed section is reported and the rest still prints; the exit status stays non-zero.
failed=0
section() { "$@" || { echo "pr-snapshot: section failed: ${*:2:1}" >&2; failed=1; }; }

echo '--- pull request ---'
api "repos/$repo/pulls/$num" --jq '{number, title, url: .html_url, state, draft, merged,
  head: .head.ref, head_sha: .head.sha, base: .base.ref, base_sha: .base.sha,
  mergeable, mergeable_state, body}'
head_sha="$(api "repos/$repo/pulls/$num" --jq .head.sha)"

echo "--- check runs on $head_sha (status, conclusion, name, url) ---"
section api "repos/$repo/commits/$head_sha/check-runs?per_page=100" --paginate \
  --jq '.check_runs[] | [.status, (.conclusion // "-"), .name, .html_url] | @tsv'

echo '--- commit statuses (state, context, url) ---'
section api "repos/$repo/commits/$head_sha/status?per_page=100" --paginate \
  --jq '.statuses[] | [.state, .context, (.target_url // "-")] | @tsv'

echo '--- reviews (state, author, commit) ---'
section api "repos/$repo/pulls/$num/reviews?per_page=100" --paginate \
  --jq '.[] | [.state, .user.login, .commit_id[0:8]] | @tsv'

# REST comments carry no resolved state; review threads (GraphQL) do. Some hosts
# block GraphQL, so report that instead of implying there are no open threads.
echo '--- unresolved review threads (thread id, path, line, outdated, comments, first author, first line, last author, last line) ---'
if threads="$(api graphql --paginate -F owner="${repo%%/*}" -F name="${repo#*/}" -F num="$num" -f query='
query($owner: String!, $name: String!, $num: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $num) {
      reviewThreads(first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line
          comments(first: 1) { totalCount nodes { author { login } body } }
          latest: comments(last: 1) { nodes { author { login } body } }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[]
  | select(.isResolved | not)
  | [.id, .path, (.line // "-"), .isOutdated, .comments.totalCount,
     (.comments.nodes[0].author.login // "-"), ((.comments.nodes[0].body // "") | split("\n")[0] | .[0:120]),
     (.latest.nodes[0].author.login // "-"), ((.latest.nodes[0].body // "") | split("\n")[0] | .[0:120])] | @tsv' 2>/dev/null)"; then
  [[ -z "$threads" ]] || printf '%s\n' "$threads"
else
  echo "pr-snapshot: thread resolution state unavailable (GraphQL failed); read threads another way" >&2
  failed=1
fi

echo '--- inline comments (id, path, line, author, outdated) ---'
section api "repos/$repo/pulls/$num/comments?per_page=100" --paginate \
  --jq '.[] | [.id, .path, (.line // .original_line), .user.login, (.position == null)] | @tsv'

exit "$failed"
