# Testskript – Der Dümmste fliegt (Ordner-Version)

Öffne `index.html` per Doppelklick. Trage bei jedem Schritt **OK** oder **Fehler** ein. Bei „Fehler“ bitte kurz notieren, was du gesehen hast, auf welchem Gerät und mit welchem Browser.

Tipp: Zum Testen der Timer-Schritte nimm kurze Zeiten (0 Min, 10 Sek).

## A. Start und Navigation

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| A1 | Seite öffnen | „Neues Spiel“, „499 Fragen bereit“, erste Frage als Vorschau, kein oranger Hinweis oben | |
| A2 | Oben „Fragen“, „Spiel“, „Start“ anklicken | Seite wechselt, die aktive Seite hat einen farbigen Strich darunter | |
| A3 | Browser-Zurück-Taste benutzen | Geht zur vorherigen Seite zurück | |

## B. Fragen

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| B1 | Seite „Fragen“ | Alle Fragen untereinander, nummeriert, Nr. 1 mit Marke „als Nächstes“ | |
| B2 | Ganz nach unten scrollen | Letzte Nummer ist 499 | |
| B3 | Suchfeld: „Dutzend“ | Es bleibt 1 Frage, darüber „1 von 499 Fragen passen zur Suche“ | |
| B4 | Suche nach Antwort, z. B. „Riot“ | Findet die Frage zum Entwicklerstudio | |
| B5 | „+ Neue Frage“: nur Frage ausfüllen, speichern | Meldung „Bitte Frage und Antwort ausfüllen“ | |
| B6 | Frage und Antwort ausfüllen, speichern | Meldung „Frage hinzugefügt als Nr. 503“, Frage steht am Ende | |
| B7 | „Mehrere einfügen“: zwei Fragen im Format „Frage“ + Zeile „A: Antwort“, Absatz dazwischen | „2 Frage(n) hinzugefügt“ | |
| B8 | Eine Frage „Bearbeiten“, Text ändern, „Speichern“ | Änderung sichtbar | |
| B9 | „Bearbeiten“, Frage leeren, „Speichern“ | Wird abgelehnt | |
| B10 | „Löschen“ | Rückfrage „Wirklich löschen?“, bei „Abbrechen“ bleibt die Frage | |
| B11 | „Löschen“ → „Ja, löschen“ | Frage weg, Nummern darunter rücken auf | |
| B12 | Seite neu laden (F5) | Alle Änderungen sind noch da | |
| B13 | Bei einer späteren Frage „Hier weiterspielen“ | Marke „als Nächstes“ wandert dorthin | |

## C. Spiel

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| C1 | Seite „Spiel“ | Felder Min und Sek, Button „Session 1 starten“, Hinweis mit der ersten Frage | |
| C2 | Min 0, Sek 0, starten | Meldung „Die Dauer muss größer als 0 sein“ | |
| C3 | Sek 75, starten | Meldung zu ungültigen Sekunden | |
| C4 | Min 0, Sek 20, starten | Session 1 in Gelb-Orange, Timer zählt von 00:20, Balken schrumpft | |
| C5 | Aktuelle Frage und Antwort ansehen | Frage riesig, Antwort deutlich kleiner mit Balken links | |
| C6 | „Nächste Frage“ | Neue Frage gleitet ein, vorherige steht unter „Gespielt in Session 1“ | |
| C7 | Taste Pfeil rechts (Laptop) | Wie „Nächste Frage“ | |
| C8 | „Pause“, 5 s warten, „Weiter“ | Timer steht in der Pause und läuft danach weiter | |
| C9 | Letzte 10 Sekunden | Timer wird rot und blinkt | |
| C10 | Zeit läuft ab | Session endet von selbst, Timer 00:00 rot, „beendet“, nichts verschwindet | |
| C11 | Nach dem Ende: Liste „Gespielt“ ansehen | Alle Fragen da, auch die zuletzt gezeigte | |
| C12 | Neue Session mit 1 Min starten | Session 2 in Grün, macht bei der nächsten Frage weiter | |
| C13 | Rechts bzw. unten „Frühere Sessions“ aufklappen | Session 1 mit Fragen in Gelb-Orange | |
| C14 | „Session beenden“ | Rückfrage, bei „Abbrechen“ läuft es weiter, bei „Ja, beenden“ endet sie | |
| C15 | Mitten in einer Session auf „Fragen“ wechseln | Oben in der Leiste steht „Session 2 · 00:45“ o. ä. und läuft weiter | |
| C16 | In der Fragenliste ansehen | Gespielte Fragen haben farbigen Rand und Marke „Session 1“ usw. | |
| C17 | Während einer Session: „Hier weiterspielen“ | Ist gesperrt | |
| C18 | Mitten in einer laufenden Session die Seite neu laden (F5) | Session läuft mit der richtigen Restzeit weiter, gleiche Frage | |
| C19 | Seite schließen, 1 Minute warten, wieder öffnen (laufende 20-Sek-Session) | Session ist beendet, nichts fehlt | |

## D. Neues Spiel

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| D1 | „Neues Spiel“ (Spiel- oder Startseite) | Rote Rückfrage: das alte Spiel wird gelöscht, es geht bei Frage … weiter | |
| D2 | „Abbrechen“ | Nichts ist gelöscht | |
| D3 | „Ja, neues Spiel“ | Keine Sessions, „Frühere Sessions (0)“, Timer 00:00 | |
| D4 | „Weiter geht es mit“ ansehen | Frage, die nach dem alten Spiel dran gewesen wäre. Keine Wiederholung | |
| D5 | Neue Session starten | Wieder „Session 1“ in Gelb-Orange | |

## E. Sicherung

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| E1 | Start → „Sichern (Export)“ | Datei `duemmste-fliegt-sicherung-….json` wird heruntergeladen | |
| E2 | Danach in „Fragen“ eine Frage löschen | Frage weg | |
| E3 | Start → „Wiederherstellen“, die Datei wählen | Rückfrage mit Anzahl Fragen und Sessions | |
| E4 | „Ja, ersetzen“ | Meldung „Wiederhergestellt …“, die gelöschte Frage ist wieder da | |
| E5 | Eine andere Datei (z. B. ein Bild oder Text) wählen | Meldung „keine gültige Sicherung“ | |

## F. Handy und Bedienung

| # | Prüfen | Erwartet | Ergebnis |
|---|---|---|---|
| F1 | Auf dem Handy öffnen (z. B. mit `start.sh`/`start.bat` und der Adresse des Rechners im WLAN) oder Fenster schmal ziehen | Eine Spalte, kein Seitwärtsscrollen | |
| F2 | Auf dem Handy alle Buttons bedienen | Keine Fehlklicks, Buttons groß genug | |
| F3 | Spielseite nach unten scrollen | Timer bleibt oben sichtbar | |
| F4 | Mit der Tab-Taste durchgehen | Jedes Element zeigt einen weißen Fokusrahmen | |
| F5 | Lesbarkeit: aus ca. 2 m Abstand | Timer und aktuelle Frage lesbar | |

## Rückmeldung
1. Was war beim Spielen am meisten im Weg?
2. Was hast du vermisst?
3. Was kann weg?
