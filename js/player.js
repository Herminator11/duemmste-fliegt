/* Handy-Seite für Spieler: Name wählen, geheim abstimmen, Ergebnis und Verlauf ansehen.
   Liest nur die öffentliche Sicht vom Server. Die eigene Stimme bleibt auf dem Server, bis der Master auflöst. */
(function () {
  "use strict";
  var h = U.h;
  var root = document.getElementById("view");
  var params = new URLSearchParams(location.search);
  var code = (params.get("room") || "").toUpperCase().slice(0, 4);
  var data = null;            // letzte Server-Meldung
  var status = "connecting";
  var errMsg = "", busy = false;
  var open = {};              // aufgeklappte Spieler im Verlauf
  var stop = null, prev = null;
  var claim = readClaim();
  if (code) Avatar.room = code;

  function claimKey() { return "dfg_player_" + code; }
  function readClaim() {
    try { var c = JSON.parse(localStorage.getItem(claimKey())); return c && c.token && c.playerId ? c : null; } catch (e) { return null; }
  }
  function writeClaim(c) {
    claim = c;
    try { if (c) localStorage.setItem(claimKey(), JSON.stringify(c)); else localStorage.removeItem(claimKey()); } catch (e) { /* Privatmodus */ }
  }
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return (sec < 600 ? "0" : "") + Math.floor(sec / 60) + ":" + (sec % 60 < 10 ? "0" : "") + (sec % 60); }

  /* ---------- Raumcode eingeben ---------- */
  function renderCode() {
    root.textContent = "";
    var inp = h("input", { type: "text", id: "code-input", autocomplete: "off", autocapitalize: "characters", maxlength: "4", placeholder: "ABCD", "aria-label": "Raumcode" });
    root.appendChild(h("div", { cls: "pl-wrap pl-in" }, [
      h("h1", { text: "Der Dümmste fliegt" }),
      h("p", { cls: "lead", text: "Gib den Raumcode ein, den dir der Spielleiter nennt." }),
      h("form", { cls: "inline-form", id: "code-form", on: { submit: function (e) {
        e.preventDefault();
        var c = inp.value.trim().toUpperCase();
        if (!/^[A-Z]{4}$/.test(c)) { errMsg = "Der Code hat vier Buchstaben."; renderCode(); return; }
        location.search = "?room=" + c;
      } } }, [inp, h("button", { cls: "btn btn-main", type: "submit", text: "Beitreten" })]),
      errMsg ? h("p", { cls: "err", role: "alert", text: errMsg }) : null
    ]));
    inp.focus();
  }

  /* ---------- Namen wählen ---------- */
  function renderPick() {
    root.textContent = "";
    var wrap = h("div", { cls: "pl-wrap" }, [h("h1", { text: "Wer bist du?" }), h("p", { cls: "lead", text: "Raum " + code + ". Tippe auf deinen Namen." })]);
    var v = data && data.view;
    if (!v || !v.players.length) {
      wrap.appendChild(h("p", { cls: "empty", id: "pick-wait", text: status === "reconnecting" ? "Verbindung wird hergestellt …" : "Der Spielleiter hat noch keine Spieler angelegt. Diese Seite aktualisiert sich selbst." }));
    } else {
      var list = h("div", { cls: "pl-pick", id: "pick-list" });
      v.players.forEach(function (p) {
        var taken = data.claimed.indexOf(p.id) >= 0;
        list.appendChild(h("button", { cls: "btn pl-big", type: "button", disabled: taken || busy, "data-pid": p.id,
          on: { click: function () { choose(p.id); } } }, [h("span", { text: p.name }), h("small", {}, [taken ? "vergeben" : U.heartsEl(p.lives, v.startLives)])]));
      });
      wrap.appendChild(list);
      wrap.appendChild(h("p", { cls: "hint", text: "Dein Name ist schon vergeben, obwohl du es bist? Bitte den Spielleiter, ihn freizugeben." }));
    }
    if (errMsg) wrap.appendChild(h("p", { cls: "err", id: "pick-err", role: "alert", text: errMsg }));
    root.appendChild(wrap);
  }
  function choose(pid) {
    busy = true; errMsg = "";
    Net.call("POST", "/api/rooms/" + code + "/claim", { playerId: pid, token: prev ? prev.token : undefined }).then(function (r) {
      writeClaim({ token: r.token, playerId: r.playerId });
      busy = false; prev = null; connect();
    }).catch(function (e) { busy = false; errMsg = e.message; render(); });
  }

  /* ---------- Spielansicht ---------- */
  function card(title, kids, id, cls) {
    return h("section", { cls: "pl-card" + (cls ? " " + cls : ""), id: id }, [h("h2", { text: title })].concat(kids));
  }

  function renderGame() {
    var v = data.view, me = data.me;
    root.textContent = "";
    if (v && v.session) document.documentElement.style.setProperty("--c", v.session.color);
    var wrap = h("div", { cls: "pl-wrap" });
    if (!v) {
      wrap.appendChild(h("p", { cls: "empty", id: "pl-wait", text: "Warte auf den Spielleiter …" }));
      root.appendChild(wrap); return;
    }
    var mine = v.players.filter(function (p) { return p.id === me.playerId; })[0];
    if (!mine) { writeClaim(null); render(); return; }

    wrap.appendChild(h("div", { cls: "pl-head" }, [
      h("div", { cls: "pl-who" }, [
        h("button", { type: "button", cls: "pl-av", id: "pl-avatar", "aria-label": "Figur ändern", on: { click: function () { editAvatar(mine); } } }, [Avatar.render(mine, 52)]),
        h("div", {}, [h("strong", { id: "pl-me", text: mine.name }), U.heartsEl(mine.lives, v.startLives, "pl-hearts")])
      ]),
      h("div", { cls: "time pl-time", id: "pl-time", role: "timer", text: "00:00" })
    ]));
    if (!(data.avatars && data.avatars[mine.id])) {
      wrap.appendChild(h("section", { cls: "pl-card", id: "pl-avhint" }, [
        h("h2", { text: "Gib dir ein Gesicht" }),
        h("p", { cls: "hint", text: "Baue dir eine Figur oder zeichne sie selbst. Sie erscheint auf dem Game Screen." }),
        h("button", { type: "button", cls: "btn btn-main", id: "pl-avatar-open", on: { click: function () { editAvatar(mine); } } }, [Icons.icon("paint-brush"), " Figur wählen"])
      ]));
    }
    if (status !== "online") wrap.appendChild(h("p", { cls: "pl-offline", id: "pl-offline", role: "status", text: "Verbindung unterbrochen. Ich versuche es erneut …" }));

    /* Wer ist dran? Nur während der laufenden Runde. */
    if (v.turn && !v.voting && !v.winner) {
      var tpl = v.players.filter(function (p) { return p.id === v.turn; })[0];
      var mineTurn = v.turn === me.playerId;
      if (tpl) wrap.appendChild(h("p", { cls: "pl-turn" + (mineTurn ? " me" : ""), id: "pl-turn", role: "status" }, [Icons.icon("round-star"), mineTurn ? " Du bist dran!" : " Dran ist " + tpl.name]));
    }
    if (mine.ghost) wrap.appendChild(h("p", { cls: "pl-ghost", id: "pl-ghost", text: "Du bist ein Geist: Du bist raus, kannst aber" + ((v.voterIds || []).indexOf(mine.id) >= 0 ? " weiter mitwählen." : " nicht mehr mitwählen.") }));
    if (v.endgame && !v.winner) wrap.appendChild(h("p", { cls: "pl-turn", id: "pl-final" }, [Icons.icon("laurels-trophy"), " Finale: Nur noch zwei im Rennen"]));

    if (v.winner) wrap.appendChild(h("p", { cls: "pl-win", id: "pl-winner" }, [Icons.icon("laurels-trophy"), " Gewonnen: " + v.winner]));
    else if (v.allOut) wrap.appendChild(h("p", { cls: "pl-win", id: "pl-allout" }, [Icons.icon("death-skull"), " Alle sind ausgeschieden."]));

    /* Frage */
    var qt = v.lastQuestion;
    if (qt && !v.winner) wrap.appendChild(card("Letzte Frage", [
      h("p", { cls: "pl-q", id: "pl-q", text: qt }),
      v.correct ? h("p", { cls: "pl-correct", id: "pl-correct", text: "Richtig: " + v.correct }) : null
    ]));

    /* Abstimmung */
    if (v.voting) wrap.appendChild(voteCard(v, mine, me));
    if (v.vote) wrap.appendChild(resultCard(v, mine));

    /* Veröffentlichte Aussagen zur Frage */
    if (v.statements && v.statements.length) {
      wrap.appendChild(card("Aussagen", v.statements.map(function (s) {
        return h("p", { cls: "pl-st" }, [h("b", { text: s.name }), ": " + (s.text || "–"), s.result ? h("em", { cls: "rtag r-" + s.result, text: U.RESULT_LABEL[s.result] }) : null]);
      }), "pl-statements"));
    }

    /* Verlauf je Spieler zum Aufklappen */
    var logKids = v.players.map(function (p) {
      var d = h("details", { cls: "pl" + (p.out ? " out" : ""), id: "pl-log-" + p.id, on: { toggle: function (e) { open[p.id] = e.target.open; } } });
      d.open = !!open[p.id];
      d.appendChild(h("summary", {}, [
        Avatar.render(p, 30),
        h("span", { cls: "pname", text: p.name + (p.id === me.playerId ? " (du)" : "") }),
        U.heartsEl(p.lives, v.startLives),
        h("span", { cls: "cnt", text: p.answers.length + " Antworten" })
      ]));
      if (!p.answers.length) d.appendChild(h("p", { cls: "empty", style: "padding:0 0 10px", text: "Noch keine veröffentlichte Antwort." }));
      p.answers.forEach(function (a) {
        d.appendChild(h("div", { cls: "hrow" }, [
          h("span", { cls: "hq", text: a.question }),
          h("span", { cls: "hc", text: "Richtig: " + a.correct }),
          h("span", { cls: "hs", text: a.text || "(ohne Text)" }),
          a.result ? h("span", { cls: "rtag r-" + a.result, text: U.RESULT_LABEL[a.result] }) : null
        ]));
      });
      return d;
    });
    wrap.appendChild(card("Rundenverlauf", logKids, "pl-log"));
    wrap.appendChild(h("button", { cls: "btn btn-sm", id: "pl-switch", type: "button", text: "Das bin ich nicht",
      on: { click: function () { prev = claim; writeClaim(null); render(); } } }));
    root.appendChild(wrap);
    paintTime();
  }

  function editAvatar(mine) {
    Avatar.open({ player: { id: mine.id, name: mine.name }, current: (data.avatars && data.avatars[mine.id]) || null, canReset: false,
      onSave: function (a) { return Net.call("POST", "/api/rooms/" + code + "/avatar", { token: claim.token, avatar: a }); } });
  }

  function voteCard(v, mine, me) {
    var kids = [];
    var prog = data.progress || { voted: [], total: 0 };
    var canVote = (v.voterIds || []).indexOf(mine.id) >= 0;
    if (!canVote) {
      kids.push(h("p", { cls: "empty", id: "vote-out", text: "Du bist ausgeschieden und stimmst nicht mehr mit." }));
    } else {
      kids.push(h("p", { cls: "hint", text: "Wer hat die dümmste Antwort gegeben? Deine Stimme bleibt geheim, bis aufgelöst wird. " +
        (v.voteMode === "public" ? "Danach sehen alle, wer wen gewählt hat." : "Danach sehen alle nur die Anzahl der Stimmen.") }));
      var list = h("div", { cls: "pl-pick", id: "vote-list" });
      if (v.voteRound > 1) kids.unshift(h("p", { cls: "pl-turn", id: "vote-runoff", text: "Stichwahl: Gleichstand! Nur die markierten Spieler stehen zur Wahl." }));
      v.players.forEach(function (p) {
        if ((v.candidates || []).indexOf(p.id) < 0) return;
        var on = me.vote === p.id;
        list.appendChild(h("button", { cls: "btn pl-big" + (on ? " on" : ""), type: "button", "data-pid": p.id, "aria-pressed": on ? "true" : "false", disabled: busy,
          on: { click: function () { vote(on ? "" : p.id); } } }, [h("span", { text: p.name + (p.id === me.playerId ? " (du)" : "") }), h("small", {}, [on ? "deine Stimme" : U.heartsEl(p.lives, v.startLives)])]));
      });
      kids.push(list);
      kids.push(h("p", { cls: me.vote ? "ok" : "hint", id: "vote-mine", text: me.vote ? "Stimme abgegeben. Tippe auf einen anderen Namen, um sie zu ändern, oder nochmal auf deine Wahl, um sie zurückzuziehen." : "Du hast noch nicht abgestimmt." }));
    }
    kids.push(h("p", { cls: "hint", id: "vote-progress", text: prog.count + " von " + prog.total + " haben abgestimmt." }));
    if (errMsg) kids.push(h("p", { cls: "err", id: "vote-err", role: "alert", text: errMsg }));
    var c = card("Abstimmung", kids, "pl-vote");
    c.querySelector("h2").prepend(Icons.icon("dunce-cap"), " ");
    c.querySelector("h2").append(": dümmste Antwort");
    return c;
  }
  function vote(target) {
    busy = true; errMsg = "";
    Net.call("POST", "/api/rooms/" + code + "/vote", { token: claim.token, target: target }).then(function () { busy = false; render(); })
      .catch(function (e) { busy = false; errMsg = e.message; render(); });
  }

  function resultCard(v, mine) {
    var kids = [h("ul", { cls: "vrows", id: "res-counts" }, v.players.filter(function (p) { return v.vote.counts[p.id]; }).map(function (p) {
      var n = v.vote.counts[p.id];
      return h("li", {}, [h("b", { text: p.name }), ": " + n + (n === 1 ? " Stimme" : " Stimmen")]);
    }))];
    if (v.vote.rows) kids.push(h("ul", { cls: "vrows", id: "res-rows" }, v.vote.rows.map(function (r) { return h("li", {}, [h("b", { text: r.voter }), " → ", r.target]); })));
    var lost = v.vote.losers.indexOf(mine.name) >= 0;
    kids.push(h("p", { cls: "vloser", id: "res-loser" }, [Icons.icon("broken-heart"), " " + v.vote.losers.join(", ") + " verliert ein Leben."]));
    if (lost) kids.push(h("p", { cls: "err", id: "res-me", text: "Das warst du." }));
    return card("Ergebnis der Abstimmung", kids, "pl-result");
  }

  function paintTime() {
    var t = document.getElementById("pl-time");
    if (!t || !data || !data.view || !data.view.session) { if (t) t.textContent = ""; return; }
    var v = data.view, rem = v.remaining;
    if (v.session.status === "running") rem = Math.max(0, v.remaining - (Date.now() - data.receivedAt) / 1000);
    t.textContent = fmt(rem);
    t.className = "time pl-time" + (v.session.status === "running" && rem <= 10 ? " low" : "") + (v.session.status === "ended" ? " over" : "");
    U.timeCue(v.session.status === "ended" ? "over" : v.session.status === "running" && rem <= 10 ? "low" : "");
  }

  /* ---------- Ablauf ---------- */
  function render() {
    if (!code) return renderCode();
    if (!claim) return renderPick();
    if (!data || !data.me) {
      root.textContent = "";
      root.appendChild(h("div", { cls: "pl-wrap" }, [h("p", { cls: "empty", id: "pl-wait", text: status === "reconnecting" ? "Verbindung wird hergestellt …" : "Verbinde …" })]));
      return;
    }
    renderGame();
  }

  function connect() {
    if (stop) stop();
    stop = Net.subscribe(code, claim ? claim.token : "", function (d) {
      data = d;
      Avatar.overrides = d.avatars || null;
      if (claim && !d.me && d.view) { writeClaim(null); connect(); return; }   // Master hat den Namen freigegeben
      status = "online";
      render();
    }, function (s) { status = s; if (s !== "online" || !data) render(); });
  }

  if (!code) renderCode();
  else {
    // erst prüfen, ob der Raum existiert
    Net.call("GET", "/api/rooms/" + code).then(function (d) { data = d; connect(); render(); })
      .catch(function (e) { errMsg = e.status === 404 ? "Diesen Raum gibt es nicht. Prüfe den Code." : "Der Server ist nicht erreichbar."; code = ""; renderCode(); });
  }
  setInterval(paintTime, 500);
})();
