/* Zeichenfeld für die eigene Figur (Maus und Touch). Ergebnis: kleines PNG als Data-URL.
   Draw.create({ initial, onSave(dataUrl) }) liefert ein Element. */
(function () {
  "use strict";
  var h = U.h;
  var SIZE = 256;                       // interne Zeichenfläche
  var PAPER = "#f4efe6";
  var COLORS = ["#1b1b1b", "#ffffff", "#e63946", "#ff8c42", "#ffd23f", "#3ddc97", "#2a9d8f", "#3a86ff", "#8338ec", "#ff6fb5", "#8d5a2b"];
  var BRUSH = [{ n: "dünn", w: 4 }, { n: "mittel", w: 10 }, { n: "dick", w: 22 }];
  var MAX_BYTES = 28000;                // unter der Server-Grenze von 30000

  function create(opts) {
    opts = opts || {};
    var color = COLORS[0], width = BRUSH[1].w, erase = false;
    var undo = [], last = null, drawing = false;

    var canvas = h("canvas", { cls: "draw-canvas", id: "draw-canvas", width: String(SIZE), height: String(SIZE), "aria-label": "Zeichenfläche" });
    var ctx = canvas.getContext("2d");
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    function blank() { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, SIZE, SIZE); }
    blank();
    if (opts.initial) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, SIZE, SIZE); };
      img.src = opts.initial;
    }

    function snapshot() {
      try { undo.push(ctx.getImageData(0, 0, SIZE, SIZE)); if (undo.length > 15) undo.shift(); } catch (e) { /* ignorieren */ }
      btnUndo.disabled = !undo.length;
    }
    function pos(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * SIZE / r.width, y: (ev.clientY - r.top) * SIZE / r.height };
    }
    function stroke(a, b) {
      ctx.strokeStyle = erase ? PAPER : color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    canvas.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignorieren */ }
      snapshot(); drawing = true; last = pos(ev);
      stroke(last, { x: last.x + 0.01, y: last.y });     // Punkt bei einem einzelnen Tippen
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!drawing) return;
      var p = pos(ev); stroke(last, p); last = p;
    });
    var stop = function () { drawing = false; };
    canvas.addEventListener("pointerup", stop); canvas.addEventListener("pointercancel", stop);

    /* ---------- Werkzeuge ---------- */
    var swatches = COLORS.map(function (c) {
      var b = h("button", { type: "button", cls: "sw-c", "aria-label": "Farbe " + c, "data-color": c,
        on: { click: function () { color = c; erase = false; paintTools(); } } });
      b.style.background = c;
      return b;
    });
    var sizes = BRUSH.map(function (br) {
      return h("button", { type: "button", cls: "btn btn-sm", text: br.n, "data-w": String(br.w), on: { click: function () { width = br.w; paintTools(); } } });
    });
    var btnErase = h("button", { type: "button", cls: "btn btn-sm", id: "draw-erase", text: "Radierer", on: { click: function () { erase = !erase; paintTools(); } } });
    var btnUndo = h("button", { type: "button", cls: "btn btn-sm", id: "draw-undo", text: "Zurück", disabled: true, on: { click: function () {
      var s = undo.pop(); if (s) ctx.putImageData(s, 0, 0);
      btnUndo.disabled = !undo.length;
    } } });
    var btnClear = h("button", { type: "button", cls: "btn btn-sm", id: "draw-clear", text: "Alles löschen", on: { click: function () { snapshot(); blank(); } } });
    function paintTools() {
      swatches.forEach(function (b) { b.className = "sw-c" + (!erase && b.getAttribute("data-color") === color ? " on" : ""); });
      sizes.forEach(function (b) { b.className = "btn btn-sm" + (Number(b.getAttribute("data-w")) === width ? " on" : ""); });
      btnErase.className = "btn btn-sm" + (erase ? " on" : "");
    }
    paintTools();

    /* Klein genug für den Server: erst 128 px, bei Bedarf kleiner. */
    function exportPng() {
      var sizes2 = [128, 96, 64];
      for (var i = 0; i < sizes2.length; i++) {
        var c = document.createElement("canvas"); c.width = c.height = sizes2[i];
        var x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(canvas, 0, 0, sizes2[i], sizes2[i]);
        var url = c.toDataURL("image/png");
        if (Math.floor((url.length - 22) * 3 / 4) <= MAX_BYTES) return url;
      }
      return null;
    }
    var msg = h("p", { cls: "err", id: "draw-err", role: "alert", hidden: true, text: "Das Bild ist zu detailreich. Lösche etwas oder zeichne einfacher." });
    var save = h("button", { type: "button", cls: "btn btn-main", id: "draw-save", text: "Figur speichern", on: { click: function () {
      var url = exportPng();
      if (!url) { msg.hidden = false; return; }
      msg.hidden = true;
      if (opts.onSave) opts.onSave(url);
    } } });

    return h("div", { cls: "draw", id: "draw" }, [
      canvas,
      h("div", { cls: "draw-tools" }, [h("div", { cls: "sw-row" }, swatches), h("div", { cls: "actions" }, sizes.concat([btnErase, btnUndo, btnClear]))]),
      msg, h("div", { cls: "actions" }, [save])
    ]);
  }

  window.Draw = { create: create };
})();
