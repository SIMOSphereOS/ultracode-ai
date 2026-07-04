#!/usr/bin/env bash
#
# Dateigröße-Gate (File-size gate): begrenzt die Zeilenzahl von TypeScript-
# Quelldateien, damit Module fokussiert und wartbar bleiben (Clean Code: kleine
# Einheiten, Single Responsibility). /
# File-size gate: caps the line count of TypeScript source files so modules stay
# focused and maintainable (Clean Code: small units, single responsibility).
#
# Regeln / Rules:
#   • FAIL (exit 1), wenn eine Datei > MAX_LINES (Default 1000) hat. /
#     FAIL (exit 1) if a file exceeds MAX_LINES (default 1000).
#   • WARN (nicht-fatal, exit bleibt 0), wenn eine Datei > WARN_LINES
#     (Default 800) hat. /
#     WARN (non-fatal, exit stays 0) if a file exceeds WARN_LINES (default 800).
#
# Scan-Bereich / Scan scope:
#   packages/*/src/**/*.ts   (dist/ ausgenommen / dist/ excluded)
#
# Konfiguration via Env / Configuration via env:
#   ULTRACODE_MAX_FILE_LINES    Fatal-Schwelle / fatal threshold (Default 1000)
#   ULTRACODE_WARN_FILE_LINES   Warn-Schwelle / warn threshold   (Default 800)
#
# Nutzung / Usage:
#   scripts/check-file-size.sh
#
# Exit 0 = ok (keine Datei > MAX) / no file over MAX, Exit 1 = Verstoß / violation.
set -euo pipefail
cd "$(dirname "$0")/.."

MAX_LINES="${ULTRACODE_MAX_FILE_LINES:-1000}"
WARN_LINES="${ULTRACODE_WARN_FILE_LINES:-800}"

warn_count=0
fail_count=0
warnings=""
failures=""

# packages/*/src/**/*.ts einsammeln, dist/ überall ausschließen. /
# Collect packages/*/src/**/*.ts, excluding any dist/ tree.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  lines="$(wc -l <"$file")"
  if [ "$lines" -gt "$MAX_LINES" ]; then
    failures+="  ${file}: ${lines} Zeilen / lines (> ${MAX_LINES})"$'\n'
    fail_count=$((fail_count + 1))
  elif [ "$lines" -gt "$WARN_LINES" ]; then
    warnings+="  ${file}: ${lines} Zeilen / lines (> ${WARN_LINES})"$'\n'
    warn_count=$((warn_count + 1))
  fi
done < <(find packages -type d -name dist -prune -o -type f -path '*/src/*' -name '*.ts' -print | sort)

# Warnungen (nicht-fatal) / warnings (non-fatal).
if [ -n "$warnings" ]; then
  {
    echo "⚠ Dateigröße-Warnung: Dateien über ${WARN_LINES} Zeilen (bald aufteilen) / file-size warning: files over ${WARN_LINES} lines (split soon):"
    printf '%s' "$warnings"
    echo "  → Refactoring erwägen: Extract Class / Extract Method, um Verantwortlichkeiten zu trennen."
    echo "  → Consider refactoring: Extract Class / Extract Method to separate responsibilities."
  } >&2
fi

# Verstöße (fatal) / violations (fatal).
if [ -n "$failures" ]; then
  {
    echo "✖ Dateigröße-Verstoß: Dateien über ${MAX_LINES} Zeilen (Hard-Limit) / file-size violation: files over ${MAX_LINES} lines (hard limit):"
    printf '%s' "$failures"
    echo ""
    echo "  Regel: Keine Quelldatei darf ${MAX_LINES} Zeilen überschreiten. Übergroße Dateien"
    echo "  verletzen das Single-Responsibility-Prinzip und erschweren Review, Test und Wartung."
    echo "  → Datei per Extract Class / Extract Method in kleinere, fokussierte Module aufteilen."
    echo "  Rule: no source file may exceed ${MAX_LINES} lines. Oversized files violate the"
    echo "  single-responsibility principle and make review, testing and maintenance harder."
    echo "  → Split the file into smaller, focused modules via Extract Class / Extract Method."
    echo "  (Schwellen via Env überschreibbar / thresholds overridable via env:"
    echo "   ULTRACODE_MAX_FILE_LINES, ULTRACODE_WARN_FILE_LINES.)"
  } >&2
  exit 1
fi

echo "✓ Dateigröße ok: keine Datei über ${MAX_LINES} Zeilen (${warn_count} Warnung(en) > ${WARN_LINES}). / File size ok: no file over ${MAX_LINES} lines (${warn_count} warning(s) > ${WARN_LINES})."
