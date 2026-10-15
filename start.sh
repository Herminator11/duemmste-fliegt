#!/bin/sh
# Startet den Server (Seiten + Handy-Abstimmung) und öffnet die Seite im Browser.
# Benötigt Node.js (https://nodejs.org). Ohne Node: einfacher Python-Server, dann ohne Handy-Abstimmung.
# Zum Beenden Strg+C drücken.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8000}"
( sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT/") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/") ) &
if command -v node >/dev/null; then
  PORT="$PORT" node server/server.js
else
  echo "Node.js nicht gefunden. Starte einfachen Server ohne Handy-Abstimmung."
  python3 -m http.server "$PORT"
fi
