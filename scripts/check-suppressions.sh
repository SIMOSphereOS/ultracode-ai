#!/usr/bin/env bash
#
# CI-Gate gegen stille TypeScript-Suppressions (ty-Suppression-Ban-Analog).
#
# Regeln:
#   • @ts-ignore / @ts-nocheck  → ÜBERALL verboten. Sie unterdrücken Fehler
#     still und veralten nicht (bleiben stehen, auch wenn der Fehler längst weg
#     ist). Stattdessen den Typfehler beheben oder — nur im Test — @ts-expect-error.
#   • @ts-expect-error          → in Produktions-Source (packages/*/src, ohne
#     *.test.*) verboten; in Tests erlaubt (dort self-documenting und schlägt
#     fehl, wenn der erwartete Fehler ausbleibt).
#
# Exit 0 = sauber, Exit 1 = Verstoß.
set -euo pipefail

fail=0

# 1) @ts-ignore / @ts-nocheck — nirgends erlaubt.
if git grep -nE '@ts-(ignore|nocheck)' -- '*.ts' '*.tsx' >/tmp/uc_suppr_hard.txt 2>/dev/null; then
  echo "✖ @ts-ignore / @ts-nocheck sind verboten (still + nicht selbst-veraltend):" >&2
  cat /tmp/uc_suppr_hard.txt >&2
  echo "  → Typfehler beheben, oder im Test @ts-expect-error nutzen." >&2
  fail=1
fi
rm -f /tmp/uc_suppr_hard.txt

# 2) @ts-expect-error — nur in Tests, nicht in Produktions-Source.
#    Produktions-Source = packages/*/src/**, ohne *.test.ts/tsx.
prod=$(git grep -nE '@ts-expect-error' -- '*.ts' '*.tsx' 2>/dev/null |
  grep -E '^packages/[^/]+/src/' |
  grep -vE '\.test\.(ts|tsx):' || true)
if [ -n "$prod" ]; then
  echo "✖ @ts-expect-error in Produktions-Source verboten (nur in *.test.* erlaubt):" >&2
  echo "$prod" >&2
  echo "  → Typfehler in der Produktions-Logik richtig beheben." >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ Keine unerlaubten TS-Suppressions."
fi
exit "$fail"
