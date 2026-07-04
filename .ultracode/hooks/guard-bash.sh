#!/usr/bin/env bash
# PreToolUse(Bash)-Hook: blockt offensichtlich destruktive Shell-Befehle.
# Kontrakt: exit 0 = erlauben, exit 2 = blockieren (stderr geht an den Assistenten).
# Bewusst konservativ gehalten (geringe False-Positive-Rate).
set -uo pipefail
payload="$(cat)"

cmd="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin)
    print(d.get("tool_input",{}).get("command",""))
except Exception:
    print("")' 2>/dev/null || echo "")"

[ -z "$cmd" ] && exit 0

deny() {
  echo "guard-bash: blockiert ($1). Falls beabsichtigt: Befehl anpassen oder manuell ausfuehren." >&2
  exit 2
}

# Hart destruktiv
case "$cmd" in
*"rm -rf /"* | *"rm -rf /*"* | *"rm -rf ~"* | *"rm -fr /"*) deny "rm -rf auf Root/Home" ;;
*":(){ :|:& };:"*) deny "Fork-Bomb" ;;
*"mkfs"* | *"> /dev/sd"* | *"of=/dev/sd"*) deny "Datentraeger-Ueberschreibung" ;;
esac

# Git-Schutz
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push([[:space:]].*)?[[:space:]](-f|--force|--force-with-lease)\b'; then
  deny "git force-push"
fi
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push([[:space:]]+origin)?[[:space:]]+main\b'; then
  deny "direkter Push auf main — bitte ueber Branch/PR"
fi

exit 0
