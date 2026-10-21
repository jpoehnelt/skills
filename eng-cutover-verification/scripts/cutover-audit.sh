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

# Deadline every command, never unbounded. Prefer perl: it signals the command's process group (TERM at
# the deadline, KILL after a 10s grace while any member still runs) and forwards INT, TERM, and HUP
# the same way. timeout(1) or gtimeout (macOS coreutils) is the fallback; its -k KILL reaches the
# group only while the direct child still runs.
if command -v perl >/dev/null; then runner=(perl -e '$t = shift; defined(my $pid = fork) or die "fork: $!\n"; if (!$pid) { setpgrp(0, 0); exec @ARGV or die "exec: $!\n" } my $stop = sub { kill $_[0] => -$pid; for (1 .. 10) { waitpid($pid, 1); last unless kill 0 => -$pid; sleep 1 } kill KILL => -$pid; waitpid $pid, 0; exit $_[1] }; for my $s (qw(INT TERM HUP)) { $SIG{$s} = sub { $stop->($s, 128 + { INT => 2, TERM => 15, HUP => 1 }->{$s}) } } $SIG{ALRM} = sub { $stop->(TERM => 124) }; alarm $t; waitpid $pid, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)' "$limit")
elif command -v timeout >/dev/null; then runner=(timeout -k 10 "$limit")
elif command -v gtimeout >/dev/null; then runner=(gtimeout -k 10 "$limit")
else echo "cutover-audit: need perl, timeout, or gtimeout to bound --test and --live-check" >&2; exit 2; fi

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
        # An untracked retired scope counts as retired only if it was ever tracked; otherwise it is likely a typo.
        # A shallow clone may lack that history; fetch more history rather than trust a pass.
        if [[ "$kind" == retired ]]; then
          if [[ -n "$(git log -1 --format=%h -- "$scope" 2>/dev/null)" ]]; then pass "retired: $label (scope removed: $scope)"
          else fail "retired: $label scope was never tracked (typo or shallow clone?): $scope"; fi
        else fail "required: scope is not tracked: $scope"; fi
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
