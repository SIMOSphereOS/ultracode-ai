#!/usr/bin/env bash
#
# Kanonischer lokaler CI-Spiegel für ultracode-ai.
# Führt dieselben Schritte in derselben Reihenfolge wie .gitlab-ci.yml aus, damit
# "ist mein Commit CI-grün?" lokal mit einem Kommando beantwortbar ist.
#
# Nutzung:
#   scripts/ci.sh [--fix] [--only "<steps>"] [--skip "<steps>"] [--dry-run]
#
#   Schritte (Reihenfolge): lint suppressions typecheck build test e2e coverage audit
#
#   --fix        Repair-Modus: 'lint' läuft als 'biome check --write' (formatiert +
#                fixt), statt read-only 'biome ci'. Nur lokal sinnvoll; CI ist immer
#                check-only.
#   --only "…"   Nur die genannten Schritte (leerzeichen-getrennt).
#   --skip "…"   Die genannten Schritte auslassen.
#   --dry-run    Nur zeigen, was liefe — nichts ausführen.
#
# Exit != 0, sobald ein Schritt fehlschlägt (set -e via Einzelprüfung).
set -uo pipefail

cd "$(dirname "$0")/.."

ALL_STEPS=(lint suppressions typecheck build test e2e coverage audit)
FIX=0
DRY=0
ONLY=""
SKIP=""

while [ $# -gt 0 ]; do
  case "$1" in
  --fix)
    FIX=1
    shift
    ;;
  --dry-run)
    DRY=1
    shift
    ;;
  --only)
    ONLY="${2:-}"
    shift 2
    ;;
  --skip)
    SKIP="${2:-}"
    shift 2
    ;;
  -h | --help)
    grep -E '^#' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Unbekanntes Argument: $1" >&2
    exit 2
    ;;
  esac
done

want() {
  local step="$1"
  if [ -n "$ONLY" ]; then case " $ONLY " in *" $step "*) : ;; *) return 1 ;; esac fi
  if [ -n "$SKIP" ]; then case " $SKIP " in *" $step "*) return 1 ;; esac fi
  return 0
}

run() {
  local name="$1"
  shift
  if ! want "$name"; then return 0; fi
  echo ""
  echo "──▶ $name: $*"
  if [ "$DRY" -eq 1 ]; then return 0; fi
  if ! "$@"; then
    echo "✖ Schritt '$name' fehlgeschlagen." >&2
    exit 1
  fi
}

# Schritte in CI-Reihenfolge (.gitlab-ci.yml: install_build → test → coverage → security)
if [ "$FIX" -eq 1 ]; then
  run lint pnpm biome check --write .
else
  run lint pnpm biome ci .
fi
run suppressions bash scripts/check-suppressions.sh
run typecheck pnpm typecheck
run build pnpm build
run test pnpm test -- --project shared --project core --project cli
run e2e pnpm test:e2e
run coverage pnpm test:coverage
run audit pnpm audit --audit-level=high

echo ""
echo "✓ CI-Spiegel durchgelaufen."
