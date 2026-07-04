#!/usr/bin/env bash
#
# Branding-Gate (STUFE-1-Direktive): UltraCode ist vollständig unabhängig von
# Claude / Claude Code als Produkt. / Branding gate (level-1 directive):
# UltraCode is fully independent of Claude / Claude Code as a product.
#
# Regel / Rule:
#   • "claude" (case-insensitive) ist im Repo verboten. EINZIGE Ausnahme ist
#     der LLM-Provider-Kontext (AnthropicProvider, claude-*-Modell-IDs,
#     Preis-/Cache-/Kontextfenster-Daten) — und zwar NUR in den unten
#     gepflegten Allowlist-Pfaden. /
#     "claude" (case-insensitive) is forbidden in the repo. The ONLY exception
#     is the LLM provider context (AnthropicProvider, claude-* model ids,
#     price/cache/context-window data) — and ONLY in the allowlisted paths
#     maintained below.
#   • Bewusst streng: KEINE Muster-Ausnahme für claude-*-Strings in beliebigen
#     Dateien — nur die Allowlist-Pfade zählen. /
#     Deliberately strict: NO pattern exception for claude-* strings in
#     arbitrary files — only the allowlisted paths count.
#
# Nutzung / Usage:
#   scripts/check-branding.sh
#
# Das Gate ist strikt: es gibt keine Legacy-Toleranz. Jede "claude"-Erwähnung
# außerhalb der Allowlist-Pfade (LLM-Provider-Kontext) ist ein Verstoß. /
# The gate is strict: there is no legacy tolerance. Any "claude" mention outside
# the allowlisted paths (LLM provider context) is a violation.
#
# Exit 0 = sauber / clean, Exit 1 = Verstoß / violation, Exit 2 = Bedienfehler / usage error.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
"") ;;
-h | --help)
  awk 'NR>1 && !/^#/{exit} NR>1{sub(/^# ?/,""); print}' "$0"
  exit 0
  ;;
*)
  echo "Unbekanntes Argument / unknown argument: $1 (keine Argumente erwartet / no arguments expected)" >&2
  exit 2
  ;;
esac

# ── Allowlist (Pfad-Präfixe, hier pflegen / path prefixes, maintain here) ─────
# Jeder Eintrag braucht eine Begründung im LLM-Provider-Kontext. /
# Every entry needs a justification in LLM provider context.
ALLOWLIST=(
  "packages/core/src/providers/"          # AnthropicProvider + Tests + cacheHint + Modellkatalog / model catalog
  "packages/core/src/budget/"             # Preis-Tabellen für claude-*-Modelle / price tables for claude-* models
  "packages/core/src/session-optimizer/"  # Kontextfenster-/Modell-Daten (claude-*) / context-window model data
  "packages/core/src/config/env.test.ts"  # ANTHROPIC_API_KEY-/Provider-Env-Tests / provider env tests
  "scripts/check-branding.sh"             # dieses Gate selbst / this gate itself
  "README.md"                             # Provider-Konfig-Beispiel (active_provider anthropic, claude-*) / provider config example
  "docs/DEVELOPMENT/architecture.md"      # LLM-Provider-Liste ("Anthropic Claude") / LLM provider list
  "docs/ENTERPRISE/self-hosting.md"       # Fallback-Provider-Beispiel (model: claude-3-sonnet) / fallback provider example
  "docs/ENTERPRISE/team-collaboration.md" # Modell-Permission-Beispiel (claude-3-sonnet) / model permission example
  "docs/REFERENCE/api.md"                 # Usage-Statistik-Beispiel mit Modell-IDs / usage stats example with model ids
  "docs/REFERENCE/parameters.md"          # Preis-/Routing-Tabellen (claude-3-5-*) / price + routing tables
)

# Alle Treffer einsammeln (Format: pfad:zeile:inhalt). / Collect all hits.
hits="$(grep -rIn -i -e 'claude' \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=coverage \
  --exclude-dir=dist \
  --exclude-dir=.pnpm-store \
  --exclude=pnpm-lock.yaml \
  . 2>/dev/null | sed 's|^\./||' || true)"

violations=""

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  path="${hit%%:*}"

  # Allowlist-Pfade (Provider-Kontext) sind erlaubt. / Allowlisted paths pass.
  allowed=0
  for prefix in "${ALLOWLIST[@]}"; do
    case "$path" in
    "$prefix"*)
      allowed=1
      break
      ;;
    esac
  done
  [ "$allowed" -eq 1 ] && continue

  violations+="$hit"$'\n'
done <<<"$hits"

if [ -n "$violations" ]; then
  {
    echo "✖ Branding-Verstoß: 'claude' außerhalb der Allowlist gefunden / branding violation: 'claude' found outside the allowlist:"
    printf '%s' "$violations"
    echo ""
    echo "  Branding-Direktive (Stufe 1): UltraCode ist vollständig unabhängig von Claude/Claude Code."
    echo "  Erlaubt ist AUSSCHLIESSLICH der LLM-Provider-Kontext (AnthropicProvider, claude-*-Modell-IDs,"
    echo "  Preis-/Cache-/Kontextfenster-Daten) in den Allowlist-Pfaden dieses Scripts."
    echo "  → Erwähnung entfernen oder auf UC-AI bzw. produktneutral (\"AI coding assistants\") umformulieren;"
    echo "    echten Provider-Kontext ggf. mit Begründung in der Allowlist oben freigeben."
    echo "  Branding directive (level 1): UltraCode is fully independent of Claude/Claude Code."
    echo "  ONLY the LLM provider context (AnthropicProvider, claude-* model ids, price/cache/context-window"
    echo "  data) inside this script's allowlisted paths is permitted."
    echo "  → Remove the mention or rephrase to UC-AI / product-neutral wording (\"AI coding assistants\");"
    echo "    genuine provider context may be allowlisted above with a justification."
  } >&2
  exit 1
fi

echo "✓ Branding sauber: keine Claude-Erwähnung außerhalb des Provider-Kontexts. / Branding clean: no Claude mention outside provider context."
