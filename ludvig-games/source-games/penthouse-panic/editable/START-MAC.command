#!/bin/bash
# Open the game folder even when launched by double-clicking in Finder.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js saknas. Installera aktuell LTS-version från https://nodejs.org/"
  echo "Dubbelklicka sedan på START-MAC.command igen."
  read -r -p "Tryck Enter för att stänga. "
  exit 1
fi
node serve.mjs --open
result=$?
if [ "$result" -ne 0 ]; then
  read -r -p "Tryck Enter för att stänga. "
fi
exit "$result"
