# Der Dümmste fliegt – Host-Oberfläche

Eine lokale Seite für den Spielleiter. Kein Server und keine Cloud nötig, alle Daten bleiben in deinem Browser.

## Starten

**Mit Server (empfohlen, nötig für Handy-Abstimmung):** `start.sh` (Mac/Linux) oder `start.bat` (Windows) starten, oder im Ordner `npm start`. Benötigt Node.js (ab Version 18), sonst keine Pakete. Die Seite öffnet unter `http://localhost:8000/`, im Terminal steht auch die WLAN-Adresse für die Handys.

**Ohne Server:** `index.html` per Doppelklick öffnen. Alles außer Handy-Abstimmung funktioniert. Falls der Browser das Speichern blockiert (oben erscheint ein oranger Hinweis), nimm den Server oder `python3 -m http.server`.

Wichtig: `index.html` per Doppelklick und `localhost:8000` sind für den Browser zwei getrennte Orte mit getrennten Daten. Bleib bei einem Weg, oder übertrage Daten über „Sichern“ und „Wiederherstellen“ auf der Startseite.

## Handy-Abstimmung (Online-Raum)
1. Server starten, Master-Seite über den Server öffnen, auf der Startseite Spieler anlegen.
2. Bei „Online-Raum (Handys)“ auf **Raum öffnen** klicken. Es erscheint ein vierstelliger Code und ein Link.
3. Spieler öffnen den Link `…/join.html?room=CODE` am Handy (gleiches WLAN, oder die öffentliche Adresse des Servers) und tippen ihren Namen an. Ein Name kann nur ein Handy belegen. Bei Verwechslung gibt der Master ihn mit „Freigeben“ wieder frei.
4. Nach jeder Session erscheint die Abstimmung auf den Handys. Jeder wählt geheim, wer die dümmste Antwort gegeben hat, und kann bis zur Auflösung ändern. Der Master sieht nur, wer schon gestimmt hat. Mit „Auflösen“ holt er die Stimmen, bei Gleichstand entscheidet er. Ergebnis und Leben erscheinen auf allen Handys und dem Game Screen.
5. Auf den Handys sieht jeder außerdem nach Rundenende die letzte Frage, die veröffentlichten Aussagen und den Rundenverlauf aller Spieler zum Aufklappen.
6. Game Screen auf einem anderen Gerät (Fernseher): „Link für Game Screen kopieren“ und dort öffnen. Im selben Browser genügt „Game Screen öffnen“.

Was der Server weiß: nur die öffentliche Sicht (Namen, Leben, veröffentlichte Aussagen, Ergebnisse) und die geheimen Stimmen. Das Spiel selbst und die Fragen bleiben auf dem Master-Gerät. Eine richtige Antwort geht erst zum Server, wenn du die Aussagen zu dieser Frage veröffentlichst. Räume liegen im Speicher und in `server/data/rooms.json` und verfallen nach 24 Stunden ohne Aktivität. Fällt die Verbindung weg, verbinden sich Handys und Master von selbst wieder. Der Master kann ohne Server weiterspielen und die Stimmen von Hand eintragen.

**Öffentlich betreiben** (Spieler an verschiedenen Orten): `node server/server.js` auf einem beliebigen Node-Hoster laufen lassen (zum Beispiel Render, Railway, Fly.io), `PORT` kommt aus der Umgebung. Wichtig: HTTPS, das übernimmt der Hoster. Es gibt keine Anmeldung. Wer den Raumcode kennt, kann beitreten und einen freien Namen wählen.

## Spielregeln und Avatare
- **Stimmen anonym oder offen** (Startseite „Spielregeln“ und im Abstimmungsfeld): Anonym ist Standard, dann sehen alle nur die Stimmenzahl je Spieler. Bei „offen“ sieht man zusätzlich, wer wen gewählt hat. Der Master kann bis zum Auflösen wechseln. Außerdem einstellbar: „Zeigen, wer schon gestimmt hat“ (grüner Rand und Häkchen) und „Automatisch auflösen, sobald alle gestimmt haben“ (nur mit Online-Raum).
- **Wer ist dran:** Es geht reihum in der Reihenfolge der Spielerliste. Der Spieler, der gerade dran ist, ist beim Master, auf dem Game Screen (leuchtender Rand, „Dran“) und am eigenen Handy („Du bist dran!“) markiert. „Nächste Frage“ springt zum nächsten, in der Spielerliste kann der Master mit „dran“ jemanden vorziehen. Die grünen und roten Ergebnispunkte erscheinen erst nach Rundenende, ab der Abstimmung.
- **Abstimmung:** Selbstwahl ist erlaubt. Es verliert genau einer. Bei Gleichstand beginnt sofort eine Stichwahl, in der nur die Gleichstehenden zur Wahl stehen (alle dürfen weiter wählen). Geht auch die zweite Stichwahl gleich aus, bestimmt der Master den Verlierer.
- **0 Leben:** Wer keine Leben mehr hat, ist ausgegraut, bekommt keine Fragen, wählt nicht mit und steht nicht zur Wahl. Über das Zahnrad in der Spielerliste kann der Master ihn entfernen, so lassen oder zum **Geist** machen. Ein Geist steht nie zur Wahl. Der Master stellt ein, ob er weiter mitwählt und ob er weiter Fragen bekommt.
- **Finale:** Bei nur noch zwei Lebenden erscheint ein Hinweis. Die Finalregeln sind noch nicht festgelegt.
- **Figuren:** Jeder Spieler hat sofort eine Figur aus seinem Namen. Am Handy (Knopf „Figur“) und am Master (Startseite, Knopf „Figur“ beim Spieler) kann man sie bauen (Stil Open Peeps oder Lorelei, Zufall, Frisur, Gesicht, Farben) oder selbst zeichnen. Der Master kann Figuren zurücksetzen.
- Gezeichnete Bilder sind kleine PNG-Dateien (höchstens 30 KB). Der Server nimmt nur PNG an, prüft Kopfzeile und Größe und liefert sie mit Schutz-Headern aus. Von Nutzern kommt nie SVG.

## Host-Ansicht „Spiel“ (Bühne)
Die Master-Ansicht (`#/spiel`) ist die „Bühne“. Die frühere Listen-Ansicht (A) gibt es nicht mehr, der alte Link `#/host-b` leitet hierher um. Die Spieler sind die Spieler Kacheln wie auf dem Game Screen. Leben ändert man per Klick auf die Herzen (volles Herz entfernt eins, leeres fügt eins hinzu). Beim Darüberfahren erscheinen „Dran setzen“ und „Zum Geist machen“, das Zahnrad öffnet die Einstellungen des Spielers. Oben liegt eine feste Leiste (Timer, Session, Spielregeln, Vollbild, Taste F), unten eine feste Leiste mit den Fragen zum Umdrehen und der Antwort-Eingabe. Wer nach unten scrollt, findet Abstimmung im Detail, Aussagen je Spieler und frühere Sessions. **Ablauf:** Unten steht immer die aktuelle Frage mit der richtigen Antwort, und zwar für den Spieler, der dran ist. Das Textfeld ist automatisch aktiv. War die Antwort richtig, genügt ein Klick auf **Richtig** (oder Alt+1). Wenn nicht, tippst du die falsche Antwort ein und drückst **Enter** oder „Falsch senden“ (oder Alt+2). Beides speichert die Antwort und geht sofort zur nächsten Frage und zum nächsten Spieler. Eine eingetippte Antwort gilt immer als falsch. „Keine Antwort“ gibt es nicht. Enter bei leerem Feld macht nichts. Auf jeder Kachel zeigt ein Kreis je Frage, wie oft der Spieler dran war (grün, rot, grau, der laufende blinkt). Der Game Screen zeigt Kreise, richtige Antwort und Aussagen weiterhin erst nach Rundenende. Der Code steht in `js/view-spiel.js`.

## Bereiche
- **Start:** Spielstand, Spiel starten oder fortsetzen, Neues Spiel, Datensicherung.
- **Fragen:** alle Fragen ansehen, suchen, hinzufügen (einzeln oder mehrere im Textformat), bearbeiten, löschen, „Hier weiterspielen“.
- **Spiel (Master-Ansicht, Bühne):** Timer, aktuelle Frage mit Antwort, Antwort des Spielers eintragen (Richtig-Klick oder falsche Antwort + Enter, Alt+1/2), Abstimmung „dümmste Antwort“ eintragen und auflösen, Leben anpassen, frühere Sessions, Aussagen je Spieler.
- **Spieler:** auf der Startseite anlegen, Leben pro Spieler einstellen. „Neues Spiel“ setzt die Leben zurück, die Namen bleiben.
- **Game Screen** (`#/anzeige`, „Game Screen öffnen“ auf der Startseite): eigenes Fenster für Fernseher oder Discord-Screenshare. Zeigt Spieler, Leben, ein Ergebnis-Kreis je Frage, veröffentlichte Aussagen und das Abstimmungsergebnis. Während der Runde erscheint keine Frage. Nach Rundenende zeigt der Hover über einen Kreis Frage, richtige Antwort und die Antwort des Spielers (die richtige Antwort erst nach „Auf Game Screen zeigen“). `#/anzeige?demo` ist eine Testanzeige mit festen Beispieldaten. Entwürfe des Masters bleiben verborgen, bis er „Auf Game Screen zeigen“ klickt. Beide Fenster müssen im selben Browser laufen.

## Ordner
```
index.html          Rahmen mit Top-Leiste
css/style.css       Aussehen
fonts/              Schriften (eingebettet, kein Internet nötig)
js/seed.js          die 499 Ausgangsfragen (wird nur beim allerersten Start gelesen)
js/store.js         Speicher und Spiellogik (hier ändert sich später etwas, wenn ein Server dazukommt)
js/util.js          kleine Hilfen
js/net.js           Verbindung zum Server (Raum, Strom, Stimmen, Figuren)
js/avatar.js        Figuren: bauen (DiceBear) oder zeichnen, anzeigen
js/draw.js          Zeichenfeld für die eigene Figur
js/icons.js         Spiel-Icons (game-icons.net)
js/vendor/          DiceBear (MIT) mit den Stilen Open Peeps und Lorelei (Design CC0), Lizenztexte in LICENSES.txt
js/player.js        Handy-Seite für Spieler (join.html)
server/server.js    Server: Seiten, Räume, geheime Stimmen (ohne Pakete)
server/test.js      Test des Servers (npm test)
tests/store.test.js Test der Spiellogik (npm test)
js/view-*.js        eine Datei pro Seite
js/app.js           Seitenwechsel, Top-Leiste, Takt
tests/              automatischer Test (optional)
```

## Grenzen
- Daten liegen nur in diesem Browser auf diesem Gerät. Löschst du die Browserdaten, sind sie weg. Regelmäßig sichern.
- Kein Abgleich zwischen Handy und Laptop.
- „Neues Spiel“ löscht das alte Spiel endgültig. Die Fragen bleiben und laufen weiter.

## Fremdbausteine
Schriften (lokal in `fonts/`): Bowlby One (SIL OFL 1.1, Lizenz in `fonts/bowlby-one-OFL.txt`), Bricolage Grotesque und Atkinson Hyperlegible. Gestaltungsvorgaben für künftige Änderungen stehen in `CLAUDE.md`.

Icons (Herzen, Totenkopf, Pokal, Häkchen und weitere): [game-icons.net](https://game-icons.net) von Lorc, Delapouite, Skoll, sbed und Zeromancer, Lizenz [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Die Namen der verwendeten Icons und ihrer Autoren stehen in `js/vendor/ICONS.txt`, ein Hinweis steht auch unten auf der Startseite. Die Icons liegen in `js/icons.js` und werden als Maske in der Textfarbe gezeichnet.

Figuren-Generator: [DiceBear](https://www.dicebear.com/) (MIT). Stile: Open Peeps von Pablo Stanley und Lorelei von Lisa Wischofsky, beide CC0 (keine Namensnennung nötig, hier trotzdem genannt). Die Dateien liegen lokal in `js/vendor/`, es wird nichts von Fremdservern geladen. Lizenztexte: `js/vendor/LICENSES.txt`.

## Git-Arbeitsweise
- `main` ist immer lauffähig (`npm test` grün). Keine direkten Commits auf `main` (blockiert der Hook `.githooks/pre-commit`).
- Pro Feature oder Fehlerbehebung ein Branch: `scripts/feature.sh <name>` legt `feature/<name>` an (Fehler: danach von Hand `fix/<name>`).
- Kleine, in sich stimmige Commits mit Nachrichten nach Conventional Commits: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …`, `chore: …`. Im Imperativ, Betreff unter 72 Zeichen.
- Jeder Commit wird automatisch nach `origin/<branch>` gepusht (`.githooks/post-commit`). Ohne Remote bleibt er lokal.
- Fertig = Pull Request nach `main`, Tests laufen, dann Merge und Branch löschen. Kein Force-Push auf `main`.
- Einmalig nach dem Klonen: `git config core.hooksPath .githooks`. Remote anlegen: `git remote add origin <URL>` und `git push -u origin main`.
