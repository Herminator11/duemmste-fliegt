/* Seite „Game Screen“: nur öffentliche Daten für Fernseher oder geteiltes Fenster.
   Alles kommt aus der öffentlichen Sicht (Store.publicView): die richtige Antwort erst nach dem Veröffentlichen,
   keine Entwürfe, bei anonymer Abstimmung keine Wähler. */
(function () {
  "use strict";
  var h = U.h, $ = U.$;
  var root = null, openDot = null, animKey = "", phase = "", entered = false;
  /* Fernanzeige: #/anzeige?room=CODE liest den Server-Strom statt des lokalen Speichers. */
  var remote = null;     // { code, stop, view, data, status }
  var side = null;       // lokale Anzeige im Master-Browser: liest nur den Fortschritt der Abstimmung vom Server

  function roomParam() {
    var m = /[?&]room=([A-Za-z]{4})\b/.exec(location.hash);
    return m ? m[1].toUpperCase() : null;
  }
  function syncRemote() {
    var code = roomParam();
    if (!code) {
      if (remote) { remote.stop(); remote = null; Avatar.room = null; Avatar.overrides = null; }
      var mine = window.Net && Net.available() && Net.room();
      if (mine && (!side || side.code !== mine.code)) {
        if (side) side.stop();
        var sd = { code: mine.code, data: null, stop: null };
        sd.stop = Net.subscribe(mine.code, "", function (d) { sd.data = d; render(); }, function () {});
        side = sd;
      } else if (!mine && side) { side.stop(); side = null; }
      return;
    }
    if (side) { side.stop(); side = null; }
    if (remote && remote.code === code) return;
    if (remote) remote.stop();
    var r = { code: code, view: null, data: null, status: "connecting", stop: null };
    remote = r;
    Avatar.room = code;
    r.stop = Net.subscribe(code, "", function (d) { r.data = d; r.view = d.view; r.status = "online"; Avatar.overrides = d.avatars || null; render(); },
      function (s) { r.status = s; if (!r.view) render(); });
  }
  /* Testanzeige (#/anzeige?demo): feste Beispieldaten, ein beendeter Durchgang. Reihum, jeder Spieler bekommt seine eigene Frage:
     Anna, Ben, Cleo, Dora, dann wieder Anna usw. Zwei Fragen je Spieler, mit allen Ergebnissen. Berührt weder Spielstand noch Server. */
  function isDemo() { return /[?&]demo\b/.test(location.hash); }
  function demoView() {
    var rounds = [
      ["Anna", "Buchstabiere „nämlich“.", "N Ä M L I C H", "N Ä M L I C H", "richtig"],
      ["Ben", "Buchstabiere folgendes Wort: Bangkok?", "B A N G K O K", "B A N K O K", "falsch"],
      ["Cleo", "Aus wie vielen Buchstaben besteht die ausgeschriebene Zahl 6?", "5", "5", "richtig"],
      ["Dora", "Nenne irgendeinen bekannten Music-Streaming-Dienst.", "Spotify, Amazon Music, Deezer, Apple Music …", "Spotify", "richtig"],
      ["Anna", "Buchstabiere das englische Wort „jealous“.", "J E A L O U S", "J E A L O U S", "richtig"],
      ["Ben", "Buchstabiere das franz. Wort „Monsieur“.", "M O N S I E U R", "M O N S I E R", "falsch"],
      ["Cleo", "Wie viele Buchstaben hat das moderne lateinische Alphabet?", "26", "24", "falsch"],
      ["Dora", "Buchstabiere das Wort Zucchini.", "Z U C C H I N E", "", "keine"]
    ];
    var lives = { Anna: 3, Ben: 2, Cleo: 3, Dora: 3 };
    return {
      players: ["Anna", "Ben", "Cleo", "Dora"].map(function (name, idx) {
        var info = rounds.filter(function (r) { return r[0] === name; }).map(function (r) {
          return { question: r[1], correct: r[2], text: r[3], result: r[4] };
        });
        return { id: "d" + idx, name: name, lives: lives[name], out: false, avatar: null,
          dots: info.map(function (x) { return x.result; }), dotInfo: info, answers: info.slice().reverse() };
      }),
      startLives: 3, session: { n: 1, color: "#ffb347", status: "ended", dur: 600 }, remaining: 0,
      lastQuestion: null, statements: null, correct: null, round: 1, voteMode: "anonymous", showVoted: false, voted: [],
      vote: null, voting: false, gameId: "demo", voteKey: null, winner: null, allOut: false
    };
  }
  function currentView() { return isDemo() ? demoView() : remote ? remote.view : Store.publicView(); }
  function progress() {
    var d = remote ? remote.data : side ? side.data : null;
    return d && d.progress ? d.progress : null;
  }
  function timeInfo(v) {
    if (!v.session) return null;
    var rem = v.remaining;
    if (remote && v.session.status === "running") rem = Math.max(0, v.remaining - (Date.now() - remote.data.receivedAt) / 1000);
    return { rem: rem, status: v.session.status, dur: v.session.dur };
  }

  /* Medien-Platz der Kachel: heute ein Platzhalter mit Initialen, später Avatar oder Video. */
  function media(p) {
    if (window.Avatar && Avatar.render) { var a = Avatar.render(p); if (a) return h("div", { cls: "dsp-media" }, [a]); }
    var hash = 0;
    for (var i = 0; i < p.name.length; i++) hash = (hash * 31 + p.name.charCodeAt(i)) % 360;
    var ini = p.name.trim().split(/\s+/).map(function (w) { return w.charAt(0); }).join("").slice(0, 2).toUpperCase();
    var m = h("div", { cls: "dsp-media" }, [h("span", { cls: "dsp-ini", text: ini })]);
    m.style.setProperty("--mc", "hsl(" + hash + " 55% 38%)");
    return m;
  }

  /* Das zuletzt verlorene Herz (das erste gebrochene) bekommt die Wackel-Animation. */
  function markLost(el) {
    var first = el.querySelector(".h-lost");
    if (first) first.classList.add("just-lost");
    return el;
  }

  /* Ein Kreis je Frage. Nach Rundenende zeigt Hover (oder Tippen, Tastatur) Frage, richtige Antwort und die Antwort des Spielers. */
  function dot(p, d, i) {
    var info = p.dotInfo && p.dotInfo[i];
    var cls = "dd" + (d ? " r-" + d : "");
    var pos = "--di:" + i;
    if (!info) return h("i", { cls: cls, title: d ? U.RESULT_LABEL[d] : "offen", style: pos });
    if (!d) cls += " r-keine";
    var key = p.id + ":" + i, isOpen = openDot === key;
    var verdict = info.result ? U.RESULT_LABEL[info.result] : "nicht beantwortet";
    var head = info.result === "richtig" ? "Richtig beantwortet" : info.result === "falsch" ? "Falsch beantwortet" : "Nicht beantwortet";
    var pop = h("span", { cls: "dsp-pop res-" + (info.result || "keine"), role: "group", "aria-label": "Frage " + (i + 1) + " von " + p.name }, [
      h("span", { cls: "dsp-pa" }, [
        h("small", { cls: "dsp-plab", text: "Frage " + (i + 1) + " · " + head }),
        h("span", { cls: "dsp-pq", text: info.question }),
        h("span", { cls: "dsp-prow" }, [
          h("small", { cls: "dsp-correct", text: "Richtig: " + info.correct }),
          h("span", { cls: "dsp-pt" }, [
            info.text ? p.name + ": " + info.text : h("i", { cls: "dsp-none", text: p.name + " hat nicht geantwortet" }),
            h("em", { cls: "rtag r-" + (info.result || "keine"), text: verdict })
          ])
        ])
      ])
    ]);
    var btn = h("button", { type: "button", cls: "dd-btn", "aria-expanded": isOpen ? "true" : "false",
      "aria-label": "Frage " + (i + 1) + ": " + verdict,
      style: pos, on: { click: function () { openDot = openDot === key ? null : key; render(); } } }, [h("i", { cls: cls })]);
    return h("span", { cls: "dd-wrap" + (isOpen ? " open" : "") }, [btn, pop]);
  }

  function tile(p, v, voted, anim, idx) {
    var counts = v.vote ? v.vote.counts : null;
    var n = counts && counts[p.id] ? counts[p.id] : 0;
    var loser = !!(v.vote && v.vote.loserIds.indexOf(p.id) >= 0);
    var isVoted = !!(v.voting && v.showVoted && voted.indexOf(p.id) >= 0);
    var isTurn = !!v.turn && v.turn === p.id;
    var runoff = !!v.voting && v.voteRound > 1 && v.candidates;
    var cand = runoff && v.candidates.indexOf(p.id) >= 0;
    var cls = "dsp-p" + (p.out && !p.ghost ? " out" : "") + (p.ghost ? " ghost" : "") + (isTurn ? " turn" : "") + (cand ? " cand" : "") + (runoff && !cand ? " nocand" : "")
      + (isVoted ? " voted" : "") + (loser ? " loser" : "") + (anim ? " anim" : "");
    var t = h("div", { cls: cls, "data-pid": p.id });
    t.style.setProperty("--i", String(idx));
    t.style.setProperty("--n", String(v.players.length));
    t.appendChild(media(p));
    if (p.dots.length) {
      var dots = h("span", { cls: "dsp-dots", "aria-label": "Ergebnisse dieser Runde" });
      p.dots.forEach(function (d, i) { dots.appendChild(dot(p, d, i)); });
      t.appendChild(dots);
    }
    t.appendChild(h("span", { cls: "dsp-hearts" }, [
      loser ? markLost(U.heartsEl(p.lives, v.startLives)) : U.heartsEl(p.lives, v.startLives),
      v.voting && v.showVoted && v.voterIds && v.voterIds.indexOf(p.id) >= 0 ? h("span", { cls: "dsp-check" + (isVoted ? " on" : ""), role: "img", "aria-label": isVoted ? "hat gestimmt" : "noch nicht gestimmt" }, [Icons.icon("check-mark")]) : null
    ]));
    t.appendChild(h("span", { cls: "dsp-name", text: p.name }));
    if (isTurn) t.appendChild(h("span", { cls: "dsp-turn", role: "status" }, ["Dran"]));
    else if (p.ghost) t.appendChild(h("span", { cls: "dsp-ghost" }, ["Geist"]));
    if (n) t.appendChild(h("span", { cls: "dsp-pill" }, [Icons.icon("vote"), " " + n + (n === 1 ? " Stimme" : " Stimmen")]));
    return t;
  }

  function render(r) {
    if (r) root = r;
    if (!root) return;
    syncRemote();
    root.textContent = "";
    var v = currentView();
    if (remote) document.documentElement.style.setProperty("--c", v && v.session ? v.session.color : "#ffb347");
    else App.applyColor();
    if (!v) {
      phase = "";
      root.appendChild(h("div", { cls: "dsp" }, [h("p", { cls: "dsp-idle", id: "dsp-wait",
        text: remote.status === "reconnecting" ? "Verbindung wird hergestellt …" : "Warte auf den Host …" })]));
      return;
    }
    phase = v.voting ? "vote" : "";
    var pr = progress();
    var voted = v.showVoted ? (v.voted || []).concat(pr ? pr.voted : []) : [];
    var key = v.vote ? v.gameId + ":" + v.round + ":" + v.vote.loserIds.join(",") : "";
    var anim = !!key && key !== animKey;
    animKey = key;

    var page = h("div", { cls: "dsp" });
    var fs = h("button", { cls: "ibtn dsp-fs", id: "dsp-fs", type: "button", title: "Vollbild", "aria-label": "Vollbild",
      on: { click: function () { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); } } }, [Icons.icon("expand")]);
    page.appendChild(h("div", { cls: "dsp-head" }, [
      h("span", { cls: "dsp-round", id: "dsp-round" }, [v.round ? "Runde " + v.round : "Bereit"]),
      h("span", { cls: "dsp-title", text: "Der Dümmste fliegt" }),
      h("span", { cls: "dsp-right" }, [
        h("span", { cls: "dsp-timer time", id: "time", role: "timer" }, [Icons.icon("stopwatch"), h("span", { id: "time-text", text: "00:00" })]),
        h("span", { cls: "dsp-mode", id: "dsp-mode" }, [Icons.icon(v.voteMode === "public" ? "all-seeing-eye" : "domino-mask"), " " + (v.voteMode === "public" ? "Offene Stimmen" : "Anonyme Stimmen")]),
        fs
      ])
    ]));
    page.appendChild(h("div", { cls: "track dsp-track" }, [h("i", { id: "track" })]));

    if (v.winner) page.appendChild(h("p", { cls: "dsp-win", id: "dsp-winner" }, [Icons.icon("laurels-trophy"), " Gewonnen: " + v.winner]));
    else if (v.allOut) page.appendChild(h("p", { cls: "dsp-win", id: "dsp-allout" }, [Icons.icon("death-skull"), " Alle sind ausgeschieden."]));

    if (v.endgame && !v.winner) page.appendChild(h("p", { cls: "dsp-final", id: "dsp-final" }, [Icons.icon("laurels-trophy"), " Finale: Nur noch zwei im Rennen"]));

    if (v.players.length) {
      var grid = h("div", { cls: "dsp-grid" + (entered ? "" : " enter"), id: "dsp-players" });
      entered = true;
      v.players.forEach(function (p, i) { grid.appendChild(tile(p, v, voted, anim, i)); });
      page.appendChild(grid);
    } else {
      page.appendChild(h("p", { cls: "dsp-idle", id: "dsp-idle", text: "Noch keine Spieler." }));
    }

    if (v.voting && !v.vote) {
      var total = pr ? pr.total : (v.voterIds || []).length;
      var runoff = v.voteRound > 1;
      var cn = runoff && v.candidates ? v.players.filter(function (p) { return v.candidates.indexOf(p.id) >= 0; }).map(function (p) { return p.name; }).join(" oder ") : "";
      page.appendChild(h("p", { cls: "dsp-label", id: "dsp-voting" }, [Icons.icon("dunce-cap"),
        runoff ? " Stichwahl: Gleichstand! Nur " + cn + " stehen zur Wahl." : " Abstimmung läuft: Wer hat die dümmste Antwort gegeben?",
        pr ? " " + pr.count + " von " + total + " haben abgestimmt." : ""]));
    }
    if (v.vote) {
      var names = v.vote.losers.join(", ");
      page.appendChild(h("p", { cls: "dsp-loser", id: "dsp-loser" }, [Icons.icon("broken-heart"), " " + names + " verliert ein Leben"]));
      if (v.vote.rows) {
        var box = h("div", { cls: "dsp-vote", id: "dsp-vote" }, [h("h2", { text: "Wer hat wen gewählt?" })]);
        var list = h("ul", {});
        v.vote.rows.forEach(function (rw) { list.appendChild(h("li", {}, [h("b", { text: rw.voter }), " → ", rw.target])); });
        box.appendChild(list);
        page.appendChild(box);
      }
    }

    if (v.statements && v.statements.length) {
      var st = h("div", { cls: "dsp-st", id: "dsp-statements" });
      v.statements.forEach(function (s) {
        st.appendChild(h("div", { cls: "dsp-s" + (s.result ? " r-" + s.result : "") }, [
          h("b", { text: s.name }), h("span", { text: s.text || "(ohne Text)" }),
          s.result ? h("em", { cls: "rtag r-" + s.result, text: U.RESULT_LABEL[s.result] }) : null
        ]));
      });
      if (v.correct) page.appendChild(h("p", { cls: "dsp-correct-main", id: "dsp-correct", text: "Richtig: " + v.correct }));
      page.appendChild(st);
    }

    if (!v.session && !v.winner && !v.allOut && v.players.length) {
      page.appendChild(h("p", { cls: "dsp-idle", id: "dsp-idle", text: "Warten auf die erste Runde …" }));
    }

    page.addEventListener("click", skipReveal);
    root.appendChild(page);
    paintTime();
  }

  /* Die Ansage der Verlierer läuft höchstens ca. 2 Sekunden und endet sofort bei Klick oder Leertaste. */
  function skipReveal() {
    Array.prototype.forEach.call(document.querySelectorAll(".dsp-p.anim"), function (t) { t.classList.remove("anim"); });
  }

  function paintTime() {
    var t = $("time"), tt = $("time-text");
    if (!t || !tt) return;
    var ti;
    if (remote) ti = remote.view ? timeInfo(remote.view) : null;
    else if (isDemo()) ti = { rem: 0, status: "ended", dur: 600 };
    else { var s = Store.curSession(); ti = s ? { rem: Store.remaining(s), status: s.status, dur: s.dur } : null; }
    var tr = $("track");
    if (phase === "vote") { tt.textContent = "Abstimmung"; t.className = "dsp-timer time vote"; if (tr) tr.style.transform = "scaleX(0)"; return; }
    if (!ti) { tt.textContent = "00:00"; t.className = "dsp-timer time"; if (tr) tr.style.transform = "scaleX(0)"; return; }
    tt.textContent = Store.fmtTime(ti.rem);
    t.className = "dsp-timer time" + (ti.status === "running" && ti.rem <= 10 ? " low" : "") + (ti.status === "ended" ? " over" : "");
    if (tr) tr.style.transform = "scaleX(" + (ti.dur ? Math.max(0, ti.rem / ti.dur) : 0) + ")";
  }

  Views.anzeige = { render: render, refresh: function () { render(); }, tick: paintTime,
    key: function (ev) {
      if (ev.key === "Escape" && openDot) { openDot = null; render(); }
      else if (ev.key === " " || ev.key === "Enter") skipReveal();
    },
    reset: function () { openDot = null; entered = false; } };
})();
