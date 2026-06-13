#!/usr/bin/env bash
# PreToolUse(Write|Edit)-Hook: schuetzt generierte/gesperrte Artefakte vor Direktbearbeitung.
# Kontrakt: exit 0 = erlauben, exit 2 = blockieren (stderr geht an Claude).
set -uo pipefail
payload="$(cat)"

fp="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    ti=d.get("tool_input",{})
    print(ti.get("file_path") or ti.get("path") or "")
except Exception:
    print("")' 2>/dev/null || echo "")"

[ -z "$fp" ] && exit 0

deny() { echo "protect-paths: '$fp' ist geschuetzt ($1)." >&2; exit 2; }

case "$fp" in
  *pnpm-lock.yaml)   deny "Lockfile nur ueber pnpm aendern" ;;
  */node_modules/*)  deny "node_modules ist generiert" ;;
  */dist/*)          deny "dist ist Build-Artefakt (aus Quellcode generiert)" ;;
  */coverage/*)      deny "coverage ist generiert" ;;
  */.git/*)          deny ".git-Interna nicht direkt bearbeiten" ;;
esac

exit 0
