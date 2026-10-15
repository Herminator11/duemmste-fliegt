/* Avatare: Figur bauen (DiceBear, Stile Open Peeps und Lorelei, beide CC0) oder selbst zeichnen.
   Avatar.render(spieler, größe) liefert ein <img>. Gebaute Figuren entstehen im Browser aus dem Namen oder ihren Optionen,
   gezeichnete kommen als PNG (lokal oder vom Server). Es wird nie fremdes SVG angezeigt. */
(function () {
  "use strict";
  var h = U.h;
  var BG = ["b6e3f4", "c0aede", "d1d4f9", "ffd5dc", "ffdfbf", "d4f0c0", "f7e9a8", "e0e0e0"];
  var STYLES = [{ id: "open-peeps", label: "Open Peeps" }, { id: "lorelei", label: "Lorelei" }];
  /* type: enum = Variante wählen, optional = auch „keine“ möglich, color = Farbfelder */
  var FIELDS = {
    "open-peeps": [
      { key: "head", label: "Frisur", type: "enum" }, { key: "face", label: "Gesicht", type: "enum" },
      { key: "facialHair", label: "Bart", type: "optional", prob: "facialHairProbability" },
      { key: "accessories", label: "Zubehör", type: "optional", prob: "accessoriesProbability" },
      { key: "skinColor", label: "Hautton", type: "color", colors: ["ffdbb4", "edb98a", "d08b5b", "ae5d29", "694d3d"] },
      { key: "headContrastColor", label: "Haarfarbe", type: "color", colors: ["2c1b18", "4a312c", "724133", "b58143", "d6b370", "c93305", "f59797", "e8e1e1"] },
      { key: "clothingColor", label: "Kleidung", type: "color", colors: ["e78276", "ffcf77", "fdea6b", "78e185", "9ddadb", "8fa7df", "e279c7"] },
      { key: "backgroundColor", label: "Hintergrund", type: "color", colors: BG }
    ],
    lorelei: [
      { key: "hair", label: "Frisur", type: "enum" }, { key: "eyes", label: "Augen", type: "enum" },
      { key: "eyebrows", label: "Augenbrauen", type: "enum" }, { key: "mouth", label: "Mund", type: "enum" },
      { key: "nose", label: "Nase", type: "enum" }, { key: "head", label: "Kopfform", type: "enum" },
      { key: "glasses", label: "Brille", type: "optional", prob: "glassesProbability" },
      { key: "beard", label: "Bart", type: "optional", prob: "beardProbability" },
      { key: "earrings", label: "Ohrringe", type: "optional", prob: "earringsProbability" },
      { key: "freckles", label: "Sommersprossen", type: "optional", prob: "frecklesProbability" },
      { key: "skinColor", label: "Hautton", type: "color", colors: ["f5cfb0", "ecad80", "d08b5b", "ae5d29", "694d3d"] },
      { key: "hairColor", label: "Haarfarbe", type: "color", colors: ["2c1b18", "724133", "b58143", "d6b370", "c93305", "8f8f8f", "6b3fa0"] },
      { key: "backgroundColor", label: "Hintergrund", type: "color", colors: BG }
    ]
  };

  var cache = {};
  function defaultFor(name) { return { type: "gen", style: "open-peeps", seed: String(name || "x"), opts: {} }; }

  /* Bild-Adresse einer erzeugten Figur. Bei Fehlern greift der Standard aus dem Namen. */
  function genUri(a, name) {
    var key = a.style + "|" + a.seed + "|" + JSON.stringify(a.opts || {});
    if (cache[key]) return cache[key];
    var out = null;
    try {
      var style = window.DiceBear && DiceBear.styles[a.style];
      if (style) out = DiceBear.createAvatar(style, Object.assign({}, a.opts || {}, { seed: a.seed || "x", size: 256 })).toDataUri();
    } catch (e) { out = null; }
    if (!out && !(a.style === "open-peeps" && !Object.keys(a.opts || {}).length)) return genUri(defaultFor(name || a.seed), name);
    if (out) cache[key] = out;
    return out;
  }

  function roomCode() { return Avatar.room || (window.Net && Net.room && Net.room() ? Net.room().code : null); }

  /* a: Avatar-Objekt oder null, p: { id, name }. Liefert die Bild-Adresse. */
  function src(p) {
    var a = (Avatar.overrides && Avatar.overrides[p.id]) || p.avatar || null;
    if (a && a.type === "draw") {
      if (a.png) return a.png;
      var code = roomCode();
      if (a.v && code) return "/api/rooms/" + code + "/avatar/" + encodeURIComponent(p.id) + "?v=" + encodeURIComponent(a.v);
      a = null;
    }
    return genUri(a && a.type === "gen" ? a : defaultFor(p.name), p.name);
  }

  function render(p, size) {
    var img = h("img", { cls: "avatar", src: src(p) || "", alt: "", draggable: "false" });
    if (size) { img.style.width = img.style.height = size + "px"; }
    return img;
  }

  /* ---------- Auswahl ---------- */
  function schemaOf(styleId, key) {
    try { var p = DiceBear.styles[styleId].schema.properties[key]; return p && p.items && p.items.enum ? p.items.enum : []; } catch (e) { return []; }
  }
  function randomSeed() { return Math.random().toString(36).slice(2, 10); }

  /* Auswahl-Feld: ctx = { player:{id,name}, current, canReset, onSave(avatar|null), onCancel }. */
  function picker(ctx) {
    var cur = ctx.current && ctx.current.type === "gen" ? JSON.parse(JSON.stringify(ctx.current)) : defaultFor(ctx.player.name);
    var tab = ctx.current && ctx.current.type === "draw" ? "draw" : "build";
    var wrap = h("div", { cls: "avpick", id: "avpick" });

    function preview() { return h("img", { cls: "avatar avprev", id: "av-preview", alt: "Vorschau", src: genUri(cur, ctx.player.name) || "" }); }

    function setOpt(key, vals) { if (vals === null) delete cur.opts[key]; else cur.opts[key] = vals; }

    function fieldRow(f) {
      var row = h("div", { cls: "avrow", "data-key": f.key }, [h("span", { cls: "avlab", text: f.label })]);
      if (f.type === "color") {
        var cs = h("span", { cls: "avsw" });
        f.colors.forEach(function (c) {
          var on = cur.opts[f.key] && cur.opts[f.key][0] === c;
          var b = h("button", { type: "button", cls: "sw-c" + (on ? " on" : ""), "data-color": c, "aria-label": f.label + " " + c,
            on: { click: function () { setOpt(f.key, on ? null : [c]); redraw(); } } });
          b.style.background = "#" + c;
          cs.appendChild(b);
        });
        row.appendChild(cs);
        return row;
      }
      var vals = schemaOf(cur.style, f.key);
      var sel = h("select", { cls: "sel", "aria-label": f.label });
      sel.appendChild(h("option", { value: "", text: "Zufällig" }));
      if (f.type === "optional") sel.appendChild(h("option", { value: "-", text: "Keine" }));
      vals.forEach(function (v, i) { sel.appendChild(h("option", { value: v, text: "Variante " + (i + 1) })); });
      var now = cur.opts[f.key] ? cur.opts[f.key][0] : (f.prob && cur.opts[f.prob] === 0 ? "-" : "");
      sel.value = now;
      sel.addEventListener("change", function () {
        var v = sel.value;
        if (v === "") { setOpt(f.key, null); if (f.prob) setOpt(f.prob, null); }
        else if (v === "-") { setOpt(f.key, null); setOpt(f.prob, 0); }
        else { setOpt(f.key, [v]); if (f.prob) setOpt(f.prob, 100); }
        redraw();
      });
      row.appendChild(sel);
      return row;
    }

    function redraw() {
      wrap.textContent = "";
      var head = h("div", { cls: "seggroup", role: "group", "aria-label": "Art" }, [
        h("button", { type: "button", cls: "seg" + (tab === "build" ? " on" : ""), id: "av-tab-build", text: "Figur bauen", on: { click: function () { tab = "build"; redraw(); } } }),
        h("button", { type: "button", cls: "seg" + (tab === "draw" ? " on" : ""), id: "av-tab-draw", text: "Selbst zeichnen", on: { click: function () { tab = "draw"; redraw(); } } })
      ]);
      wrap.appendChild(h("h2", { text: "Deine Figur" }));
      wrap.appendChild(head);

      if (tab === "build") {
        wrap.appendChild(h("div", { cls: "avtop" }, [preview(), h("div", {}, [
          h("div", { cls: "seggroup", role: "group", "aria-label": "Stil" }, STYLES.map(function (s) {
            return h("button", { type: "button", cls: "seg" + (cur.style === s.id ? " on" : ""), "data-style": s.id, text: s.label,
              on: { click: function () { if (cur.style !== s.id) { cur = { type: "gen", style: s.id, seed: cur.seed, opts: {} }; redraw(); } } } });
          })),
          h("button", { type: "button", cls: "btn btn-sm", id: "av-random", style: "margin-top:8px", text: "Zufall", on: { click: function () { cur = { type: "gen", style: cur.style, seed: randomSeed(), opts: {} }; redraw(); } } })
        ])]));
        var list = h("div", { cls: "avfields", id: "av-fields" });
        FIELDS[cur.style].forEach(function (f) { list.appendChild(fieldRow(f)); });
        wrap.appendChild(list);
        wrap.appendChild(h("div", { cls: "actions", style: "margin-top:12px" }, [
          h("button", { type: "button", cls: "btn btn-main", id: "av-save", text: "Speichern", on: { click: function () { ctx.onSave(JSON.parse(JSON.stringify(cur))); } } }),
          ctx.canReset ? h("button", { type: "button", cls: "btn", id: "av-reset", text: "Zurücksetzen", on: { click: function () { ctx.onSave(null); } } }) : null,
          h("button", { type: "button", cls: "btn", id: "av-cancel", text: "Abbrechen", on: { click: function () { ctx.onCancel(); } } })
        ]));
      } else {
        var initial = ctx.current && ctx.current.type === "draw" ? (ctx.current.png || (ctx.current.v && roomCode() ? src(ctx.player) : null)) : null;
        wrap.appendChild(Draw.create({ initial: initial, onSave: function (url) { ctx.onSave({ type: "draw", png: url }); } }));
        wrap.appendChild(h("div", { cls: "actions", style: "margin-top:8px" }, [h("button", { type: "button", cls: "btn", id: "av-cancel", text: "Abbrechen", on: { click: function () { ctx.onCancel(); } } })]));
      }
    }
    redraw();
    return wrap;
  }

  /* Vollbild-Fenster um die Auswahl. Gibt eine Funktion zum Schließen zurück. */
  function open(ctx) {
    var prevFocus = document.activeElement;
    var back = h("div", { cls: "avmodal", id: "avmodal", role: "dialog", "aria-modal": "true", "aria-label": "Figur wählen" });
    var closed = false;
    var close = function () {
      if (closed) return; closed = true;
      document.removeEventListener("keydown", onKey); if (prevFocus && prevFocus.focus) prevFocus.focus();
      back.classList.add("leaving"); setTimeout(function () { back.remove(); }, 160);   /* Austritt kürzer als der Auftritt */
    };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    var inner = h("div", { cls: "avpanel" });
    inner.appendChild(picker({ player: ctx.player, current: ctx.current, canReset: ctx.canReset,
      onSave: function (a) { Promise.resolve(ctx.onSave(a)).then(function () { close(); }, function (e) { alert(e && e.message ? e.message : "Speichern fehlgeschlagen."); }); },
      onCancel: close }));
    back.appendChild(inner);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    return close;
  }

  window.Avatar = { render: render, src: src, picker: picker, open: open, defaultFor: defaultFor, overrides: null, room: null };
})();
