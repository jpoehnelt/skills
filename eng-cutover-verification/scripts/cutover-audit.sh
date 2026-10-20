#!/usr/bin/env bash
# Read-only: proves retired patterns are gone and replacements exist in tracked
# files, then runs the given test and live-check commands from the repo root.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: cutover-audit.sh [assertions]   (repeat any assertion)
  --retired 'label:::git-pathspec:::extended-regex'   fails if the regex still matches
  --required 'label:::git-pathspec:::extended-regex'  fails if nothing matches
  --test 'label:::shell-command'                      runs from the repo root
  --live-check 'label:::shell-command'                runs from the repo root
  --final   also require a clean tree and at least one --live-check
  --timeout SECONDS   per-command limit for --test and --live-check (default 900)

Repository searches alone never prove live state.
USAGE
}
die_usage() { printf 'cutover-audit: %s\n\n' "$1" >&2; usage >&2; exit 2; }

specs=()  # entries are "kind<TAB>spec"
final=false live_count=0 failures=0 limit=900
while (($# > 0)); do
  case "$1" in
    --retired | --required | --test | --live-check)
      (($# >= 2)) || die_usage "$1 requires a value"
      specs+=("${1#--}"$'\t'"$2")
      [[ "$1" == --live-check ]] && live_count=$((live_count + 1))
      shift 2 ;;
    --final) final=true; shift ;;
    --timeout)
      (($# >= 2)) && [[ "$2" =~ ^[1-9][0-9]*$ ]] || die_usage "--timeout requires a positive number of seconds"
      limit=$2; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) die_usage "unknown argument: $1" ;;
  esac
done
((${#specs[@]} > 0)) || die_usage "at least one assertion is required"

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo 'cutover-audit: not inside a Git worktree' >&2; exit 2; }
cd "$repo_root"

fail() { printf 'FAIL %s\n' "$1" >&2; failures=$((failures + 1)); }
pass() { printf 'PASS %s\n' "$1"; }

# Deadline every command: timeout(1), gtimeout (macOS coreutils), or a perl alarm; never unbounded.
if command -v timeout >/dev/null; then runner=(timeout "$limit")
elif command -v gtimeout >/dev/null; then runner=(gtimeout "$limit")
elif command -v perl >/dev/null; then runner=(perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' "$limit")
else echo "cutover-audit: need timeout, gtimeout, or perl to bound --test and --live-check" >&2; exit 2; fi

for entry in "${specs[@]}"; do
  kind=${entry%%$'\t'*} spec=${entry#*$'\t'}
  [[ "$spec" == ?*:::?* ]] || { fail "$kind: malformed spec $spec"; continue; }
  label=${spec%%:::*} rest=${spec#*:::}
  case "$kind" in
    retired | required)
      [[ "$rest" == ?*:::?* ]] || { fail "$kind: malformed spec $spec"; continue; }
      scope=${rest%%:::*} regex=${rest#*:::}
      scope_status=0
      scope_err=$(git ls-files --error-unmatch -- "$scope" 2>&1 >/dev/null) || scope_status=$?
      if [[ "$scope_status" -gt 1 ]]; then
        # Exit 1 means no tracked match; anything higher is a bad pathspec or repo error.
        fail "$kind: $label scope could not be evaluated: $scope_err"
        continue
      fi
      if [[ "$scope_status" -eq 1 ]]; then
        # A retired scope with no tracked files is fully retired; a required one cannot match.
        if [[ "$kind" == retired ]]; then pass "retired: $label (scope absent: $scope)"; else fail "required: scope is not tracked: $scope"; fi
        continue
      fi
      status=0
      matches=$(git grep -n -E -- "$regex" -- "$scope" 2>&1) || status=$?
      if ((status > 1)); then fail "$kind: $label could not be evaluated"$'\n'"$matches"
      elif [[ "$kind" == retired ]]; then
        if ((status == 1)); then pass "retired: $label"; else fail "retired: $label"$'\n'"$matches"; fi
      elif ((status == 0)); then pass "required: $label"
      else fail "required: $label ($scope / $regex)"
      fi ;;
    test | live-check)
      printf 'RUN %s: %s\n' "$kind" "$label"
      if "${runner[@]}" bash -o pipefail -c "$rest"; then pass "$kind: $label"; else fail "$kind: $label"; fi ;;
  esac
done

if [[ "$final" == true ]]; then
  ((live_count > 0)) || fail "final: at least one --live-check is required; repository searches do not prove live state"
  if [[ -n "$(git status --porcelain)" ]]; then fail "final: worktree is not clean"; git status --short >&2
  else pass "final: worktree is clean"
  fi
fi

((failures == 0)) || { printf 'cutover-audit: %d assertion(s) failed\n' "$failures" >&2; exit 1; }
echo 'cutover-audit: all assertions passed'
