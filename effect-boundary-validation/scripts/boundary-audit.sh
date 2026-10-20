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
for i in "${!paths[@]}"; do
  [[ -e "${paths[$i]}" ]] || { echo "boundary-audit: path does not exist: ${paths[$i]}" >&2; exit 2; }
  # A path that starts with "-" (for example a PR-added file named --pre=cmd) must never parse as an option.
  [[ "${paths[$i]}" != -* ]] || paths[$i]="./${paths[$i]}"
done

globs=(--glob '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,svelte}'
  --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' --glob '!**/.svelte-kit/**')
# Deadline every call, never unbounded. Prefer perl: it signals the command's process group (TERM at
# the deadline, KILL after a 10s grace while any member still runs) and forwards INT, TERM, and HUP
# the same way. timeout(1) or gtimeout (macOS coreutils) is the fallback; its -k KILL reaches the
# group only while the direct child still runs.
if command -v perl >/dev/null; then limit=(perl -e '$t = shift; defined(my $pid = fork) or die "fork: $!\n"; if (!$pid) { setpgrp(0, 0); exec @ARGV or die "exec: $!\n" } my $stop = sub { kill $_[0] => -$pid; for (1 .. 10) { waitpid($pid, 1); last unless kill 0 => -$pid; sleep 1 } kill KILL => -$pid; waitpid $pid, 0; exit $_[1] }; for my $s (qw(INT TERM HUP)) { $SIG{$s} = sub { $stop->($s, 128 + { INT => 2, TERM => 15, HUP => 1 }->{$s}) } } $SIG{ALRM} = sub { $stop->(TERM => 124) }; alarm $t; waitpid $pid, 0; exit($? & 127 ? 128 + ($? & 127) : $? >> 8)' 60)
elif command -v timeout >/dev/null; then limit=(timeout -k 10 60)
elif command -v gtimeout >/dev/null; then limit=(gtimeout -k 10 60)
else echo "$(basename "$0"): need perl, timeout, or gtimeout to bound external calls" >&2; exit 2; fi

# rg exit: 0 = matches printed, 1 = none, >1 = error (fatal).
# Bans cover every source file, tests included; the inventories below skip tests (no_tests).
no_tests=(--glob '!**/*.{test,spec}.*')
search() {
  local pattern=$1; shift
  local status=0
  "${limit[@]}" rg -n --max-columns 200 "${globs[@]}" "$@" -e "$pattern" -- "${paths[@]}" || status=$?
  if ((status > 1)); then echo "boundary-audit: rg failed or timed out (exit $status)" >&2; exit 2; fi
  return "$status"
}

banned=0
if ((${#bans[@]} > 0)); then
  alt="$(printf '%s|' "${bans[@]}" | sed 's/[.[\*^$()+?{}]/\\&/g')"
  alt="${alt%|}"
  echo "Banned imports: ${bans[*]} (must be empty)"
  # Static imports, re-exports, side-effect imports, dynamic import(), and require(), including
  # forms split across lines (-U lets \s match newlines) or with block comments around the opening parenthesis.
  if search "\\b(from|import|require)(\\s|/\\*[\\s\\S]*?\\*/)*\\(?(\\s|/\\*[\\s\\S]*?\\*/)*['\"\`]($alt)(/[^'\"\`]*)?['\"\`]" -U; then banned=1; fi
  echo
fi

echo "Parse and cast sites (each should feed a schema decode or read trusted local data)"
search 'JSON\.parse\(|\.json\(\)|\bevent\.data\b|as unknown as|\bas any\b|:\s*any\b|\.run<[^>]+>\(' "${no_tests[@]}" || true

echo
echo "Signature and constant-time checks (verify raw bytes before parsing)"
search 'timingSafeEqual|createHmac|crypto\.subtle\.(verify|sign)|verifySignature|[Ss]ignature' "${no_tests[@]}" || true

echo
echo "Schema decode sites"
search 'Schema\.decode(Unknown)?[A-Za-z]*\b|Schema\.fromJsonString|onExcessProperty' "${no_tests[@]}" || true

if ((${#rules[@]} > 0)); then
  echo
  # ast-grep reads --filter as a regex: accept only plain IDs and escape dots. Each ID must
  # also be among the rules sgconfig.yml loads (checked below), so a typo is an error.
  for rule in "${rules[@]}"; do
    [[ "$rule" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "boundary-audit: invalid --rule id: $rule" >&2; exit 2; }
  done
  filter="^($(printf '%s|' "${rules[@]//./\\.}" | sed 's/|$//'))$"
  # Never run code the checkout itself supplies: a committed node_modules (for example a PR
  # adding node_modules/.bin/ast-grep) is refused, and so is an sgconfig.yml that could name
  # native parsers (customLanguages.<lang>.libraryPath), which ast-grep loads with dlopen. An installed
  # node_modules is only as trusted as the install; audit untrusted PRs with a global ast-grep.
  if [[ -n "$(git ls-files -- node_modules | head -1)" ]]; then
    echo "boundary-audit: refusing --rule: node_modules has tracked files in this checkout" >&2; exit 2
  fi
  # Allowlist, not denylist: YAML escapes ("customLanguage\x73") defeat substring checks.
  # Every top-level key must be a safe one; indented lines count only under such a key,
  # so flow-style roots, quoted or escaped keys, and indented root mappings are refused.
  if [[ -f sgconfig.yml ]] && ! awk '
      /^[[:space:]]*(#.*)?$/ { next }
      /^---[[:space:]]*(#.*)?$/ { under_safe = 0; next }
      /^(ruleDirs|utilDirs|testConfigs|languageGlobs|languageInjections):/ { under_safe = 1; next }
      /^[[:space:]]/ && under_safe { next }
      { exit 1 }' sgconfig.yml; then
    echo "boundary-audit: refusing --rule: sgconfig.yml has a top-level key outside ruleDirs, utilDirs, testConfigs, languageGlobs, languageInjections" >&2; exit 2
  fi
  sg=""
  if [[ -x node_modules/.bin/ast-grep ]]; then sg=node_modules/.bin/ast-grep
  elif command -v ast-grep >/dev/null; then sg=ast-grep; fi
  # A requested rule that cannot run is a tool error (exit 2), never a clean result.
  if [[ ! -f sgconfig.yml ]]; then
    echo "boundary-audit: --rule requested but no sgconfig.yml at repo root" >&2; exit 2
  elif [[ -z "$sg" ]]; then
    echo "boundary-audit: --rule requested but ast-grep executable not found; install dependencies" >&2; exit 2
  else
    # Ask ast-grep which rules the config actually loads; a stale rule file outside its
    # ruleDirs must not count. --inspect writes one "entity|rule|<id>:" line per loaded rule.
    loaded=""
    loaded=$("${limit[@]}" "$sg" scan --config sgconfig.yml --inspect entity /dev/null 2>&1 >/dev/null) \
      || { echo "boundary-audit: ast-grep could not list its loaded rules" >&2; exit 2; }
    for rule in "${rules[@]}"; do
      grep -qF "|rule|$rule:" <<<"$loaded" \
        || { echo "boundary-audit: --rule $rule is not loaded by sgconfig.yml" >&2; exit 2; }
    done
    echo "ast-grep rules: ${rules[*]}"
    # --error=<id> promotes only the requested rules, so their warning and hint matches count
    # while unrelated diagnostics (such as unused suppressions) stay at their own severity.
    # ast-grep then exits 1 for any finding; anything higher (including a timeout) is a tool error.
    promote=()
    for rule in "${rules[@]}"; do promote+=("--error=$rule"); done
    sg_status=0
    "${limit[@]}" "$sg" scan --config sgconfig.yml --filter "$filter" "${promote[@]}" --report-style short "${paths[@]}" || sg_status=$?
    if ((sg_status == 1)); then banned=1
    elif ((sg_status > 1)); then echo "boundary-audit: ast-grep failed or timed out (exit $sg_status)" >&2; exit 2; fi
  fi
fi

exit "$banned"
