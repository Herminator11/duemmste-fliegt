/* Host-Ansicht „Spiel“ („Bühne“): Spieler als Kacheln wie auf dem Game Screen, nur kleiner und mit Reglern.
   Oben eine feste Leiste (Timer, Session, Spielregeln), unten eine feste Leiste (Frage zum Umdrehen, Antwort eintragen).
   Wer nach unten scrollt, findet dahinter alles Weitere: Abstimmung im Detail, Aussagen je Spieler, frühere Sessions.
   Die Spiellogik liegt unverändert im Store. */
(function () {
  "use strict";
  var h = U.h, $ = U.$;
  var root = null;
  var sel = null;                    // gewählter Spieler für die Antwort-Eingabe: { id, turn }
  var flip = { cur: false, next: false };
  var menuOpen = false, confirmEnd = false, confirmNew = false, refocus = false, errMsg = "";
  var draft = null;                  // Eingaben für Min/Sek, die ein Neuzeichnen überleben sollen
  /* Zustand, der ein Neuzeichnen überleben soll */
  var histOpen = null, openSess = {}, openPl = {}, voteMsg = null;
  var openDot = null, editRow = null;   // angeklickter Kreis (pid:n:idx) und Zeile in „Aussagen je Spieler“, die gerade bearbeitet wird
  var openSet = {}, confirmRemove = {};   // Einstellungen je Spieler aufgeklappt, „Entfernen“ wartet auf Bestätigung

  function redraw() { render(); }

  function render(r) {
    if (r) root = r;
    if (!root) return;
    /* Hintergrundaktionen (Auto-Auflösen) dürfen eine andere Seite nicht mit der Spiel-Seite überschreiben. */
    if (!r && !/^#\/?spiel/.test(location.hash)) return;
    App.applyColor();
    /* Eingabe nicht verlieren, wenn nur ein Server-Signal neu zeichnet */
    var keepScroll = window.scrollY;
    root.textContent = "";
    var st = Store.state, s = Store.curSession(), active = Store.isActive();
    var tgt = Store.statementTarget();
    var page = h("div", { cls: "hb" });
    page.appendChild(buildTop(s));
    page.appendChild(h("div", { cls: "track hb-track" }, [h("i", { id: "track" })]));
    var screen = h("div", { cls: "hb-screen" });
    screen.appendChild(buildStage(s, active, tgt));
    screen.appendChild(buildBottom(s, active, tgt, st));
    page.appendChild(screen);
    page.appendChild(buildMore(s, st));
    root.appendChild(page);
    paintTime();
    App.updateChip();
    if (keepScroll) window.scrollTo(0, keepScroll);
    var ae = document.activeElement;
    var idle = !ae || ae === document.body || ae === root;
    if (refocus || (liveTarget && idle)) { refocus = false; var a = $("hb-ans"); if (a) { a.focus({ preventScroll: true }); a.setSelectionRange(a.value.length, a.value.length); } }
  }

  /* ---------- Feste Leiste oben ---------- */
  function buildTop(s) {
    var st = Store.state;
    var left = h("div", { cls: "hb-left" }, [
      h("a", { cls: "hb-brand", href: "#/start", text: "Der Dümmste fliegt" }),
      h("div", { cls: "time", id: "time", role: "timer", text: "00:00" }),
      h("div", { cls: "sess" }, [
        h("strong", { text: s ? "Session " + s.n : "Neues Spiel" }),
        h("span", { text: s ? (s.status === "running" ? "läuft" : s.status === "paused" ? "pausiert" : "beendet") : "noch keine Session" })
      ])
    ]);

    var ctrl = h("div", { cls: "hb-ctrl" });
    if (!s || s.status === "ended") {
      var keep = function () { draft = { min: $("inp-min").value, sec: $("inp-sec").value }; };
      ctrl.appendChild(h("label", { cls: "hb-dur" }, ["Min", h("input", { id: "inp-min", type: "number", min: "0", max: "99", inputmode: "numeric", value: draft ? draft.min : String(st.settings.min), on: { input: keep } })]));
      ctrl.appendChild(h("label", { cls: "hb-dur" }, ["Sek", h("input", { id: "inp-sec", type: "number", min: "0", max: "59", inputmode: "numeric", value: draft ? draft.sec : String(st.settings.sec), on: { input: keep } })]));
      ctrl.appendChild(h("button", { cls: "btn btn-main", id: "btn-start", type: "button", disabled: !st.questions.length, text: s ? "Neue Session" : "Session 1 starten",
        on: { click: function () {
          var res = Store.startSession($("inp-min").value, $("inp-sec").value);
          setError(res.ok ? "" : res.error);
          if (res.ok) draft = null;
          confirmEnd = false; redraw();
        } } }));
    } else if (confirmEnd) {
      ctrl.appendChild(h("span", { cls: "hb-ask", text: "Session beenden?" }));
      ctrl.appendChild(h("button", { cls: "btn btn-danger", id: "btn-end-yes", type: "button", text: "Ja", on: { click: function () { Store.endSession(); confirmEnd = false; redraw(); } } }));
      ctrl.appendChild(h("button", { cls: "btn", id: "btn-end-no", type: "button", text: "Nein", on: { click: function () { confirmEnd = false; redraw(); } } }));
    } else {
      ctrl.appendChild(h("button", { cls: "btn", id: "btn-pause", type: "button", on: { click: function () { Store.pauseResume(); redraw(); } } },
        [Icons.icon(s.status === "paused" ? "play-button" : "pause-button"), " " + (s.status === "paused" ? "Weiter" : "Pause")]));
      ctrl.appendChild(h("button", { cls: "btn btn-danger", id: "btn-end", type: "button", text: "Beenden", on: { click: function () { confirmEnd = true; redraw(); } } }));
    }
    if (errMsg) ctrl.appendChild(h("p", { cls: "err hb-err", id: "err", role: "alert", text: errMsg }));

    var right = h("div", { cls: "hb-right" }, [
      h("button", { cls: "btn btn-sm", id: "hb-menu", type: "button", "aria-expanded": menuOpen ? "true" : "false",
        on: { click: function () { menuOpen = !menuOpen; redraw(); } } }, [Icons.icon("gear"), " Spiel"]),
      h("button", { cls: "btn btn-sm", id: "hb-fs", type: "button", title: "Vollbild (F)", on: { click: toggleFullscreen } }, [Icons.icon("expand"), " Vollbild"])
    ]);
    var bar = h("header", { cls: "hb-top" }, [left, ctrl, right]);
    if (menuOpen) bar.appendChild(buildMenu());
    return bar;
  }

  /* Allgemeine Spieleinstellungen (klappt unter der Leiste auf) */
  function buildMenu() {
    var st = Store.state;
    var lives = h("input", { type: "number", id: "start-lives", min: "1", max: "99", inputmode: "numeric", value: String(st.settings.startLives),
      on: { change: function (e) { Store.setStartLives(e.target.value); redraw(); } } });
    return h("div", { cls: "hb-menu", id: "hb-menu-panel" }, [
      h("div", {}, [h("h3", { text: "Abstimmung" }), U.rulesBox(Store, redraw)]),
      h("div", {}, [
        h("h3", { text: "Spiel" }),
        h("label", { cls: "lives-field" }, ["Leben pro Spieler", lives]),
        h("p", { cls: "hint", text: st.game.sessions.length ? "Gilt ab dem nächsten Spiel." : "Gilt sofort für alle." }),
        buildTools()
      ]),
      h("div", {}, [
        h("h3", { text: "Weitere Ansichten" }),
        h("p", {}, [h("a", { cls: "btn btn-sm", href: "#/anzeige", target: "_blank", rel: "noopener", text: "Game Screen öffnen" })]),
        h("p", {}, [h("a", { cls: "btn btn-sm", href: "#/start", text: "Startseite" })])
      ])
    ]);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  }

  /* ---------- Bühne: Kacheln ---------- */
  function buildStage(s, active, tgt) {
    var st = Store.state, pv = Store.publicView();
    var stage = h("main", { cls: "hb-stage" });
    var w = Store.winner();
    if (w) stage.appendChild(h("p", { cls: "hb-win", id: "winner" }, [Icons.icon("laurels-trophy"), " Gewonnen hat " + w.name + "!"]));
    else if (Store.endgame()) stage.appendChild(h("p", { cls: "endgame", id: "endgame" }, [Icons.icon("laurels-trophy"), " Finale: Nur noch zwei sind im Rennen. Die Finalregeln sind noch offen."]));

    if (!st.players.length) {
      stage.appendChild(h("p", { cls: "idle", text: "Keine Spieler. Lege sie auf der Startseite an." }));
      return stage;
    }
    var ctx = { tp: active ? Store.turnPlayer() : null, target: currentTarget(), entry: tgt ? tgt.entry : null, pv: pv };
    var grid = h("div", { cls: "hb-grid", id: "hb-players" });
    st.players.forEach(function (p) { grid.appendChild(tile(p, ctx)); });
    stage.appendChild(grid);

    var voteBox = buildVoteBox();
    if (voteBox) stage.appendChild(voteBox);
    return stage;
  }

  /* Herzreihe zum Anklicken: volles Herz entfernt eins, leeres Herz fügt eins hinzu. */
  function heartsRow(p, start) {
    var total = Math.max(p.lives, start);
    var box = h("div", { cls: "hb-hearts", role: "group", "aria-label": "Leben von " + p.name });
    var change = function (d) { Store.adjustLives(p.id, d); if (p.lives <= 0) openSettings(p.id); redraw(); };
    if (total > 10) {
      box.appendChild(h("button", { type: "button", cls: "hb-hbtn", "data-act": "life-down", "aria-label": "Leben abziehen", disabled: p.lives <= 0, text: "−", on: { click: function () { change(-1); } } }));
      box.appendChild(h("span", { cls: "hb-hnum" }, [Icons.icon("hearts", "h-full"), " " + p.lives]));
      box.appendChild(h("button", { type: "button", cls: "hb-hbtn", "data-act": "life-up", "aria-label": "Leben hinzufügen", text: "+", on: { click: function () { change(1); } } }));
      return box;
    }
    for (var i = 0; i < total; i++) {
      var full = i < p.lives;
      box.appendChild(h("button", { type: "button", cls: "hb-heart" + (full ? " on" : ""), "data-act": full ? "life-down" : "life-up",
        title: full ? "Ein Leben abziehen" : "Ein Leben hinzufügen", "aria-label": full ? "Leben von " + p.name + " abziehen" : "Leben von " + p.name + " hinzufügen",
        on: { click: function () { change(full ? -1 : 1); } } }, [Icons.icon(full ? "hearts" : "broken-heart")]));
    }
    return box;
  }

  /* Master: Antwort und Ergebnis zu einer Frage nachträglich ändern (Tippfehler, falsch eingetragen). Speichert beim Verlassen des Felds oder mit Enter. */
  function refKey(pid, ref) { return pid + ":" + (ref.live ? "live" : ref.n + "-" + ref.idx); }
  function answerEditor(p, ref, text, result, close) {
    var inp = h("input", { type: "text", cls: "hb-edit-in", maxlength: "500", value: text || "", autocomplete: "off", "aria-label": "Antwort von " + p.name + " ändern", placeholder: "(ohne Text)",
      on: { change: function () { Store.editStatement(ref, p.id, { text: inp.value }); redraw(); },
        keydown: function (ev) { if (ev.key === "Enter") { ev.preventDefault(); inp.blur(); } else if (ev.key === "Escape" && close) close(); } } });
    var res = h("div", { cls: "hb-edit-res", role: "group", "aria-label": "Ergebnis ändern" });
    [["richtig", "Richtig"], ["falsch", "Falsch"], ["keine", "Keine"]].forEach(function (x) {
      var on = result === x[0];
      res.appendChild(h("button", { type: "button", cls: "rbtn hb-sm r-" + x[0] + (on ? " on" : ""), "data-set-result": x[0], "aria-pressed": on ? "true" : "false", text: x[1],
        on: { click: function () { Store.editStatement(ref, p.id, { result: on ? null : x[0] }); redraw(); } } }));
    });
    return h("div", { cls: "hb-edit" }, [inp, res]);
  }

  /* Kreis je Frage mit Fenster: Hover zeigt Frage, richtige Antwort und Antwort des Spielers, Klick hält das Fenster offen zum Ändern. */
  function dotEl(p, d, i) {
    var key = refKey(p.id, d.ref), isOpen = openDot === key;
    var verdict = d.result ? U.RESULT_LABEL[d.result] : d.live ? "läuft gerade" : "offen";
    var tone = d.result || "keine";
    var pop = h("span", { cls: "hb-dpop res-" + tone, role: "group", "aria-label": "Frage " + (i + 1) + " von " + p.name }, [
      h("small", { cls: "hb-dplab", text: "Frage " + (i + 1) + " · " + verdict }),
      h("span", { cls: "hb-dpq", text: d.question }),
      h("small", { cls: "hb-dpc", text: "Richtig: " + d.correct }),
      h("span", { cls: "hb-dpa" }, [d.text ? p.name + ": " + d.text : h("i", { text: p.name + " hat nicht geantwortet" })]),
      isOpen ? answerEditor(p, d.ref, d.text, d.result, function () { openDot = null; redraw(); }) : h("small", { cls: "hb-dphint", text: "Klicken zum Ändern" })
    ]);
    var btn = h("button", { type: "button", cls: "hb-dbtn", "data-dot": i, "aria-expanded": isOpen ? "true" : "false", "aria-label": "Frage " + (i + 1) + " von " + p.name + ": " + verdict,
      on: { click: function () { openDot = isOpen ? null : key; redraw(); } } },
      [h("i", { cls: "dd" + (d.result ? " r-" + d.result : "") + (d.live ? " live" : "") })]);
    return h("span", { cls: "hb-dwrap" + (isOpen ? " open" : "") }, [btn, pop]);
  }

  function tile(p, ctx) {
    var out = p.lives <= 0, ghost = Store.isGhost(p);
    var isTurn = !!ctx.tp && ctx.tp.id === p.id;
    var isTarget = !!ctx.target && ctx.target.id === p.id;
    var pv = ctx.pv, st = Store.state;
    var voted = pv.voting && st.settings.showVoted && pv.voted.indexOf(p.id) >= 0;
    var cand = pv.voting && pv.voteRound > 1 && pv.candidates.indexOf(p.id) >= 0;
    var loser = !!(pv.vote && pv.vote.loserIds.indexOf(p.id) >= 0);
    var cnt = pv.vote && pv.vote.counts[p.id] ? pv.vote.counts[p.id] : 0;
    var askable = Store.askablePlayers().indexOf(p) >= 0;

    var cls = "hb-tile" + (out && !ghost ? " out" : "") + (ghost ? " ghost" : "") + (isTurn ? " turn" : "") + (isTarget ? " target" : "") + (cand ? " cand" : "") + (loser ? " loser" : "");
    var t = h("div", { cls: cls, "data-pid": p.id });

    t.appendChild(h("button", { type: "button", cls: "hb-av", "aria-label": "Antwort von " + p.name + " eintragen", title: "Antwort von " + p.name + " eintragen",
      on: { click: function () { sel = { id: p.id, turn: ctx.tp ? ctx.tp.id : null }; refocus = true; redraw(); } } }, [Avatar.render(p, 84)]));

    t.appendChild(h("div", { cls: "hb-top-row" }, [
      heartsRow(p, st.settings.startLives),
      h("button", { type: "button", cls: "hb-gear", "data-act": "settings", "aria-label": "Einstellungen von " + p.name, "aria-expanded": settingsOpen(p.id) ? "true" : "false", title: "Einstellungen",
        on: { click: function () { toggleSettings(p.id); redraw(); } } }, [Icons.icon("gear")])
    ]));

    var foot = h("div", { cls: "hb-foot" }, [h("span", { cls: "hb-name", text: p.name })]);
    if (isTurn) foot.appendChild(h("span", { cls: "turn-tag", text: "dran" }));
    else if (ghost) foot.appendChild(h("span", { cls: "ghost-tag", text: "Geist" }));
    t.appendChild(foot);

    /* Ein Kreis je Frage, die dieser Spieler in dieser Session bekommen hat. Der laufende Kreis blinkt und färbt sich mit dem Ergebnis. */
    var asked = Store.askedList(p.id);
    if (asked.length) {
      var dots = h("span", { cls: "hb-dots", role: "group", "aria-label": asked.length + (asked.length === 1 ? " Frage" : " Fragen") + " in dieser Session" });
      asked.forEach(function (d, i) { dots.appendChild(dotEl(p, d, i)); });
      t.appendChild(dots);
    }
    if (voted) t.appendChild(h("span", { cls: "hb-voted", role: "img", "aria-label": "hat gestimmt" }, [Icons.icon("check-mark")]));
    if (cnt) t.appendChild(h("span", { cls: "dsp-pill hb-pill" }, [Icons.icon("vote"), " " + cnt]));

    /* Erscheint beim Darüberfahren (und bei Tastaturfokus) */
    var hov = h("div", { cls: "hb-hov" });
    if (Store.isActive() && askable && !isTurn) hov.appendChild(h("button", { type: "button", cls: "btn btn-sm", "data-act": "set-turn", text: "Dran setzen",
      on: { click: function () { Store.setTurn(p.id); redraw(); } } }));
    if (out && !ghost) hov.appendChild(h("button", { type: "button", cls: "btn btn-sm btn-main", "data-act": "make-ghost", on: { click: function () { Store.setGhost(p.id, { vote: true, questions: true }); redraw(); } } }, [Icons.icon("ghost"), " Zum Geist machen"]));
    if (ghost) hov.appendChild(h("button", { type: "button", cls: "btn btn-sm", "data-act": "end-ghost", text: "Kein Geist mehr", on: { click: function () { Store.setGhost(p.id, null); redraw(); } } }));
    if (hov.children.length) t.appendChild(hov);

    if (settingsOpen(p.id)) {
      var pop = h("div", { cls: "hb-pop", role: "dialog", "aria-label": "Einstellungen von " + p.name }, [h("h4", { text: p.name }), settings(p)]);
      t.appendChild(pop);
    }
    return t;
  }

  var SYMBOL = { richtig: "check-mark", falsch: "cross-mark", keine: "help" };

  /* ---------- Feste Leiste unten: Frage zum Umdrehen, Antwort eintragen ---------- */
  function currentTarget() {
    var tp = Store.isActive() ? Store.turnPlayer() : null;
    var list = Store.askablePlayers();
    if (sel && list.some(function (p) { return p.id === sel.id; }) && sel.turn === (tp ? tp.id : null)) return Store.findPlayer(sel.id);
    return tp || list[0] || null;
  }

  /* „Danach“: Vorschau auf die nächste Frage, zum Umdrehen (Frage vorn, Antwort hinten). Die aktuelle Frage ist nie verdeckt. */
  function flipCard(label, q) {
    var on = flip.next;
    return h("button", { type: "button", cls: "hb-flip" + (on ? " on" : ""), "data-flip": "next", "aria-pressed": on ? "true" : "false",
      "aria-label": label + ": " + (on ? "Antwort" : "Frage") + ", zum Umdrehen tippen",
      on: { click: function () { flip.next = !flip.next; this.classList.toggle("on", flip.next); this.setAttribute("aria-pressed", flip.next ? "true" : "false"); } } }, [
      h("span", { cls: "hb-face hb-front" }, [h("small", { text: label + " · Frage" }), h("span", { cls: "hb-q", text: q.text })]),
      h("span", { cls: "hb-face hb-back" }, [h("small", { text: label + " · Antwort" }), h("span", { cls: "hb-q", text: q.answer })])
    ]);
  }

  var hint = "", liveTarget = false;

  /* Richtig = ein Klick genügt. Eine eingetippte Antwort ist falsch: Enter oder „Falsch senden“. Danach sofort zur nächsten Frage und zum nächsten Spieler. */
  function send(who, result) {
    var r = Store.commitAnswer(who.id, { result: result });
    hint = r.ok ? (r.advanced ? "" : "Das war die letzte Frage. Beende die Session, wenn ihr fertig seid.") : (r.error || "");
    if (r.ok) { sel = null; flip.next = false; }
    refocus = true; redraw();
  }

  function buildBottom(s, active, tgt, st) {
    var bar = h("footer", { cls: "hb-bottom" });
    var who = currentTarget();
    var nextQ = active ? st.questions[st.game.pos + 1] : null;

    /* Aktuelle Frage mit richtiger Antwort: immer sichtbar, gehört zum Spieler, der gerade antwortet */
    var qa = h("div", { cls: "hb-qa", id: "hb-qa" });
    if (tgt) {
      var owner = tgt.live ? who : Store.findPlayer(tgt.entry.pid);
      qa.appendChild(h("div", { cls: "hb-qwho" }, [
        owner ? Avatar.render(owner, 26) : null,
        h("span", { text: tgt.live ? "Frage für " : "Letzte Frage für " }), h("b", { id: "hb-qowner", text: owner ? owner.name : "–" }),
        tgt.live ? h("small", { text: "Nr. " + (st.game.pos + 1) + " von " + st.questions.length }) : null
      ]));
      qa.appendChild(h("p", { cls: "hb-qtext", id: "hb-qtext", text: tgt.text }));
      qa.appendChild(h("p", { cls: "hb-atext", id: "hb-atext" }, [h("small", { text: "Richtig" }), tgt.answer]));
    } else {
      qa.appendChild(h("p", { cls: "hint", text: "Starte eine Session. Dann siehst du hier die Frage und die richtige Antwort für den Spieler, der dran ist." }));
    }
    bar.appendChild(qa);

    var entry = tgt ? tgt.entry : null;
    liveTarget = !!(tgt && tgt.live && who);
    var answer = h("div", { cls: "hb-answer" });
    if (!tgt || !who) {
      answer.appendChild(h("p", { cls: "hint", text: tgt ? "Niemand kann gerade Fragen bekommen." : "" }));
    } else {
      var cur0 = entry.statements[who.id] || { text: "", result: null };
      var who$ = h("select", { cls: "sel", id: "hb-who", "aria-label": "Antwort von", on: { change: function (e) {
        var tp = Store.isActive() ? Store.turnPlayer() : null;
        sel = { id: e.target.value, turn: tp ? tp.id : null }; hint = ""; refocus = true; redraw();
      } } });
      Store.askablePlayers().forEach(function (p) { who$.appendChild(h("option", { value: p.id, text: p.name })); });
      who$.value = who.id;
      var inp = h("input", { type: "text", id: "hb-ans", value: cur0.text, autocomplete: "off", maxlength: "500", placeholder: tgt.live ? "Falsche Antwort von " + who.name + " eintippen, dann Enter" : "Antwort von " + who.name, "aria-label": "Antwort von " + who.name,
        on: {
          input: function () { Store.setStatement(who.id, { text: inp.value }); hint = ""; },
          keydown: function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (!tgt.live) return;
              if (!inp.value.trim()) { hint = "Tippe die Antwort ein (gilt als falsch) oder drücke „Richtig“."; refocus = true; redraw(); return; }
              send(who, "falsch");
            } else if (ev.altKey && ev.code === "Digit1") { ev.preventDefault(); tgt.live ? send(who, "richtig") : setResult(who, "richtig"); }
            else if (ev.altKey && ev.code === "Digit2") { ev.preventDefault(); tgt.live ? send(who, "falsch") : setResult(who, "falsch"); }
          }
        } });
      var res = h("div", { cls: "rgroup", role: "group", "aria-label": "Ergebnis für " + who.name });
      var pub = entry.published;
      answer.appendChild(h("div", { cls: "hb-arow" }, [h("label", { cls: "hb-who", for: "hb-who" }, ["Antwort von", who$]), inp]));
      var row2 = h("div", { cls: "hb-arow" });
      var ok = cur0.result === "richtig", bad = cur0.result === "falsch";
      row2.appendChild(h("button", { type: "button", cls: "rbtn hb-ok" + (tgt.live ? " solid" : "") + (!tgt.live && ok ? " on r-richtig" : ""), id: "btn-richtig", "data-result": "richtig", title: "Richtig (Alt+1)",
        on: { click: function () { tgt.live ? send(who, "richtig") : setResult(who, "richtig"); } } }, [Icons.icon(SYMBOL.richtig), h("span", { cls: "rlab", text: "Richtig" })]));
      row2.appendChild(h("button", { type: "button", cls: "rbtn hb-bad" + (tgt.live ? " solid" : "") + (!tgt.live && bad ? " on r-falsch" : ""), id: "btn-falsch", "data-result": "falsch", title: "Falsch (Alt+2, oder Antwort eintippen und Enter)",
        on: { click: function () { tgt.live ? send(who, "falsch") : setResult(who, "falsch"); } } }, [Icons.icon(SYMBOL.falsch), h("span", { cls: "rlab", text: tgt.live ? "Falsch senden" : "Falsch" }), tgt.live ? h("kbd", { text: "↵" }) : null]));
      if (!tgt.live) row2.appendChild(h("button", { cls: "btn btn-sm" + (pub ? "" : " btn-main"), id: "btn-publish", type: "button", text: pub ? "Auf Game Screen verbergen" : "Auf Game Screen zeigen",
        on: { click: function () { Store.setPublished(!pub); redraw(); } } }));
      answer.appendChild(row2);
      answer.appendChild(h("p", { cls: hint ? "err hb-hint" : "hint hb-hint", id: "hb-hint", role: hint ? "alert" : null,
        text: hint || (tgt.live ? "Richtig: ein Klick. Falsch: Antwort eintippen und Enter. Beides geht gleich zum nächsten Spieler." : "Die Antworten zur letzten Frage kannst du hier noch ändern.") }));
    }
    bar.appendChild(answer);

    if (nextQ) bar.appendChild(h("div", { cls: "hb-cards" }, [flipCard("Danach", nextQ)]));
    return bar;
  }
  var RES_KEYS = { Digit1: "richtig", Digit2: "falsch", Digit3: "keine" };
  function setResult(p, r) {
    var tg = Store.statementTarget();
    var now = tg && tg.entry.statements[p.id] ? tg.entry.statements[p.id].result : null;
    Store.setStatement(p.id, { result: now === r ? null : r });
    hint = ""; refocus = true; redraw();
  }

  /* ---------- Darunter: mehr Einstellungen und Rückblick ---------- */
  function buildMore(s, st) {
    var more = h("section", { cls: "hb-more", id: "hb-more" }, [h("h2", { text: "Mehr" })]);
    var cols = h("div", { cls: "hb-cols" });
    var left = h("div", {}, []), right = h("div", {}, []);
    left.appendChild(h("h3", { text: s ? "Gespielt in Session " + s.n : "Gespielt in diesem Spiel" }));
    if (!s || !s.played.length) left.appendChild(h("p", { cls: "empty", text: "Noch keine Frage gespielt." }));
    else s.played.slice().reverse().forEach(function (p) { left.appendChild(h("div", { cls: "row" }, [h("span", { cls: "q", text: p.text }), h("span", { cls: "a", text: p.answer })])); });
    var logBox = buildLogBox();
    if (logBox) left.appendChild(logBox);
    right.appendChild(buildHistory(s, st));
    cols.appendChild(left); cols.appendChild(right);
    more.appendChild(cols);
    return more;
  }

  function key(ev) {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === "f" || ev.key === "F") { toggleFullscreen(); return; }
  }

  /* ---------- Abstimmung ---------- */
  function buildVote(s) {
    var v = s.vote, box = h("div", { cls: "panel vote", id: "vote" });
    box.appendChild(h("h2", { style: "margin-top:0" }, [Icons.icon("dunce-cap"), " Abstimmung: dümmste Antwort"]));

    if (v && v.revealed) {
      var counts = {};
      Object.keys(v.votes).forEach(function (k) { counts[v.votes[k]] = (counts[v.votes[k]] || 0) + 1; });
      box.appendChild(h("ul", { cls: "vrows", id: "vote-counts" }, Store.state.players.filter(function (p) { return counts[p.id]; }).map(function (p) {
        return h("li", {}, [h("b", { text: p.name }), ": " + counts[p.id] + (counts[p.id] === 1 ? " Stimme" : " Stimmen")]);
      })));
      if (Store.state.settings.voteMode === "public") box.appendChild(h("ul", { cls: "vrows", id: "vote-rows" }, Store.voteRows(v).map(function (r) {
        return h("li", {}, [h("b", { text: r.voter }), " → ", r.target]);
      })));
      var names = v.loserIds.map(function (id) { var p = Store.findPlayer(id); return p ? p.name : (v.names[id] || "Unbekannt"); });
      box.appendChild(h("p", { cls: "vloser", id: "vote-result" }, [Icons.icon("broken-heart"), " " + names.join(", ") + " verliert ein Leben."]));
      if (v.round > 1) box.appendChild(h("p", { cls: "hint", id: "vote-runoff-note", text: "Entschieden in der Stichwahl (Runde " + v.round + ")." }));
      box.appendChild(h("div", { cls: "actions" }, [h("button", { cls: "btn btn-sm", id: "vote-undo", type: "button", text: "Rückgängig",
        on: { click: function () { Store.reopenVote(); voteMsg = null; autoBlock = Store.publicView().voteKey; redraw(); } } })]));
      return box;
    }
    if (v && v.skipped) {
      box.appendChild(h("p", { cls: "empty", id: "vote-skipped", text: "Abstimmung übersprungen." }));
      return box;
    }

    if (v && v.round > 1) {
      var cn = Store.candidatePlayers().map(function (p) { return p.name; }).join(", ");
      box.appendChild(h("p", { cls: "runoff", id: "vote-runoff" }, [Icons.icon("vote"), " Stichwahl (Runde " + v.round + "): Gleichstand. Nur noch " + cn + " stehen zur Wahl."]));
    }
    box.appendChild(U.rulesBox(Store, function () { redraw(); }));
    box.appendChild(h("p", { cls: "hint", text: Net.active()
      ? "Die Spieler stimmen am Handy geheim ab. Du siehst nur, wer schon gestimmt hat. Die Stimmen erscheinen erst nach „Auflösen“."
      : "Trage ein, wen jeder gewählt hat. Die Stimmen erscheinen erst nach „Auflösen“ auf dem Game Screen." }));
    var alive = Store.voterPlayers(), cands = Store.candidatePlayers();
    var status = h("p", { cls: "hint", id: "vote-status" });
    var upd = function () { var m = Store.missingVoters().length; status.textContent = (alive.length - m) + " von " + alive.length + " haben abgestimmt."; };
    var holder = box;
    if (Net.active()) {
      box.appendChild(buildVoteOnline());
      holder = h("details", { cls: "manual", id: "vote-manual" }, [h("summary", { text: "Stimmen von Hand eintragen (zum Beispiel ohne Handy)" })]);
      box.appendChild(holder);
    }
    alive.forEach(function (voter) {
      var sel = h("select", { cls: "sel", "data-voter": voter.id, "aria-label": "Stimme von " + voter.name,
        on: { change: function (e) { Store.setVote(voter.id, e.target.value); voteMsg = null; upd(); } } });
      sel.appendChild(h("option", { value: "", text: "– wählen –" }));
      cands.forEach(function (t) { sel.appendChild(h("option", { value: t.id, text: t.name + (t.id === voter.id ? " (selbst)" : "") })); });
      sel.value = (v && v.votes[voter.id]) || "";
      holder.appendChild(h("div", { cls: "srow vrow" }, [h("div", { cls: "sname" }, [h("b", { text: voter.name }), h("span", { text: "wählt" })]), sel]));
    });
    upd();
    if (!Net.active()) box.appendChild(status);
    if (voteMsg && voteMsg.error) box.appendChild(h("p", { cls: "err", id: "vote-err", role: "alert", text: voteMsg.error }));
    var acts = h("div", { cls: "actions" });
    acts.appendChild(h("button", { cls: "btn btn-main", id: "vote-resolve", type: "button", text: v && v.round > 1 ? "Stichwahl auflösen" : "Auflösen", on: { click: function () { finish({}); } } }));
    if (voteMsg && voteMsg.offline) acts.appendChild(h("button", { cls: "btn", id: "vote-offline", type: "button", text: "Ohne Server auflösen", on: { click: function () { finish(voteMsg.opts || {}, true); } } }));
    if (voteMsg && voteMsg.missing) acts.appendChild(h("button", { cls: "btn", id: "vote-force", type: "button", text: "Trotzdem auflösen", on: { click: function () { finish({ force: true }); } } }));
    acts.appendChild(h("button", { cls: "btn", id: "vote-skip", type: "button", text: "Überspringen", on: { click: function () { Store.skipVote(); voteMsg = null; errMsg = ""; redraw(); } } }));
    if (v && v.round >= 3) {
      acts.appendChild(h("p", { cls: "hint", text: "Schon zweimal Gleichstand. Du kannst selbst bestimmen, wer verliert:", style: "width:100%;margin:8px 0 0" }));
      cands.forEach(function (t) {
        acts.appendChild(h("button", { cls: "btn btn-danger btn-sm", type: "button", "data-decide": t.id, text: t.name, on: { click: function () { finish({ decide: t.id }); } } }));
      });
    }
    box.appendChild(acts);
    return box;
  }

  /* Wer hat per Handy schon gestimmt? Wird bei Server-Meldungen an Ort und Stelle aufgefrischt. */
  function buildVoteOnline() {
    var box = h("div", { id: "vote-online", cls: "vonline" });
    var prog = Net.progress(), claimed = Net.claimed();
    var alive = Store.voterPlayers();
    var done = alive.filter(function (p) { return prog.voted.indexOf(p.id) >= 0; }).length;
    var manual = Store.curVote() ? Store.curVote().votes : {};
    box.appendChild(h("p", { cls: "hint", id: "vote-status", text: Net.info.status === "online" ? done + " von " + alive.length + " haben am Handy abgestimmt." : "Keine Verbindung zum Server." }));
    var ul = h("ul", { cls: "vlist" });
    alive.forEach(function (p) {
      var voted = prog.voted.indexOf(p.id) >= 0, has = claimed.indexOf(p.id) >= 0;
      ul.appendChild(h("li", { "data-pid": p.id, cls: voted ? "done" : "" }, [
        h("b", { text: p.name }),
        h("span", { text: voted ? "hat abgestimmt" : manual[p.id] ? "von Hand eingetragen" : has ? "wartet …" : "kein Handy verbunden" })
      ]));
    });
    box.appendChild(ul);
    return box;
  }
  function updateVoteOnline() {
    var o = $("vote-online");
    if (o) o.replaceWith(buildVoteOnline());
  }

  /* Stimmen vom Server gelten nur für den Moment der Auflösung. Klappt sie nicht (fehlende Stimmen, Gleichstand),
     werden sie wieder zurückgesetzt, damit der Master sie vorher nirgends sieht, auch nicht unter „von Hand“. */
  var pending = false, autoKey = "", autoBlock = "";
  /* Sobald alle (am Handy oder von Hand) gestimmt haben und die Regel an ist, löst der Master von selbst auf. */
  function autoResolve() {
    if (pending || !Net.active() || !Store.voteOpen() || !Store.state.settings.autoReveal) return;
    var prog = Net.progress(), cv = Store.curVote(), manual = cv ? cv.votes : {};
    var alive = Store.voterPlayers();
    if (!alive.length || alive.some(function (p) { return prog.voted.indexOf(p.id) < 0 && !manual[p.id]; })) return;
    var voteKey = Store.publicView().voteKey;
    if (autoBlock === voteKey) return;      // nach „Rückgängig“ löst der Master diese Abstimmung selbst auf
    var key = voteKey + ":" + prog.voted.length + ":" + Object.keys(manual).length;
    if (key === autoKey) return;
    autoKey = key;
    finish({});
  }

  function finish(opts, skipFetch) {
    if (pending) return;
    if (Net.active() && !skipFetch) {
      pending = true;
      Net.fetchVotes().then(function (r) {
        var cur = Store.curVote() ? Store.curVote().votes : {}, prev = {};
        Object.keys(r.votes || {}).forEach(function (id) { prev[id] = cur[id] || ""; });
        Store.applyVotes(r.votes);
        var res = Store.resolveVote(opts);
        if (!res.ok) Object.keys(prev).forEach(function (id) { Store.setVote(id, prev[id]); });
        pending = false;
        done(res, opts);
      }).catch(function (e) {
        pending = false;
        voteMsg = { error: "Die Stimmen konnten nicht vom Server geholt werden (" + e.message + ").", offline: true, opts: opts };
        redraw();
      });
      return;
    }
    done(Store.resolveVote(opts), opts);
  }
  function done(res, opts) {
    if (res.ok) errMsg = "";
    voteMsg = res.ok ? null : { error: res.error, missing: res.missing, force: !!opts.force };
    /* Wer jetzt bei 0 Leben steht, braucht eine Entscheidung (Geist, bleiben, entfernen): Einstellungen gleich öffnen. */
    if (res.ok && res.losers) {
      var cv = Store.curVote();
      (cv ? cv.loserIds : []).forEach(function (id) { var p = Store.findPlayer(id); if (p && p.lives <= 0) openSet[id] = true; });
    }
    /* Stichwahl: neue Runde zuerst beim Server anmelden, damit alte Stimmen nicht noch einmal gezählt werden. */
    if (res.ok && res.runoff && Net.active()) {
      pending = true;
      Net.pushNow().then(function () { pending = false; redraw(); }, function () { pending = false; redraw(); });
      return;
    }
    redraw();
  }

  /* ---------- Spieler: Aussagen je Spieler zum Herunterklappen ---------- */
  function buildPlayerLog(st) {
    var wrap = h("div", { id: "player-log" }, [h("h2", { text: "Aussagen je Spieler" })]);
    st.players.forEach(function (p) {
      var hist = Store.playerHistory(p.id);
      var d = h("details", { cls: "pl" + (p.lives <= 0 ? " out" : ""), id: "pl-" + p.id, on: { toggle: function (e) { openPl[p.id] = e.target.open; } } });
      d.open = !!openPl[p.id];
      d.appendChild(h("summary", {}, [
        h("span", { cls: "pname", text: p.name }),
        U.heartsEl(p.lives, st.settings.startLives),
        h("span", { cls: "cnt", text: hist.length + " Aussagen" })
      ]));
      if (!hist.length) d.appendChild(h("p", { cls: "empty", style: "padding:0 0 10px", text: "Noch keine Aussage." }));
      hist.forEach(function (x) {
        var rk = refKey(p.id, x.ref), editing = editRow === rk;
        var r = h("div", { cls: "hrow" }, [
          h("span", { cls: "hq", text: "Session " + x.n + " · " + x.text }),
          h("span", { cls: "hs", text: x.said || "(ohne Text)" }),
          h("span", { cls: "hact" }, [
            x.result ? h("span", { cls: "rtag r-" + x.result, text: U.RESULT_LABEL[x.result] }) : null,
            h("button", { type: "button", cls: "btn btn-sm btn-text", "data-act": "edit-answer", "aria-expanded": editing ? "true" : "false", text: editing ? "Fertig" : "Ändern",
              on: { click: function () { editRow = editing ? null : rk; redraw(); } } })
          ])
        ]);
        if (editing) {
          var ed = answerEditor(p, x.ref, x.said, x.result, function () { editRow = null; redraw(); });
          ed.style.gridColumn = "1/-1";
          r.appendChild(ed);
        }
        r.style.setProperty("--c", x.color);
        d.appendChild(r);
      });
      wrap.appendChild(d);
    });
    return wrap;
  }

  /* Einstellungen eines Spielers. Bei 0 Leben: ausgeschieden lassen (ausgegraut, ganz draußen), Geist (mit Wahlrecht und/oder Fragen)
     oder aus der Ansicht entfernen. Ein Geist steht nie zur Wahl. */
  function buildPlayerSettings(p, out, ghost) {
    var box = h("div", { cls: "pset", "data-pset": p.id });
    if (out) {
      box.appendChild(h("p", { cls: "hint", style: "margin:0 0 8px", text: p.name + " hat keine Leben mehr. Was soll passieren?" }));
      var seg = function (label, on, fn, act) {
        return h("button", { type: "button", cls: "seg" + (on ? " on" : ""), "data-pmode": act, "aria-pressed": on ? "true" : "false", on: { click: fn } }, [label]);
      };
      box.appendChild(h("div", { cls: "seggroup", role: "group", "aria-label": "Status von " + p.name }, [
        seg("Ausgeschieden", !ghost, function () { Store.setGhost(p.id, null); redraw(); }, "out"),
        seg("Geist", ghost, function () { Store.setGhost(p.id, { vote: true, questions: true }); redraw(); }, "ghost")
      ]));
      box.appendChild(h("p", { cls: "hint", style: "margin:6px 0 8px", text: ghost
        ? "Ein Geist steht nie zur Wahl. Du bestimmst, ob er mitwählt und ob er weiter Fragen bekommt."
        : "Ausgeschieden: ausgegraut, bekommt keine Fragen, wählt nicht mit und steht nicht zur Wahl." }));
      if (ghost) {
        var chk = function (key, label) {
          return h("label", { cls: "rule" }, [h("input", { type: "checkbox", checked: !!p.ghost[key], "data-ghost": key,
            on: { change: function (e) { var g = { vote: p.ghost.vote, questions: p.ghost.questions }; g[key] = e.target.checked; Store.setGhost(p.id, g); redraw(); } } }), label]);
        };
        box.appendChild(chk("vote", "Darf weiter mitwählen"));
        box.appendChild(chk("questions", "Bekommt weiter Fragen"));
      }
    } else {
      box.appendChild(h("p", { cls: "hint", style: "margin:0 0 8px", text: "Der Geist-Modus ist erst bei 0 Leben wählbar." }));
    }
    if (confirmRemove[p.id]) {
      box.appendChild(h("div", { cls: "actions" }, [
        h("span", { text: p.name + " wirklich entfernen?" }),
        h("button", { cls: "btn btn-danger btn-sm", type: "button", "data-act": "remove-yes", text: "Ja, entfernen",
          on: { click: function () { Store.removePlayer(p.id); delete openSet[p.id]; delete confirmRemove[p.id]; redraw(); } } }),
        h("button", { cls: "btn btn-sm", type: "button", text: "Abbrechen", on: { click: function () { confirmRemove[p.id] = false; redraw(); } } })
      ]));
    } else {
      box.appendChild(h("div", { cls: "actions" }, [h("button", { cls: "btn btn-sm btn-text", type: "button", "data-act": "remove", text: "Aus der Ansicht entfernen",
        on: { click: function () { confirmRemove[p.id] = true; redraw(); } } })]));
    }
    return box;
  }

  function card(p) {
    return h("div", { cls: "row" }, [h("span", { cls: "q", text: p.text }), h("span", { cls: "a", text: p.answer })]);
  }

  /* ---------- Seitenleiste ---------- */
  function buildHistory(s, st) {
    var past = st.game.sessions.filter(function (x) { return x !== s; });
    var body = h("div", { cls: "hist-body", id: "history" });
    if (!past.length) body.appendChild(h("p", { cls: "empty", text: "Noch keine abgeschlossene Session." }));
    past.slice().reverse().forEach(function (x) {
      var d = h("details", { cls: "s", id: "hist-s" + x.n, on: { toggle: function (e) { openSess[x.n] = e.target.open; } } });
      d.open = !!openSess[x.n];
      d.style.setProperty("--c", x.color);
      d.appendChild(h("summary", {}, [
        h("span", { cls: "sw" }),
        h("span", { text: "Session " + x.n }),
        h("span", { cls: "cnt", text: x.played.length + " Fragen · " + Store.fmtDur(x.dur) })
      ]));
      x.played.forEach(function (p) {
        var c = card(p);
        c.style.setProperty("--c", x.color);
        d.appendChild(c);
      });
      body.appendChild(d);
    });
    var hist = h("details", { cls: "hist", id: "hist-wrap" }, [
      h("summary", { id: "hist-sum", text: "Frühere Sessions (" + past.length + ")" }),
      body
    ]);
    hist.addEventListener("toggle", function () { histOpen = hist.open; });
    hist.open = histOpen !== null ? histOpen : !window.matchMedia("(max-width:959px)").matches;

    return hist;
  }

  function buildTools() {
    var tools = h("div", { cls: "tools", id: "tools" });
    tools.appendChild(h("a", { cls: "btn", href: "#/fragen", text: "Fragen verwalten" }));
    if (confirmNew) {
      var pos = Store.newGamePos();
      tools.appendChild(h("div", { cls: "confirm", id: "new-confirm" }, [
        h("p", { text: "Das aktuelle Spiel mit allen Sessions wird gelöscht. Es geht bei Frage " + (pos + 1) + " weiter." }),
        h("button", { cls: "btn btn-danger", id: "btn-newgame-yes", type: "button", text: "Ja, neues Spiel",
          on: { click: function () { Store.newGame(); confirmNew = false; errMsg = ""; redraw(); } } }),
        h("button", { cls: "btn", id: "btn-newgame-no", type: "button", text: "Abbrechen",
          on: { click: function () { confirmNew = false; redraw(); } } })
      ]));
    } else {
      tools.appendChild(h("button", { cls: "btn", id: "btn-newgame", type: "button", text: "Neues Spiel",
        on: { click: function () { confirmNew = true; redraw(); } } }));
    }
    return tools;
  }

  function paintTime() {
    var t = $("time");
    if (!t) return;
    var s = Store.curSession();
    if (!s) { t.textContent = "00:00"; t.className = "time"; $("track").style.transform = "scaleX(0)"; return; }
    var rem = Store.remaining(s);
    t.textContent = Store.fmtTime(rem);
    var low = s.status === "running" && rem <= 10;
    t.className = "time" + (low ? " low" : "") + (s.status === "ended" ? " over" : "");
    U.timeCue(s.status === "ended" ? "over" : low ? "low" : "");
    $("track").style.transform = "scaleX(" + (s.dur ? Math.max(0, rem / s.dur) : 0) + ")";
  }

  /* ---------- Hilfen für die Bühne ---------- */
  function setError(m) { errMsg = m; }
  function openSettings(id) { openSet[id] = true; }
  function settingsOpen(id) { return !!openSet[id]; }
  function toggleSettings(id) { openSet[id] = !openSet[id]; confirmRemove[id] = false; }
  function settings(p) { return buildPlayerSettings(p, p.lives <= 0, Store.isGhost(p)); }
  function buildVoteBox() { var s = Store.curSession(); return s && s.status === "ended" && (Store.voteOpen() || s.vote) ? buildVote(s) : null; }
  function buildLogBox() { return Store.state.players.length ? buildPlayerLog(Store.state) : null; }

  Views.spiel = { render: render, refresh: function () { redraw(); }, tick: paintTime, key: key,
    autoResolve: autoResolve,
    net: function (kind) { if (kind === "data") updateVoteOnline(); },
    reset: function () { sel = null; menuOpen = false; openDot = null; editRow = null; confirmEnd = false; confirmNew = false; errMsg = ""; draft = null; voteMsg = null; } };
})();
