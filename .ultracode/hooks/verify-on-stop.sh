#!/usr/bin/env bash
# Stop-Hook: wenn TS-Aenderungen GESTAGED sind (Commit steht bevor), Typecheck als
# Sicherheitsnetz fahren. Advisory: immer exit 0 (blockiert das Beenden nicht, keine Loops).
# Wer es erzwingen will, kann das Ergebnis-`exit 0` unten auf `exit 2` im Fehlerfall umstellen.
set -uo pipefail
payload="$(cat)"

# Loop-Schutz: nicht erneut feuern, wenn bereits durch einen Stop-Hook ausgeloest.
active="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("stop_hook_active", False))
except Exception:
    print(False)' 2>/dev/null || echo False)"
[ "$active" = "True" ] && exit 0

cd "${ULTRACODE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Nur bei gestagten TS-Aenderungen (bewusster Commit-Vorgang) — sonst kein Overhead.
if ! git diff --cached --name-only 2>/dev/null | grep -qE '\.tsx?$'; then
  exit 0
fi

if out="$(pnpm -s typecheck 2>&1)"; then
  echo "verify-on-stop: typecheck OK (gestagte TS-Aenderungen)."
else
  echo "verify-on-stop: typecheck FEHLGESCHLAGEN — vor dem Commit beheben:"
  printf '%s\n' "$out" | tail -15
fi
exit 0
