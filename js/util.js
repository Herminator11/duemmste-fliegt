/* Kleine Hilfen für alle Seiten */
(function () {
  "use strict";

  /* h("button", {cls:"btn", text:"OK", on:{click:fn}}, [kinder]) */
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "cls") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "on") Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
      else if (k === "value" || k === "disabled" || k === "hidden" || k === "checked") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  function $(id) { return document.getElementById(id); }

  /* Herzen als Icons: volle für übrige Leben, gebrochene bis zur Startzahl, Totenkopf bei 0. Mehr als 10 als Zahl. */
  function heartsEl(lives, start, id) {
    var e = document.createElement("span");
    e.className = "hearts" + (lives <= 0 ? " out" : "");
    e.setAttribute("role", "img");
    e.setAttribute("aria-label", lives <= 0 ? "ausgeschieden" : lives + " Leben");
    if (id) e.id = id;
    if (lives <= 0) { e.appendChild(Icons.icon("death-skull", "h-out")); return e; }
    var total = Math.max(lives, start);
    if (total > 10) { e.appendChild(Icons.icon("hearts", "h-full")); e.appendChild(document.createTextNode(" " + lives)); return e; }
    for (var i = 0; i < total; i++) e.appendChild(Icons.icon(i < lives ? "hearts" : "broken-heart", i < lives ? "h-full" : "h-lost"));
    return e;
  }

  /* Alte Textform, nur noch für Beschriftungen ohne Icons. */
  function hearts(lives, start) {
    if (Math.max(lives, start) > 10) return "♥ " + lives;
    var out = "";
    for (var i = 0; i < Math.max(lives, start); i++) out += i < lives ? "♥" : "♡";
    return out;
  }

  /* Spielregeln-Block (Stimmen anonym/offen, „hat gestimmt“, Auto-Auflösen). Wird auf Start- und Spiel-Seite genutzt. */
  function rulesBox(store, onChange) {
    var st = store.state.settings;
    var set = function (k, v) { store.setRule(k, v); if (onChange) onChange(); };
    var modes = ["anonymous", "public"];
    var seg = function (value, label) {
      return h("button", { type: "button", "data-mode": value, "aria-pressed": st.voteMode === value ? "true" : "false",
        on: { click: function () { slide(value); } } }, [label]);
    };
    var check = function (key, label) {
      var box = h("input", { type: "checkbox", checked: !!st[key], "data-rule": key, on: { change: function (e) { set(key, e.target.checked); } } });
      return h("label", { cls: "rule" }, [box, label]);
    };
    /* Gleitschalter: Die Box wird bei jeder Änderung neu gebaut. Darum rutscht erst der Griff der alten Box, dann erst wird gespeichert. */
    var mode = h("div", { cls: "swt", id: "vote-mode", role: "group", "aria-label": "Stimmen" }, [h("span", { cls: "swt-thumb", "aria-hidden": "true" }), seg("anonymous", "Stimmen anonym"), seg("public", "Stimmen offen")]);
    mode.style.setProperty("--n", 2);
    mode.style.setProperty("--i", modes.indexOf(st.voteMode));
    function slide(value) {
      if (value === st.voteMode) return;
      mode.style.setProperty("--i", modes.indexOf(value));
      Array.prototype.forEach.call(mode.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mode") === value ? "true" : "false"); });
      setTimeout(function () { set("voteMode", value); }, 320);
    }
    return h("div", { cls: "rules", id: "rules" }, [
      mode,
      h("p", { cls: "hint", style: "margin:6px 0 8px", text: st.voteMode === "anonymous" ? "Alle sehen nur, wie viele Stimmen jeder bekommen hat." : "Alle sehen auch, wer wen gewählt hat." }),
      check("showVoted", "Zeigen, wer schon gestimmt hat"),
      check("autoReveal", "Automatisch auflösen, sobald alle gestimmt haben")
    ]);
  }

  var RESULT_LABEL = { richtig: "richtig", falsch: "falsch", keine: "keine Antwort" };
  var RESULT_SHORT = { richtig: "Richtig", falsch: "Falsch", keine: "Keine Antwort" };

  /* Ansage für Screenreader: ein unsichtbarer, höflicher Livebereich. Bleibt der Text gleich, wird nichts doppelt gesprochen. */
  var liveEl = null, lastCue = "";
  function announce(text) {
    if (!liveEl) {
      liveEl = document.getElementById("live");
      if (!liveEl) { liveEl = h("div", { id: "live", cls: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true" }); document.body.appendChild(liveEl); }
    }
    liveEl.textContent = text;
  }
  /* Zeitmeldung nur beim Wechsel: "low" (noch 10 Sekunden) und "over" (Zeit abgelaufen) */
  function timeCue(key) {
    if (key && key !== lastCue) announce(key === "low" ? "Noch zehn Sekunden." : "Zeit abgelaufen.");
    lastCue = key;
  }

  /* Leuchten und Blinken laufen auf einer gemeinsamen Uhr (Periode in ms): Wird ein Element beim Neuzeichnen neu gebaut,
     setzt es die Animation an der Stelle fort, an der die anderen gerade sind, statt von vorn zu beginnen. */
  var PULSE_MS = 1800;
  function sync(el) { el.style.animationDelay = "-" + (Date.now() % PULSE_MS) + "ms"; return el; }

  window.U = { sync: sync, announce: announce, timeCue: timeCue, h: h, $: $, hearts: hearts, heartsEl: heartsEl, rulesBox: rulesBox, RESULT_LABEL: RESULT_LABEL, RESULT_SHORT: RESULT_SHORT };
  window.Views = {};
})();
