/* Rahmen: Top-Leiste, Seitenwechsel, Takt, Hinweis bei fehlendem Speicher */
(function () {
  "use strict";
  var $ = U.$;
  var names = ["start", "fragen", "spiel", "anzeige"];
  var current = null, currentName = null, enterTimer = null;

  function applyColor() {
    document.documentElement.style.setProperty("--c", Store.currentColor());
  }

  function route() {
    var name = (location.hash || "").replace(/^#\/?/, "").split("?")[0] || "start";
    if (name === "host-b") { location.replace("#/spiel"); return; }   // alter Link zu „Spiel B“
    if (names.indexOf(name) < 0) name = "start";
    if (current && current.reset && currentName !== name) current.reset();
    currentName = name;
    current = Views[name];
    document.body.setAttribute("data-view", name);
    Array.prototype.forEach.call(document.querySelectorAll(".links a"), function (a) {
      if (a.getAttribute("data-route") === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var root = $("view");
    current.render(root);
    /* Auftritt: nur beim Seitenwechsel, nicht bei jedem Neuzeichnen */
    document.body.classList.add("enter");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(function () { document.body.classList.remove("enter"); }, 1300);
    updateChip();
    window.scrollTo(0, 0);
  }

  function updateChip() {
    var chip = $("chip"), s = Store.curSession();
    if (s && s.status !== "ended") {
      chip.hidden = false;
      chip.textContent = "Session " + s.n + " · " + Store.fmtTime(Store.remaining(s)) + (s.status === "paused" ? " (Pause)" : "");
    } else {
      chip.hidden = true;
    }
  }

  /* Der Game Screen zeigt nur an. Nur die Master-Seite beendet Sessions, sonst würden zwei Fenster doppelt zählen. */
  function isDisplay() { return currentName === "anzeige" || /^#\/?anzeige/.test(location.hash); }
  /* Eine Anzeige mit ?room=… liest den Server und braucht die lokalen Daten nicht. */
  function isRemoteDisplay() { return /^#\/?anzeige\?.*room=/.test(location.hash); }

  function loop() {
    var ended = isDisplay() ? false : Store.tick();
    if (ended) {
      applyColor();
      if (current && current.refresh) current.refresh();
    } else if (current && current.tick) {
      current.tick();
    }
    updateChip();
    trackBar();
  }

  function showBanner(text) {
    var b = $("banner");
    if (b.firstChild) return;
    var p = document.createElement("div");
    p.className = "banner-in";
    var t = document.createElement("span");
    t.textContent = text;
    var x = document.createElement("button");
    x.className = "btn btn-sm";
    x.type = "button";
    x.textContent = "OK";
    x.addEventListener("click", function () { b.textContent = ""; b.hidden = true; });
    p.appendChild(t); p.appendChild(x);
    b.hidden = false;
    b.appendChild(p);
  }

  function showProblem() {
    showBanner("Der Browser erlaubt für diese Datei kein Speichern. Änderungen bleiben nur, bis du die Seite schließt oder neu lädst. Öffne die Seite über start.bat oder start.sh (lokaler Server) und sichere zwischendurch unter „Start“.");
  }

  /* Ruhige Bühne: stoppt alle Dauer- und Einblend-Animationen, auch auf dem Game Screen (gleicher Browser). */
  function setCalm(on, save) {
    if (on) document.body.setAttribute("data-calm", ""); else document.body.removeAttribute("data-calm");
    var b = $("calm");
    if (b) b.setAttribute("aria-pressed", on ? "true" : "false");
    if (save) { try { localStorage.setItem("dfg_calm", on ? "1" : "0"); } catch (e) {} }
  }
  (function () {
    var on = false;
    try { on = localStorage.getItem("dfg_calm") === "1"; } catch (e) {}
    setCalm(on, false);
    $("calm").addEventListener("click", function () { setCalm(!document.body.hasAttribute("data-calm"), true); });
  })();

  /* Höhe der festen Kopfleiste messen, damit Seitenleiste und Sprungziele darunter beginnen (--bar-h) */
  var barH = 0;
  function trackBar() {
    var el = document.querySelector(".hb-top"), h = el ? el.offsetHeight : 0;
    if (h === barH) return;
    barH = h;
    if (h) document.documentElement.style.setProperty("--bar-h", h + "px"); else document.documentElement.style.removeProperty("--bar-h");
  }

  Store.setProblemHandler(showProblem);
  /* Ein anderer Tab hat gespeichert: Ansicht neu aufbauen. */
  Store.setExternalHandler(function () { applyColor(); route(); });
  /* Master: jede Änderung geht als öffentliche Sicht an den Server, Server-Meldungen frischen die Seite auf. */
  Store.setChangeHandler(function () { if (!isRemoteDisplay() && Net.active()) Net.push(); });
  Net.on(function (kind) {
    if (current && current.net) current.net(kind);
    if (kind === "data" && Views.spiel.autoResolve) Views.spiel.autoResolve();
  });
  if (!Store.storageOK()) showProblem();
  else if (Store.salvagedCount()) showBanner("Ein Teil der gespeicherten Daten war beschädigt: " + Store.salvagedCount() + " Einträge (Fragen oder Sessions) wurden verworfen, der Rest ist erhalten. Eine Kopie der alten Daten liegt im Browser unter „dfg_v2_defekt“.");
  else if (Store.wasRecovered()) showBanner("Die gespeicherten Daten waren beschädigt. Das Spiel wurde mit den Ausgangsfragen neu gestartet. Eine Kopie der alten Daten liegt im Browser unter „dfg_v2_defekt“.");

  window.App = { applyColor: applyColor, updateChip: updateChip };

  document.addEventListener("keydown", function (ev) {
    if (current && current.key) current.key(ev);
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loop(); });
  window.addEventListener("hashchange", route);

  /* Beim Laden: war eine Session schon abgelaufen, wird sie hier beendet. */
  if (!isDisplay()) Store.tick();
  route();
  setInterval(loop, 250);
  if (!isRemoteDisplay()) Net.resume();
})();
