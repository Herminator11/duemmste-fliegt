#!/bin/sh
# Legt für ein neues Feature einen Branch feature/<name> von aktuellem main an und schiebt ihn.
# Aufruf: scripts/feature.sh abstimmung-stichwahl
set -e
name=$(printf '%s' "$1" | tr 'A-Z ' 'a-z-' | tr -cd 'a-z0-9-')
[ -n "$name" ] || { echo "Aufruf: scripts/feature.sh <kurzer-name>" >&2; exit 1; }
if git remote get-url origin >/dev/null 2>&1; then git fetch -q origin main 2>/dev/null && git checkout -q main && git merge -q --ff-only origin/main 2>/dev/null || true; else git checkout -q main; fi
git checkout -b "feature/$name"
git remote get-url origin >/dev/null 2>&1 && git push -q -u origin "feature/$name" || true
echo "Branch feature/$name bereit."
