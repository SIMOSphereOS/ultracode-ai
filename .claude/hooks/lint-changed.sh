#!/usr/bin/env bash
# PostToolUse(Write|Edit)-Hook: schnelle, compile-freie Pruefung der gerade geaenderten Datei.
# Echte Fehler (.only / debugger) -> exit 2 (Claude soll beheben).
# Stilhinweise (console.log in src) -> exit 0 mit Notiz.
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
case "$fp" in *.ts|*.tsx) ;; *) exit 0 ;; esac
[ -f "$fp" ] || exit 0

issues=""
if grep -Eq '\b(describe|it|test|bench)\.only\(' "$fp"; then
  issues="${issues}- fokussierter Test (.only) laesst die uebrigen Tests aus — entfernen\n"
fi
if grep -Eq '(^|[^A-Za-z_.])debugger([^A-Za-z_]|$)' "$fp"; then
  issues="${issues}- 'debugger'-Statement entfernen\n"
fi

if [ -n "$issues" ]; then
  printf "lint-changed: %s\n%b" "$fp" "$issues" >&2
  exit 2
fi

# Reiner Hinweis (nicht blockierend): console.log in Produktivcode
case "$fp" in
  *.test.ts|*.test.tsx) ;;
  */src/*)
    if grep -Eq '(^|[^.A-Za-z])console\.log\(' "$fp"; then
      echo "Hinweis (lint-changed): console.log in ${fp} — vor Commit pruefen."
    fi
    ;;
esac

exit 0
