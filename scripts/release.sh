#!/usr/bin/env bash
#
# SIMO-Release-Bump (Lock-Step-Monorepo, simo-release-management-Standard).
#
# Nutzung:
#   scripts/release.sh <major|minor|patch|X.Y.Z> [--no-verify]
#
# Wirkung:
#   1. Ermittelt die neue Version (Bump aus VERSION oder explizit X.Y.Z).
#   2. Schreibt VERSION, .release.json (currentVersion) und ALLE package.json
#      (root + packages/*) auf die neue Version — Lock-Step.
#   3. Rollt CHANGELOG.md: ## [Unreleased] → ## [NEW] - DATUM, neues leeres
#      [Unreleased] darüber.
#   4. Führt den preRelease-Hook (pnpm ci:local) aus, außer --no-verify.
#
# Bewusst KEIN git commit / tag: erst Review, dann manuell
#   git commit -am "chore(release): vNEW" && git tag -a vNEW -m "…" && git push --follow-tags
# (Der v*-Tag triggert die npm-Publikation via .gitlab-ci.yml.)
set -euo pipefail
cd "$(dirname "$0")/.."

BUMP="${1:-}"
VERIFY=1
[ "${2:-}" = "--no-verify" ] && VERIFY=0
if [ -z "$BUMP" ]; then
  echo "Usage: scripts/release.sh <major|minor|patch|X.Y.Z> [--no-verify]" >&2
  exit 2
fi

CURRENT="$(tr -d ' \t\n\r' <VERSION)"
IFS='.' read -r MA MI PA <<<"$CURRENT"

case "$BUMP" in
major) NEW="$((MA + 1)).0.0" ;;
minor) NEW="${MA}.$((MI + 1)).0" ;;
patch) NEW="${MA}.${MI}.$((PA + 1))" ;;
[0-9]*.[0-9]*.[0-9]*) NEW="$BUMP" ;;
*)
  echo "Ungültiger Bump: $BUMP (major|minor|patch|X.Y.Z)" >&2
  exit 2
  ;;
esac

echo "Release-Bump: $CURRENT → $NEW"

# VERSION
printf '%s\n' "$NEW" >VERSION

# package.json (root + packages/*) — Lock-Step
for f in package.json packages/shared/package.json packages/core/package.json packages/cli/package.json; do
  node -e '
    const fs = require("fs");
    const f = process.argv[1], v = process.argv[2];
    const p = JSON.parse(fs.readFileSync(f, "utf8"));
    p.version = v;
    fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
  ' "$f" "$NEW"
done

# .release.json currentVersion
node -e '
  const fs = require("fs");
  const v = process.argv[1];
  const p = JSON.parse(fs.readFileSync(".release.json", "utf8"));
  p.currentVersion = v;
  fs.writeFileSync(".release.json", JSON.stringify(p, null, 2) + "\n");
' "$NEW"

# CHANGELOG: [Unreleased] → [NEW] - DATUM (+ neues leeres [Unreleased])
DATE="$(date +%Y-%m-%d)"
node -e '
  const fs = require("fs");
  const [nv, date] = process.argv.slice(1);
  let c = fs.readFileSync("CHANGELOG.md", "utf8");
  if (!/^## \[Unreleased\]/m.test(c)) {
    console.error("✖ CHANGELOG.md hat keinen [Unreleased]-Abschnitt."); process.exit(1);
  }
  c = c.replace(/^## \[Unreleased\]\s*$/m, `## [Unreleased]\n\n## [${nv}] - ${date}`);
  fs.writeFileSync("CHANGELOG.md", c);
' "$NEW" "$DATE"

echo "Artefakte aktualisiert (VERSION, package.json ×4, .release.json, CHANGELOG)."

if [ "$VERIFY" -eq 1 ]; then
  echo "preRelease-Hook: pnpm ci:local"
  pnpm ci:local
fi

echo ""
echo "✓ Bump auf $NEW vorbereitet. Nächste Schritte (nach Review):"
echo "    git commit -am \"chore(release): v$NEW\""
echo "    git tag -a \"v$NEW\" -m \"Release v$NEW\"   # v*-Tag triggert npm-Publish (.gitlab-ci.yml)"
echo "    git push --follow-tags"
