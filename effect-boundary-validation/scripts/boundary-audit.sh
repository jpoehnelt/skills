#!/usr/bin/env bash
# List candidate ingress, cast, signature, and decode sites for a boundary review.
# Read-only. Exit 0 when clean, 1 when a banned import is found, 2 on usage or tool errors.
#
# Usage: boundary-audit.sh [--ban MODULE]... [--rule AST_GREP_RULE_ID]... [PATH...]
#   --ban MODULE   Module whose imports must not appear (repeatable), e.g. --ban zod --ban valibot.
#   --rule ID      ast-grep rule id to run if the repo has sgconfig.yml (repeatable).
#   PATH           Paths relative to the repo root (default: the whole repo).
set -euo pipefail

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }

bans=()
rules=()
paths=()
while (($# > 0)); do
  case "$1" in
    --ban) [[ $# -ge 2 ]] || { usage >&2; exit 2; }; bans+=("$2"); shift 2 ;;
    --rule) [[ $# -ge 2 ]] || { usage >&2; exit 2; }; rules+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; paths+=("$@"); break ;;
    -*) echo "boundary-audit: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) paths+=("$1"); shift ;;
  esac
done

command -v rg >/dev/null || { echo "boundary-audit: ripgrep (rg) is required" >&2; exit 2; }
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "boundary-audit: not inside a git repository" >&2; exit 2; }
cd "$root"
((${#paths[@]} > 0)) || paths=(.)
for path in "${paths[@]}"; do
  [[ -e "$path" ]] || { echo "boundary-audit: path does not exist: $path" >&2; exit 2; }
done

globs=(--glob '*.{ts,tsx,mts,cts,js,mjs,cjs,svelte}' --glob '!**/*.{test,spec}.*'
  --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' --glob '!**/.svelte-kit/**')
# Deadline every call: timeout(1), gtimeout (macOS coreutils), or a perl alarm; never unbounded.
if command -v timeout >/dev/null; then limit=(timeout 60)
elif command -v gtimeout >/dev/null; then limit=(gtimeout 60)
elif command -v perl >/dev/null; then limit=(perl -e 'alarm shift; exec @ARGV or die "exec: $!\n"' 60)
else echo "$(basename "$0"): need timeout, gtimeout, or perl to bound external calls" >&2; exit 2; fi

# rg exit: 0 = matches printed, 1 = none, >1 = error (fatal).
search() {
  local status=0
  "${limit[@]}" rg -n --max-columns 200 "${globs[@]}" -e "$1" "${paths[@]}" || status=$?
  if ((status > 1)); then echo "boundary-audit: rg failed or timed out (exit $status)" >&2; exit 2; fi
  return "$status"
}

banned=0
if ((${#bans[@]} > 0)); then
  alt="$(printf '%s|' "${bans[@]}" | sed 's/[.[\*^$()+?{}]/\\&/g')"
  alt="${alt%|}"
  echo "Banned imports: ${bans[*]} (must be empty)"
  # Static imports, re-exports, side-effect imports, dynamic import(), and require().
  if search "\\b(from|import|require)\\s*\\(?\\s*['\"\`]($alt)(/[^'\"\`]*)?['\"\`]"; then banned=1; fi
  echo
fi

echo "Parse and cast sites (each should feed a schema decode or read trusted local data)"
search 'JSON\.parse\(|\.json\(\)|\bevent\.data\b|as unknown as|\bas any\b|:\s*any\b|\.run<[^>]+>\(' || true

echo
echo "Signature and constant-time checks (verify raw bytes before parsing)"
search 'timingSafeEqual|createHmac|crypto\.subtle\.(verify|sign)|verifySignature|[Ss]ignature' || true

echo
echo "Schema decode sites"
search 'Schema\.decode(Unknown)?[A-Za-z]*\b|Schema\.fromJsonString|onExcessProperty' || true

if ((${#rules[@]} > 0)); then
  echo
  filter="^($(printf '%s|' "${rules[@]}" | sed 's/|$//'))$"
  sg=""
  if [[ -x node_modules/.bin/ast-grep ]]; then sg=node_modules/.bin/ast-grep
  elif command -v ast-grep >/dev/null; then sg=ast-grep; fi
  # A requested rule that cannot run is a tool error (exit 2), never a clean result.
  if [[ ! -f sgconfig.yml ]]; then
    echo "boundary-audit: --rule requested but no sgconfig.yml at repo root" >&2; exit 2
  elif [[ -z "$sg" ]]; then
    echo "boundary-audit: --rule requested but ast-grep executable not found; install dependencies" >&2; exit 2
  else
    echo "ast-grep rules: ${rules[*]}"
    sg_status=0
    "${limit[@]}" "$sg" scan --config sgconfig.yml --filter "$filter" --report-style short "${paths[@]}" || sg_status=$?
    # ast-grep exits 1 for findings; anything higher (including a timeout) is a tool error.
    if ((sg_status == 1)); then banned=1
    elif ((sg_status > 1)); then echo "boundary-audit: ast-grep failed or timed out (exit $sg_status)" >&2; exit 2; fi
  fi
fi

exit "$banned"
