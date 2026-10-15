@echo off
rem Startet den Server (Seiten + Handy-Abstimmung) und öffnet die Seite im Browser.
rem Benötigt Node.js (https://nodejs.org). Fenster offen lassen, solange du spielst.
cd /d "%~dp0"
start "" http://localhost:8000/
where node >nul 2>nul && (node server\server.js) || (echo Node.js nicht gefunden. Starte einfachen Server ohne Handy-Abstimmung. & (py -m http.server 8000 || python -m http.server 8000))
