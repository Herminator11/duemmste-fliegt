/* Seite „Start“: Überblick, Spiel starten oder fortsetzen, Datensicherung */
(function () {
  "use strict";
  var h = U.h;
  var root = null;
  var confirmNew = false, pendingImport = null, msg = null, playerErr = "", onlineErr = "", confirmClose = false, copied = "";

  function render(r) {
    if (r) root = r;
    if (!root) return;
    root.textContent = "";
    App.applyColor();
    var st = Store.state, s = Store.curSession();
    var page = h("div", { cls: "page" });
    var grid = h("div", { cls: "start-grid" });

    /* linke Spalte: Spielstand */
    var left = h("section", {});
    var played = Store.playedCount();
    var q = st.questions[st.game.pos];

    if (!s) {
      left.appendChild(h("h1", { id: "start-title", text: "Neues Spiel" }));
      left.appendChild(h("p", { cls: "lead", text: st.questions.length
        ? st.questions.length + " Fragen bereit. Es geht bei Frage " + (st.game.pos + 1) + " los."
        : "Es gibt noch keine Fragen." }));
    } else {
      left.appendChild(h("h1", { id: "start-title", text: s.status === "ended" ? "Spiel pausiert zwischen Sessions" : "Spiel läuft" }));
      left.appendChild(h("p", { cls: "lead", text: "Session " + s.n + " " + (s.status === "running" ? "läuft" : s.status === "paused" ? "ist pausiert" : "ist beendet") + "." }));
      left.appendChild(h("ul", { cls: "facts" }, [
        h("li", {}, [h("span", { text: "Sessions in diesem Spiel" }), h("b", { id: "f-sessions", text: String(st.game.sessions.length) })]),
        h("li", {}, [h("span", { text: "Fragen gespielt" }), h("b", { id: "f-played", text: String(played) })]),
        h("li", {}, [h("span", { text: "Nächste Frage" }), h("b", { id: "f-next", text: q ? "Nr. " + (st.game.pos + 1) + " von " + st.questions.length : "keine" })])
      ]));
    }

    if (q) {
      left.appendChild(h("div", { cls: "preview" }, [
        h("p", { cls: "pq", id: "start-q", text: q.text }),
        h("p", { cls: "pa", text: q.answer })
      ]));
    }

    var actions = h("div", { cls: "actions" });
    actions.appendChild(h("a", { cls: "btn btn-main", id: "btn-play", href: "#/spiel", text: s ? "Weiterspielen" : "Spiel starten" }));
    if (s) {
      actions.appendChild(h("button", { cls: "btn", id: "btn-newgame", type: "button", text: "Neues Spiel",
        on: { click: function () { confirmNew = true; render(); } } }));
    }
    left.appendChild(actions);
    if (confirmNew) {
      var pos = Store.newGamePos();
      left.appendChild(h("div", { cls: "confirm", id: "new-confirm" }, [
        h("p", { text: "Das aktuelle Spiel mit allen Sessions wird gelöscht. Es geht bei Frage " + (pos + 1) + " weiter." }),
        h("button", { cls: "btn btn-danger", id: "btn-newgame-yes", type: "button", text: "Ja, neues Spiel",
          on: { click: function () { Store.newGame(); confirmNew = false; if (Views.spiel.reset) Views.spiel.reset(); render(); } } }),
        h("button", { cls: "btn", id: "btn-newgame-no", type: "button", text: "Abbrechen",
          on: { click: function () { confirmNew = false; render(); } } })
      ]));
    }
    grid.appendChild(left);

    /* rechte Spalte: Fragen und Sicherung */
    var right = h("section", {});
    right.appendChild(buildPlayers(st));
    right.appendChild(buildRules());
    right.appendChild(buildOnline());
    right.appendChild(h("div", { cls: "block" }, [
      h("h3", { text: "Game Screen" }),
      h("p", { text: "Zeigt Spieler, Leben, Ergebnis-Kreise und veröffentlichte Aussagen. Fragen erscheinen erst nach Rundenende, wenn man über einen Kreis fährt. Die richtige Antwort erscheint erst, wenn du die Aussagen veröffentlichst. Öffne ihn in einem eigenen Fenster und teile oder übertrage dieses Fenster." }),
      h("div", { cls: "actions" }, [
        h("a", { cls: "btn", id: "btn-display", href: "#/anzeige", target: "_blank", rel: "noopener", text: "Game Screen öffnen" }),
        h("a", { cls: "btn", id: "btn-display-demo", href: "#/anzeige?demo", target: "_blank", rel: "noopener", text: "Testanzeige öffnen" })
      ])
    ]));
    right.appendChild(h("div", { cls: "block" }, [
      h("h3", { text: "Fragen" }),
      h("p", { id: "start-count", text: st.questions.length + " Fragen gespeichert." }),
      h("a", { cls: "btn", href: "#/fragen", text: "Fragen verwalten" })
    ]));

    var backup = h("div", { cls: "block" }, [
      h("h3", { text: "Datensicherung" }),
      h("p", { text: "Alle Daten liegen nur in diesem Browser auf diesem Gerät. Sichere sie regelmäßig als Datei." })
    ]);
    var fileInput = h("input", { type: "file", id: "import-file", accept: "application/json,.json", hidden: true,
      on: { change: onFile } });
    backup.appendChild(h("div", { cls: "actions" }, [
      h("button", { cls: "btn", id: "btn-export", type: "button", text: "Sichern (Export)", on: { click: doExport } }),
      h("button", { cls: "btn", id: "btn-import", type: "button", text: "Wiederherstellen (Import)",
        on: { click: function () { fileInput.click(); } } }),
      fileInput
    ]));
    if (pendingImport) {
      backup.appendChild(h("div", { cls: "confirm", id: "import-confirm" }, [
        h("p", { text: "Die Sicherung enthält " + pendingImport.questions.length + " Fragen und " + pendingImport.game.sessions.length + " Sessions. Sie ersetzt alles, was jetzt gespeichert ist." }),
        h("button", { cls: "btn btn-danger", id: "btn-import-yes", type: "button", text: "Ja, ersetzen", on: { click: doImport } }),
        h("button", { cls: "btn", id: "btn-import-no", type: "button", text: "Abbrechen",
          on: { click: function () { pendingImport = null; render(); } } })
      ]));
    }
    if (msg) backup.appendChild(h("p", { cls: msg.err ? "err" : "ok", id: "backup-msg", role: "status", text: msg.text, style: "margin-top:12px" }));
    right.appendChild(backup);
    grid.appendChild(right);

    page.appendChild(grid);
    page.appendChild(h("p", { cls: "hint credit", id: "credit" }, ["Icons von ", h("a", { href: "https://game-icons.net", target: "_blank", rel: "noopener", text: "game-icons.net" }),
      " (Lorc, Delapouite, Skoll, sbed, Zeromancer), CC BY 3.0. Figuren: DiceBear mit Open Peeps und Lorelei (CC0)."]));
    root.appendChild(page);
    App.updateChip();
  }

  function buildRules() {
    var box = h("div", { cls: "block", id: "rules-block" }, [h("h3", { text: "Spielregeln" })]);
    box.appendChild(U.rulesBox(Store, function () {
      var old = document.getElementById("rules-block");
      if (old) old.replaceWith(buildRules());
    }));
    return box;
  }

  /* ---------- Online-Raum für Handys ---------- */
  function buildOnline() {
    var box = h("div", { cls: "block", id: "online-block" }, [h("h3", { text: "Online-Raum (Handys)" })]);
    if (!Net.available()) {
      box.appendChild(h("p", { id: "online-na", text: "Handy-Abstimmung braucht den Server. Starte ihn mit start.sh, start.bat oder „npm start“ und öffne die Seite über die angezeigte Adresse." }));
      return box;
    }
    var room = Net.room(), inf = Net.info;
    if (!room || inf.status === "lost") {
      box.appendChild(h("p", { text: "Spieler stimmen am eigenen Handy geheim ab. Sie treten mit einem Raumcode oder Link bei, ohne etwas zu installieren." }));
      if (inf.status === "lost") box.appendChild(h("p", { cls: "err", role: "alert", text: inf.error }));
      if (onlineErr) box.appendChild(h("p", { cls: "err", id: "online-err", role: "alert", text: onlineErr }));
      box.appendChild(h("button", { cls: "btn btn-main", id: "btn-room-open", type: "button", text: "Raum öffnen",
        on: { click: function () {
          onlineErr = "";
          Net.create().then(function () { refreshOnline(); }).catch(function (e) { onlineErr = "Raum konnte nicht geöffnet werden: " + e.message; refreshOnline(); });
        } } }));
      return box;
    }
    var statusText = inf.status === "online" ? "verbunden" : inf.status === "connecting" ? "verbinde …" : "Verbindung unterbrochen, versuche es erneut …";
    box.appendChild(h("p", { cls: "room-code", id: "room-code", text: room.code }));
    box.appendChild(h("p", { cls: "hint", id: "room-status", text: "Server: " + statusText }));
    box.appendChild(h("p", { cls: "hint", style: "margin-bottom:4px", text: "Spieler öffnen diesen Link auf dem Handy (im selben WLAN oder über die öffentliche Adresse deines Servers) und wählen ihren Namen:" }));
    box.appendChild(h("p", { cls: "room-url", id: "room-url", text: Net.joinUrl() }));
    box.appendChild(h("div", { cls: "actions" }, [
      h("button", { cls: "btn btn-sm", id: "btn-copy-join", type: "button", text: copied === "join" ? "Kopiert" : "Link kopieren",
        on: { click: function () { copy(Net.joinUrl(), "join"); } } }),
      h("button", { cls: "btn btn-sm", id: "btn-copy-display", type: "button", text: copied === "display" ? "Kopiert" : "Link für Game Screen kopieren",
        on: { click: function () { copy(Net.displayUrl(), "display"); } } })
    ]));
    var claimed = Net.claimed();
    var st = Store.state;
    if (!st.players.length) box.appendChild(h("p", { cls: "hint", style: "margin-top:10px", text: "Lege zuerst oben Spieler an. Auf dem Handy wählt jeder seinen Namen." }));
    var list = h("ul", { cls: "plist", id: "room-players" });
    st.players.forEach(function (p) {
      var on = claimed.indexOf(p.id) >= 0;
      list.appendChild(h("li", {}, [
        h("span", { cls: "pname", text: p.name }),
        h("span", { cls: on ? "ok" : "hint", style: "margin:0", text: on ? "Handy verbunden" : "noch kein Handy" }),
        on ? h("button", { cls: "btn btn-sm", type: "button", text: "Freigeben", "data-act": "release", "aria-label": p.name + " freigeben",
          on: { click: function () { Net.release(p.id); } } }) : null
      ]));
    });
    box.appendChild(list);
    if (confirmClose) {
      box.appendChild(h("div", { cls: "confirm", id: "room-confirm" }, [
        h("p", { text: "Der Raum wird geschlossen, die Handys werden getrennt. Das Spiel bleibt auf diesem Gerät erhalten." }),
        h("button", { cls: "btn btn-danger", id: "btn-room-close-yes", type: "button", text: "Ja, Raum schließen",
          on: { click: function () { confirmClose = false; Net.close().then(refreshOnline); } } }),
        h("button", { cls: "btn", type: "button", text: "Abbrechen", on: { click: function () { confirmClose = false; refreshOnline(); } } })
      ]));
    } else {
      box.appendChild(h("div", { cls: "actions", style: "margin-top:12px" }, [
        h("button", { cls: "btn btn-sm", id: "btn-room-close", type: "button", text: "Raum schließen", on: { click: function () { confirmClose = true; refreshOnline(); } } })
      ]));
    }
    return box;
  }
  function refreshOnline() {
    var old = document.getElementById("online-block");
    if (old) old.replaceWith(buildOnline());
  }
  function copy(text, which) {
    var done = function () { copied = which; refreshOnline(); setTimeout(function () { copied = ""; refreshOnline(); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done); else done();
  }

  function buildPlayers(st) {
    var box = h("div", { cls: "block", id: "players-block" }, [h("h3", { text: "Spieler" })]);
    var started = st.game.sessions.length > 0;
    var name = h("input", { type: "text", id: "player-name", autocomplete: "off", placeholder: "Name", "aria-label": "Name des Spielers", maxlength: "40" });
    var form = h("form", { cls: "inline-form", id: "player-form", on: { submit: function (e) {
      e.preventDefault();
      if (!Store.addPlayer(name.value)) playerErr = name.value.trim() ? "Diesen Namen gibt es schon." : "Bitte einen Namen eingeben.";
      else playerErr = "";
      render();
      var f = document.getElementById("player-name"); if (f) f.focus();
    } } }, [name, h("button", { cls: "btn", id: "player-add", type: "submit", text: "Hinzufügen" })]);
    box.appendChild(form);
    if (playerErr) box.appendChild(h("p", { cls: "err", id: "player-err", role: "alert", text: playerErr }));

    if (!st.players.length) box.appendChild(h("p", { cls: "hint", id: "players-empty", style: "margin-top:10px", text: "Noch keine Spieler. Ohne Spieler läuft das Spiel wie bisher, nur mit Timer und Fragen." }));
    var list = h("ul", { cls: "plist", id: "players-list" });
    st.players.forEach(function (p) {
      list.appendChild(h("li", {}, [
        Avatar.render(p, 40),
        h("span", { cls: "pname", text: p.name }),
        U.heartsEl(p.lives, st.settings.startLives),
        h("button", { cls: "btn btn-sm", type: "button", "data-act": "avatar", "aria-label": "Figur von " + p.name + " ändern",
          on: { click: function () {
            Avatar.open({ player: { id: p.id, name: p.name }, current: p.avatar, canReset: !!p.avatar,
              onSave: function (a) { return Net.assignAvatar(p.id, a).then(function () { render(); }); } });
          } } }, [Icons.icon("paint-brush"), " Figur"]),
        h("button", { cls: "btn btn-sm", type: "button", text: "Entfernen", "data-act": "rm", "aria-label": p.name + " entfernen",
          on: { click: function () { Store.removePlayer(p.id); render(); } } })
      ]));
    });
    box.appendChild(list);

    var lives = h("input", { type: "number", id: "start-lives", min: "1", max: "99", inputmode: "numeric", value: String(st.settings.startLives),
      on: { change: function (e) { if (!Store.setStartLives(e.target.value)) e.target.value = String(Store.state.settings.startLives); else render(); } } });
    box.appendChild(h("label", { cls: "lives-field" }, ["Leben pro Spieler", lives]));
    box.appendChild(h("p", { cls: "hint", text: started ? "Änderungen gelten ab dem nächsten Spiel. „Neues Spiel“ setzt alle Leben zurück, die Namen bleiben." : "Gilt sofort für alle Spieler." }));
    return box;
  }

  function doExport() {
    var blob = new Blob([JSON.stringify(Store.exportData(), null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "duemmste-fliegt-sicherung-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    msg = { text: "Sicherung wurde heruntergeladen.", err: false };
    render();
  }

  function onFile(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var obj = JSON.parse(rd.result);
        if (!obj || !Array.isArray(obj.questions) || !obj.game || !Array.isArray(obj.game.sessions)) throw new Error("format");
        pendingImport = obj; msg = null;
      } catch (e) {
        pendingImport = null; msg = { text: "Die Datei ist keine gültige Sicherung dieser Anwendung.", err: true };
      }
      render();
    };
    rd.readAsText(f);
  }

  function doImport() {
    var res = Store.importData(pendingImport);
    pendingImport = null;
    msg = res.ok ? { text: "Wiederhergestellt: " + res.questions + " Fragen, " + res.sessions + " Sessions." + (res.dropped ? " " + res.dropped + " beschädigte Einträge wurden übersprungen." : ""), err: false } : { text: res.error, err: true };
    if (Views.spiel.reset) Views.spiel.reset();
    render();
  }

  Views.start = { render: render, refresh: function () { render(); }, net: refreshOnline, reset: function () { confirmNew = false; pendingImport = null; msg = null; playerErr = ""; } };
})();
