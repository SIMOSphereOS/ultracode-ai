#!/usr/bin/env bash
# SessionStart-Hook: kurzer Repo-Statusabriss als Kontext.
# stdout wird vom UltraCode-Assistenten als Session-Kontext eingespeist. Immer exit 0.
set -uo pipefail
cd "${ULTRACODE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

branch="$(git branch --show-current 2>/dev/null || echo '?')"
last="$(git log --oneline -1 2>/dev/null || echo '?')"
dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

echo "UltraCode | Branch: ${branch} | ${last} | uncommitted: ${dirty} Datei(en)"
echo "Konvention: vor Commit 'pnpm -s typecheck && pnpm -s test' (Baseline gruen halten); auf main zuerst branchen."
exit 0
