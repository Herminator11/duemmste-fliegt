"""Automatischer Test für „Der Dümmste fliegt“ (Playwright, Chromium).

Aufruf (im Projektordner):
    python3 tests/test_app.py

Benötigt:  pip install playwright   und   playwright install chromium
Der Test öffnet index.html direkt als Datei, so wie bei einem Doppelklick.
"""
import json
import sys
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()
results = []


def check(name, cond, info=""):
    results.append((name, bool(cond), info))
    print(("OK     " if cond else "FEHLER "), name, ("– " + str(info)) if info else "")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        def go(route):
            pg.evaluate(f"location.hash = '#/{route}'")
            pg.wait_for_timeout(150)

        t = lambda: pg.inner_text("#time")
        sess = lambda: pg.inner_text(".hb-top .dsp-round").capitalize()
        played = lambda: pg.locator("#hb-more .hb-cols > div:first-child > .row").count()
        qtext = lambda: pg.inner_text("#hb-qtext")
        owner = lambda: pg.inner_text("#hb-qowner")
        qrows = lambda: pg.locator("#q-list .qrow").count()
        state = lambda: pg.evaluate("JSON.parse(localStorage.getItem('dfg_v2'))")

        # ---------- Start ----------
        pg.goto(URL); pg.wait_for_timeout(400)
        check("S1 Seite startet ohne Fehler", not errors, errors)
        check("S2 Startseite zeigt 'Neues Spiel'", pg.inner_text("#start-title") == "Neues Spiel")
        check("S3 Aktuelle Seite in Navigation markiert", pg.get_attribute('.links a[data-route="start"]', "aria-current") == "page")
        check("S4 Erste Frage als Vorschau", "Music Streaming" in pg.inner_text("#start-q"))
        check("S5 499 Fragen gespeichert", "499" in pg.inner_text("#start-count"), pg.inner_text("#start-count"))
        check("S6 Chip ohne Session versteckt", not pg.is_visible("#chip"))

        # ---------- Spieler ----------
        for name in ("Anna", "Ben"):
            pg.fill("#player-name", name); pg.click("#player-add")
        check("P1 Zwei Spieler angelegt", pg.locator("#players-list li").count() == 2, pg.locator("#players-list li").count())

        # ---------- Fragen ----------
        go("fragen")
        check("F1 Liste zeigt alle 499 Fragen", qrows() == 499, qrows())
        check("F2 Reihenfolge: erste und letzte Frage", "Music Streaming" in pg.locator("#q-list .qtext").first.inner_text()
              and pg.locator("#q-list .qnum").last.inner_text() == "499")
        check("F3 'als Nächstes' bei Nr. 1", "als Nächstes" in pg.locator("#q-list .qrow").first.inner_text())

        pg.fill("#q-search", "dutzend")
        check("F4 Suche findet 'Dutzend'", qrows() == 1 and "Dutzend" in pg.locator("#q-list .qtext").first.inner_text(), qrows())
        check("F4 Trefferzeile", "von 499" in pg.inner_text("#q-hits"), pg.inner_text("#q-hits"))
        pg.fill("#q-search", "xyzxyz")
        check("F5 Keine Treffer: Hinweis", pg.locator("#q-empty").count() == 1)
        pg.fill("#q-search", "")
        check("F5 Suche leeren zeigt alles", qrows() == 499)

        pg.click("#btn-new-q"); pg.fill("#new-q", "Testfrage?"); pg.click("#new-save")
        check("F6 Leere Antwort wird abgelehnt", pg.is_visible("#new-err") and qrows() == 499)
        pg.fill("#new-a", "Testantwort"); pg.click("#new-save")
        check("F7 Neue Frage am Ende", qrows() == 500 and pg.locator("#q-list .qtext").last.inner_text() == "Testfrage?")
        check("F7 Hinweis 'hinzugefügt'", "500" in pg.inner_text("#q-notice"), pg.inner_text("#q-notice"))

        pg.click("#btn-bulk-q")
        pg.fill("#bulk-text", "Bulk Eins?\nA: A1, A2\n\nBulk Zwei? A: B1\n\nkaputt ohne Antwort")
        pg.click("#bulk-save")
        check("F8 Mehrere einfügen: 2 erkannt", qrows() == 502 and "2 Frage" in pg.inner_text("#bulk-result"), pg.inner_text("#bulk-result"))
        check("F8 Fehlerhafter Absatz gemeldet", "nicht erkannt" in pg.inner_text("#bulk-result"))

        # Bearbeiten
        pg.fill("#q-search", "Testfrage")
        pg.click('#q-list [data-act="edit"]')
        pg.locator('#q-list .qedit input').first.fill("Testfrage bearbeitet?")
        pg.click('#q-list [data-act="save"]')
        check("F9 Bearbeiten speichert", "bearbeitet" in pg.locator("#q-list .qtext").first.inner_text())
        pg.click('#q-list [data-act="edit"]')
        pg.locator('#q-list .qedit input').first.fill("")
        pg.click('#q-list [data-act="save"]')
        check("F9 Leere Frage wird abgelehnt", pg.locator('#q-list [data-act="save"]').count() == 1)
        pg.click('#q-list [data-act="cancel"]')

        # Löschen mit Rückfrage
        pg.click('#q-list [data-act="del"]')
        check("F10 Löschen fragt nach", pg.locator('#q-list [data-act="del-yes"]').count() == 1)
        pg.click('#q-list [data-act="del-no"]')
        check("F10 Abbrechen behält Frage", pg.locator("#q-list .qrow").count() == 1)
        pg.click('#q-list [data-act="del"]'); pg.click('#q-list [data-act="del-yes"]')
        pg.fill("#q-search", "")
        check("F10 Löschen entfernt Frage", qrows() == 501, qrows())
        for txt in ("Bulk Eins", "Bulk Zwei"):
            pg.fill("#q-search", txt); pg.click('#q-list [data-act="del"]'); pg.click('#q-list [data-act="del-yes"]')
        pg.fill("#q-search", "")
        check("F10 Wieder 499 Fragen", qrows() == 499, qrows())

        pg.reload(); pg.wait_for_timeout(300)
        go("fragen")
        check("F11 Fragen bleiben nach Neuladen", qrows() == 499)

        # Hier weiterspielen
        pg.locator('#q-list .qrow').nth(9).locator('[data-act="pos"]').click()
        check("F12 'Hier weiterspielen' setzt Marke auf Nr. 10", "als Nächstes" in pg.locator("#q-list .qrow").nth(9).inner_text())
        pg.locator('#q-list .qrow').nth(0).locator('[data-act="pos"]').click()
        check("F12 Zurück auf Nr. 1", "als Nächstes" in pg.locator("#q-list .qrow").nth(0).inner_text())

        # ---------- Spiel (Bühne) ----------
        go("spiel")
        check("G1 Spielseite: Session 1 starten", pg.inner_text("#btn-start") == "Session 1 starten")
        check("G1 Zwei Kacheln für die Spieler", pg.locator(".hb-tile").count() == 2)
        check("G1 Navigation und Chip auf der Bühne ausgeblendet", not pg.is_visible(".nav") and not pg.is_visible("#chip"))
        pg.fill("#inp-min", "0"); pg.fill("#inp-sec", "0"); pg.click("#btn-start")
        check("G2 Dauer 0 abgelehnt", "größer als 0" in pg.inner_text("#err"))
        pg.fill("#inp-sec", "75"); pg.click("#btn-start")
        check("G3 Sekunden über 59 abgelehnt", pg.is_visible("#err"))
        pg.fill("#inp-min", "2"); pg.fill("#inp-sec", "0"); pg.click("#btn-start")
        check("G4 Session 1 läuft", "Session 1" in sess() and t() in ("02:00", "01:59"), t())
        c1 = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--c').trim()")
        check("G4 Erste Farbe", c1.lower() == "#ffb347", c1)
        check("G5 Aktuelle Frage = Frage 1", "Music Streaming" in qtext())
        check("G5 Richtige Antwort sichtbar", "Spotify" in pg.inner_text("#hb-atext"))
        check("G5 Erster Spieler ist dran", owner() == "Anna" and "Anna" in pg.locator(".hb-tile.turn .dsp-name").first.inner_text())
        check("G6 'Danach' zeigt Frage 2", "24h" in pg.locator(".hb-flip .hb-front .hb-q").text_content())

        # Leeres Feld + Enter = richtig, weiter zu Frage 2 und Ben
        pg.click("#hb-ans"); pg.keyboard.press("Enter")
        check("G7 Enter bei leerem Feld gilt als richtig: Frage 2 und Ben", "24h" in qtext() and owner() == "Ben", f"{qtext()} / {owner()}")
        check("G7 Frage 1 steht unter 'Gespielt'", played() == 1)

        # Falsch: Antwort eintippen, Enter
        pg.fill("#hb-ans", "Quatsch"); pg.keyboard.press("Enter")
        check("G8 Falsch + Enter: Frage 3 und wieder Anna", "Dutzend" in qtext() and owner() == "Anna", f"{qtext()} / {owner()}")
        check("G8 Zwei Fragen gespielt", played() == 2)
        st_ = state()
        e2 = st_["game"]["sessions"][0]["played"][1]["statements"]
        check("G8 Eingetippte Antwort ist als falsch gespeichert", any(v["result"] == "falsch" and v["text"] == "Quatsch" for v in e2.values()), e2)
        check("G8 Kreise auf den Kacheln (Anna, Ben)", pg.locator('.hb-tile >> nth=0 >> .dsp-dots .dd').count() >= 1 and pg.locator('.hb-tile >> nth=1 >> .dsp-dots .dd').count() >= 1)

        # Leben per Herzklick
        t0 = pg.locator(".hb-tile").first
        before_l = pg.locator('.hb-tile >> nth=0 >> .hb-heart.on').count()
        t0.locator('[data-act="life-down"]').first.click()
        check("G8b Herzklick zieht ein Leben ab", pg.locator('.hb-tile >> nth=0 >> .hb-heart.on').count() == before_l - 1)
        pg.locator(".hb-tile").first.locator('[data-act="life-up"]').first.click()
        check("G8b Leeres Herz gibt es zurück", pg.locator('.hb-tile >> nth=0 >> .hb-heart.on').count() == before_l)
        # Herz-Regeln: bei vollen Leben ist nur das letzte Herz anklickbar (plus Bonus-Plus), nach einem Abzug zusätzlich das erste leere
        check("G8d Volle Leben: genau ein klickbares Herz", pg.locator('.hb-tile >> nth=0 >> .hb-heart.act').count() == 1)
        pg.locator('.hb-tile >> nth=0 >> .hb-heart.act').click()
        check("G8d Nach Abzug: letztes volles und erstes leeres Herz klickbar", pg.locator('.hb-tile >> nth=0 >> .hb-heart.act').count() == 2)
        pg.locator('.hb-tile >> nth=0 >> .hb-heart.act:not(.on)').click()
        check("G8d Leeres Herz klicken gibt das Leben zurück", pg.locator('.hb-tile >> nth=0 >> .hb-heart.on').count() == before_l)
        # Name per Klick auf der Kachel
        pg.locator('.hb-tile >> nth=1 >> [data-act="rename"]').click()
        pg.fill(".hb-name-in", "Benedikt"); pg.keyboard.press("Enter")
        check("G8e Name auf der Kachel ändern", pg.evaluate("Store.state.players[1].name") == "Benedikt")
        pg.locator('.hb-tile >> nth=1 >> [data-act="rename"]').click()
        pg.fill(".hb-name-in", "Ben"); pg.keyboard.press("Enter")
        check("G8e Name zurückändern", pg.evaluate("Store.state.players[1].name") == "Ben")

        # Chip in Navigation
        go("start")
        check("G9 Chip zeigt laufende Session", pg.is_visible("#chip") and "Session 1" in pg.inner_text("#chip"), pg.inner_text("#chip"))
        check("G9 Startseite: 'Spiel läuft', 2 Fragen gespielt", pg.inner_text("#start-title") == "Spiel läuft" and pg.inner_text("#f-played") == "2")
        go("fragen")
        check("G10 Fragenliste markiert gespielte Fragen mit Session", pg.locator("#q-list .qtag.sess").count() == 2)
        check("G10 'Hier weiterspielen' während Session gesperrt", pg.locator('#q-list [data-act="pos"]').first.is_disabled())
        go("spiel")

        # Pause / Weiter
        pg.click("#btn-pause"); v = t(); pg.wait_for_timeout(1300)
        check("G11 Pause hält Timer an", t() == v and "pausiert" in sess(), f"{v} -> {t()}")
        pg.click("#btn-pause"); pg.wait_for_timeout(1300)
        check("G12 Weiter läuft weiter", t() < v, f"{v} -> {t()}")

        # Neuladen mitten in laufender Session
        before = t()
        pg.reload(); pg.wait_for_timeout(400)
        go("start"); go("spiel")
        check("G13 Neuladen: Session läuft weiter", "Session 1" in sess() and t() <= before and t() != "00:00", f"{before} -> {t()}")
        check("G13 Neuladen: gleiche Frage", "Dutzend" in qtext())
        check("G13 Neuladen: gespielte Fragen bleiben", played() == 2)

        # Beenden mit Rückfrage
        pg.click("#btn-end")
        check("G14 Beenden fragt nach", pg.locator("#btn-end-yes").count() == 1)
        pg.click("#btn-end-no")
        check("G14 Abbrechen: Session läuft", pg.locator("#btn-pause").count() == 1)
        pg.click("#btn-end"); pg.click("#btn-end-yes")
        check("G15 Session beendet, Timer 00:00", "beendet" in sess() and t() == "00:00")
        check("G15 Aktuelle Frage zählt zur Session (3 gespielt)", played() == 3, played())
        # Dran setzen: nur zwischen den Sessions, in den Einstellungen des Spielers
        check("G15b Kein 'Dran setzen' auf der Kachel", pg.locator('.hb-tile >> [data-act="set-turn"]').count() == 0)
        before_turn = pg.evaluate("Store.turnPlayer().name")
        other = 0 if before_turn == "Ben" else 1
        pg.locator(f'.hb-tile >> nth={other} >> [data-act="settings"]').click()
        pg.locator(f'.hb-tile >> nth={other} >> [data-act="set-turn"]').click()
        check("G15c 'Dran setzen' in den Einstellungen", pg.evaluate("Store.turnPlayer().name") != before_turn)
        pg.locator(f'.hb-tile >> nth={other} >> [data-act="settings-done"]').click()
        check("G15 Titel 'Gespielt in Session 1'", "Session 1" in pg.inner_text("#hb-more .hb-cols > div:first-child > h3"))
        check("G16 Min/Sek-Felder wieder da", pg.locator("#inp-min").count() == 1 and pg.input_value("#inp-min") == "2")

        # Abstimmung ist offen: neue Session erst nach Auflösen oder Überspringen
        check("G16 Abstimmung erscheint auf der Bühne", pg.locator("#vote").count() == 1)
        pg.click("#btn-start")
        check("G16 Neue Session bei offener Abstimmung abgelehnt", "Abstimmung" in pg.inner_text("#err"), pg.inner_text("#err") if pg.locator("#err").count() else "")
        pg.click("#vote-skip")
        check("G16 Überspringen schließt die Abstimmung", pg.locator("#vote-skipped").count() == 1)

        # Session 2: kurze Dauer, Auto-Ende
        pg.fill("#inp-min", "0"); pg.fill("#inp-sec", "3"); pg.click("#btn-start")
        c2 = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--c').trim()")
        check("G17 Session 2 neue Farbe", "Session 2" in sess() and c2.lower() == "#5fd0a4", c2)
        check("G17 Session 2 macht bei Frage 4 weiter", "flächenstärkste" in qtext(), qtext())
        check("G17 Frühere Sessions: 1", "(1)" in pg.inner_text("#hist-sum"), pg.inner_text("#hist-sum"))
        pg.click("#hist-s1 summary")
        check("G18 Session 1 im Verlauf zeigt 3 Fragen", pg.locator("#hist-s1 .row").count() == 3)
        pg.wait_for_timeout(3600)
        check("G19 Auto-Ende bei 0", "beendet" in sess(), sess())
        check("G19 Aktuelle Frage der Session gezählt", played() == 1)
        pg.click("#vote-skip")

        # ---------- Löschen vor der Position ----------
        nxt = lambda: state()["questions"][state()["game"]["pos"]]["text"]
        next_before = nxt()
        go("fragen")
        pos_before = state()["game"]["pos"]
        pg.fill("#q-search", "Music Streaming")
        pg.click('#q-list [data-act="del"]'); pg.click('#q-list [data-act="del-yes"]')
        pg.fill("#q-search", "")
        pos_after = state()["game"]["pos"]
        check("D1 Frage vor der Position gelöscht: Position rutscht mit", pos_after == pos_before - 1, f"{pos_before} -> {pos_after}")
        check("D1 Nächste Frage bleibt dieselbe", nxt() == next_before, f"{next_before!r} -> {nxt()!r}")

        # ---------- Neues Spiel ----------
        nxt_text = nxt()
        go("spiel")
        pg.click("#hb-menu")
        pg.click("#btn-newgame")
        check("N1 Rückfrage vor dem Löschen", "gelöscht" in pg.inner_text("#new-confirm"))
        pg.click("#btn-newgame-no")
        check("N2 Abbrechen behält Spiel", "Session 2" in sess())
        pg.click("#btn-newgame"); pg.click("#btn-newgame-yes")
        check("N3 Neues Spiel: leer", "Bereit" in sess() and "(0)" in pg.inner_text("#hist-sum"))
        check("N4 Fragen laufen weiter", nxt() == nxt_text, nxt())
        check("N5 Button 'Session 1 starten'", pg.inner_text("#btn-start") == "Session 1 starten")
        pg.click("#hb-menu")
        pg.fill("#inp-min", "1"); pg.fill("#inp-sec", "0"); pg.click("#btn-start")
        c3 = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--c').trim()")
        check("N6 Session 1 wieder erste Farbe", "Session 1" in sess() and c3.lower() == "#ffb347", c3)
        check("N6 Aktuelle Frage = angekündigte", qtext() == nxt_text)

        # Alter Link zu Spiel B leitet um
        pg.evaluate("location.hash = '#/host-b'"); pg.wait_for_timeout(250)
        check("N6b #/host-b leitet auf #/spiel um", pg.evaluate("location.hash") == "#/spiel" and pg.locator(".hb").count() == 1)

        # Neues Spiel von der Startseite mitten in einer Session
        shown = qtext()
        go("start")
        pg.click("#btn-newgame"); pg.click("#btn-newgame-yes")
        check("N7 Startseite: Neues Spiel mitten in Session", pg.inner_text("#start-title") == "Neues Spiel")
        check("N7 Gezeigte Frage kommt nicht noch einmal", pg.inner_text("#start-q") != shown)
        check("N7 Chip verschwindet", not pg.is_visible("#chip"))

        # ---------- Sicherung ----------
        n_q = len(state()["questions"])
        with pg.expect_download() as dl:
            pg.click("#btn-export")
        path = Path(tempfile.gettempdir()) / "dfg_backup_test.json"
        dl.value.save_as(path)
        data = json.loads(path.read_text(encoding="utf-8"))
        check("B1 Export enthält Fragen und Spiel", data["app"] == "duemmste-fliegt" and len(data["questions"]) == n_q and "game" in data)

        # Frage löschen, dann Import stellt sie wieder her
        go("fragen")
        pg.fill("#q-search", "Dutzend"); pg.locator('#q-list [data-act="del"]').first.click(); pg.click('#q-list [data-act="del-yes"]')
        pg.fill("#q-search", "")
        check("B2 Frage entfernt", qrows() == n_q - 1)
        go("start")
        pg.set_input_files("#import-file", str(path))
        check("B3 Import fragt nach", pg.locator("#import-confirm").count() == 1)
        pg.click("#btn-import-no")
        pg.set_input_files("#import-file", str(path)); pg.click("#btn-import-yes")
        check("B4 Import meldet Erfolg", "Wiederhergestellt" in pg.inner_text("#backup-msg"), pg.inner_text("#backup-msg"))
        go("fragen")
        check("B4 Fragen wieder vollständig", qrows() == n_q, qrows())

        bad = Path(tempfile.gettempdir()) / "dfg_bad.json"
        bad.write_text('{"foo": 1}', encoding="utf-8")
        go("start")
        pg.set_input_files("#import-file", str(bad))
        check("B5 Ungültige Datei wird abgelehnt", "keine gültige" in pg.inner_text("#backup-msg"))

        check("X1 Keine JS-Fehler im gesamten Lauf", not errors, errors)

        # ---------- Handy-Breite ----------
        m = ctx.new_page()
        m.set_viewport_size({"width": 390, "height": 800})
        m.goto(URL); m.wait_for_timeout(300)
        for route in ("start", "fragen", "spiel"):
            m.evaluate(f"location.hash = '#/{route}'"); m.wait_for_timeout(1500)   # Einblend-Animation (body.enter) abwarten, sie skaliert beim Messen
            ov = m.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
            check(f"M1 Handy {route}: kein Seitwärtsscrollen", not ov)
            # Herzen und Zahnrad der Bühne haben eine per ::after auf 44 px+ vergrößerte Klickfläche
            small = m.evaluate("[...document.querySelectorAll('button:not([disabled]):not(.hb-heart):not(.hb-hbtn):not(.hb-gear):not(.hb-name),a.btn,.links a')].filter(b=>b.offsetParent&&b.offsetHeight<44).length")
            check(f"M2 Handy {route}: alle Bedienelemente >= 44 px", small == 0, f"{small} zu klein")

        # ---------- Speicher blockiert ----------
        c2ctx = b.new_context(viewport={"width": 1280, "height": 900})
        c2ctx.add_init_script("""
          Object.defineProperty(window, 'localStorage', { get(){ throw new DOMException('blocked','SecurityError'); } });
        """)
        z = c2ctx.new_page()
        zerr = []
        z.on("pageerror", lambda e: zerr.append(str(e)))
        z.goto(URL); z.wait_for_timeout(400)
        check("Z1 Speicher blockiert: Hinweis sichtbar", z.is_visible("#banner") and "kein Speichern" in z.inner_text("#banner"))
        z.evaluate("location.hash = '#/start'"); z.wait_for_timeout(150)
        z.fill("#player-name", "Anna"); z.click("#player-add")
        z.evaluate("location.hash = '#/spiel'"); z.wait_for_timeout(200)
        z.click("#btn-start"); z.wait_for_timeout(200)
        check("Z2 Spielen geht trotzdem", "Session 1" in z.inner_text(".hb-top .dsp-round").capitalize())
        z.click("#btn-richtig")
        check("Z2 Weiterschalten geht trotzdem", z.locator("#hb-more .hb-cols > div:first-child > .row").count() == 1)
        check("Z3 Keine JS-Fehler bei blockiertem Speicher", not zerr, zerr)

        b.close()

    fails = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(fails)} von {len(results)} Prüfungen bestanden")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
