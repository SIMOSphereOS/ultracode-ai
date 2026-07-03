#!/usr/bin/env bash
#
# SIMO-Release-Konsistenz-Gate (simo-release-management-Standard).
# Stellt sicher, dass die Release-Artefakte nicht auseinanderdriften:
#   • VERSION == currentVersion in .release.json
#   • VERSION == Version aller package.json (root + packages/*)  → Lock-Step-Monorepo
#   • CHANGELOG.md hat einen ## [Unreleased]-Abschnitt
#   • CHANGELOG.md hat einen ## [VERSION]-Abschnitt (die aktuelle Version ist dokumentiert)
#
# Exit 0 = konsistent, Exit 1 = Drift.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

if [ ! -f VERSION ]; then
  echo "✖ VERSION-Datei fehlt." >&2
  exit 1
fi
VERSION="$(tr -d ' \t\n\r' <VERSION)"
if [ -z "$VERSION" ]; then
  echo "✖ VERSION ist leer." >&2
  exit 1
fi
echo "VERSION = $VERSION"

pkg_version() { node -e "process.stdout.write(String(require('./$1').version))"; }

for f in package.json packages/shared/package.json packages/core/package.json packages/cli/package.json; do
  v="$(pkg_version "$f")"
  if [ "$v" != "$VERSION" ]; then
    echo "✖ $f: version '$v' ≠ VERSION '$VERSION'" >&2
    fail=1
  fi
done

rel="$(node -e "process.stdout.write(String(require('./.release.json').currentVersion))")"
if [ "$rel" != "$VERSION" ]; then
  echo "✖ .release.json currentVersion '$rel' ≠ VERSION '$VERSION'" >&2
  fail=1
fi

if ! grep -qE '^## \[Unreleased\]' CHANGELOG.md; then
  echo "✖ CHANGELOG.md: Abschnitt [Unreleased] fehlt." >&2
  fail=1
fi
if ! grep -qE "^## \[${VERSION//./\\.}\]" CHANGELOG.md; then
  echo "✖ CHANGELOG.md: Abschnitt [$VERSION] fehlt (aktuelle Version nicht dokumentiert)." >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ Release-Artefakte konsistent (VERSION ↔ package.json ↔ .release.json ↔ CHANGELOG)."
fi
exit "$fail"
