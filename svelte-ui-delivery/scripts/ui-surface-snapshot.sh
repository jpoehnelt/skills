#!/usr/bin/env bash
# Snapshot the existing UI surface for feature keywords before designing a change.
# Read-only. Exit 0 on success, 2 on usage or tool errors.
#
# Usage: ui-surface-snapshot.sh [--root DIR]... KEYWORD...
#   --root DIR  Directory to search, relative to the repo root (repeatable; default: the repo).
#   KEYWORD     Case-insensitive name fragments, e.g. button dialog settings.
set -euo pipefail

usage() { sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; }

roots=()
keywords=()
while (($# > 0)); do
  case "$1" in
    --root) [[ $# -ge 2 ]] || { usage >&2; exit 2; }; roots+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "ui-surface-snapshot: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) keywords+=("$1"); shift ;;
  esac
done
((${#keywords[@]} > 0)) || { echo "ui-surface-snapshot: give at least one keyword" >&2; usage >&2; exit 2; }

command -v rg >/dev/null || { echo "ui-surface-snapshot: ripgrep (rg) is required" >&2; exit 2; }
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "ui-surface-snapshot: not inside a git repository" >&2; exit 2; }
cd "$root"
((${#roots[@]} > 0)) || roots=(.)
for dir in "${roots[@]}"; do
  [[ -d "$dir" ]] || { echo "ui-surface-snapshot: not a directory: $dir" >&2; exit 2; }
done

# Keywords are literal fragments, never regular expressions.
kw=()
for k in "${keywords[@]}"; do kw+=(-e "$k"); done
excludes=(--glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**'
  --glob '!**/.svelte-kit/**' --glob '!**/storybook-static/**')
# Deadline every call: timeout(1), gtimeout (macOS coreutils), or a perl alarm; never unbounded.
if command -v timeout >/dev/null; then limit=(timeout 60)
elif command -v gtimeout >/dev/null; then limit=(gtimeout 60)
elif command -v perl >/dev/null; then limit=(perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' 60)
else echo "$(basename "$0"): need timeout, gtimeout, or perl to bound external calls" >&2; exit 2; fi

# rg exit: 0 = matches, 1 = none, >1 = error (fatal).
run_rg() {
  local status=0
  "${limit[@]}" rg "${excludes[@]}" "$@" || status=$?
  if ((status > 1)); then echo "ui-surface-snapshot: rg failed or timed out (exit $status)" >&2; exit 2; fi
  return 0
}
files=$(run_rg --files "${roots[@]}")

section() { echo; echo "== $1"; }

section "Components matching: ${keywords[*]}"
grep -E '/components/.*\.svelte$' <<<"$files" | grep -iF "${kw[@]}" | head -80 || true

section "Shared primitive folders (ui/, packages/ui)"
grep -E '(/components/ui/|packages/ui/src/)' <<<"$files" | sed -E 's#/[^/]+$##' | sort -u | head -60 || true

section "Routes matching"
grep -E '/routes/' <<<"$files" | grep -iF "${kw[@]}" | head -60 || true

section "Consumers (files referencing the keywords)"
# Capture first so an rg failure exits 2 instead of vanishing in the pipeline.
consumers=$(run_rg -li -F --glob '*.{svelte,ts,js}' "${kw[@]}" "${roots[@]}")
grep -vE '\.(test|spec|stories)\.' <<<"$consumers" | head -80 || true

section "Stories and tests matching"
grep -E '\.(stories|story|test|spec)\.(ts|js|svelte)$' <<<"$files" | grep -iF "${kw[@]}" | head -60 || true

section "Theme tokens and fonts (global CSS)"
css=$(grep -E '(^|/)(app|global|globals|theme|tokens)\.css$' <<<"$files" | head -5 || true)
if [[ -n "$css" ]]; then
  while IFS= read -r f; do
    echo "-- $f"
    tokens=$(run_rg -n -e '^\s*--[a-z0-9-]+\s*:|font-family|@theme|@custom-variant|prefers-reduced-motion|\.dark\b' "$f")
    [[ -z "$tokens" ]] || head -40 <<<"$tokens"
  done <<<"$css"
else
  echo "(no app/global/theme CSS found)"
fi

section "Storybook and component config"
grep -E '(^|/)(\.storybook/main\.[jt]s|components\.json|svelte\.config\.js)$' <<<"$files" | head -20 || true
