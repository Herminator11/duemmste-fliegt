/* Avatare: Figur bauen (DiceBear, Stile Open Peeps und Lorelei, beide CC0) oder selbst zeichnen.
   Avatar.render(spieler, größe) liefert ein <img>. Gebaute Figuren entstehen im Browser aus dem Namen oder ihren Optionen,
   gezeichnete kommen als PNG (lokal oder vom Server). Es wird nie fremdes SVG angezeigt. */
(function () {
  "use strict";
  var h = U.h;
  /* Je Farbfeld genau fünf Töne, damit alle Reihen gleich aussehen. */
  var BG = ["b6e3f4", "ffd5dc", "ffdfbf", "d4f0c0", "e0e0e0"];
  var HAIR = ["2c1b18", "724133", "d6b370", "c93305", "9a9a9a"];
  var STYLES = [{ id: "open-peeps", label: "Open Peeps" }, { id: "lorelei", label: "Lorelei" }];
  /* type: enum = Variante durchklicken, optional = zusätzlich „Keine“, color = Farbwahl (Test A: Farbfelder, Test B: Farbwähler) */
  var FIELDS = {
    "open-peeps": [
      { key: "head", label: "Frisur", type: "enum" }, { key: "face", label: "Gesicht", type: "enum" },
      { key: "facialHair", label: "Bart", type: "optional", prob: "facialHairProbability" },
      { key: "accessories", label: "Zubehör", type: "optional", prob: "accessoriesProbability" },
      { key: "skinColor", label: "Hautton", type: "color", colors: ["ffdbb4", "edb98a", "d08b5b", "ae5d29", "694d3d"] },
      { key: "headContrastColor", label: "Haarfarbe", type: "color", colors: HAIR },
      { key: "clothingColor", label: "Kleidung", type: "color", colors: ["e78276", "ffcf77", "78e185", "8fa7df", "e279c7"] },
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
      { key: "hairColor", label: "Haarfarbe", type: "color", colors: HAIR },
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
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* Macht aus „das ergibt der Name“ feste Werte, damit jede Pfeil-Auswahl bei dem startet, was gerade zu sehen ist.
     Das Bild bleibt dabei unverändert. Ungesetzte Zusatzteile (Maske, Haarschmuck) bleiben aus, wenn sie nicht erscheinen. */
  function materialize(a) {
    var st = window.DiceBear && DiceBear.styles[a.style];
    if (!st) return a;
    var ex = {};
    try { ex = DiceBear.createAvatar(st, Object.assign({}, a.opts, { seed: a.seed || "x" })).toJson().extra || {}; } catch (e) { return a; }
    var props = st.schema.properties;
    Object.keys(props).forEach(function (k) {
      if (!(props[k].items && props[k].items.enum)) return;
      var prob = k + "Probability", optional = !!props[prob];
      if (a.opts[k]) { if (optional && a.opts[prob] === undefined) a.opts[prob] = 100; return; }
      if (optional && a.opts[prob] === 0) return;
      if (ex[k]) { a.opts[k] = [ex[k]]; if (optional) a.opts[prob] = 100; }
      else if (optional) a.opts[prob] = 0;
    });
    (FIELDS[a.style] || []).forEach(function (f) {
      if (f.type !== "color" || f.key === "backgroundColor" || a.opts[f.key] || typeof ex[f.key] !== "string") return;
      a.opts[f.key] = [ex[f.key].replace("#", "").toLowerCase()];
    });
    return a;
  }

  /* Zufällige Figur: jedes Feld bekommt einen festen Wert, Zubehör fehlt etwa jedes zweite Mal. */
  function randomFigure(style) {
    var a = { type: "gen", style: style, seed: randomSeed(), opts: {} };
    (FIELDS[style] || []).forEach(function (f) {
      if (f.type === "color") { a.opts[f.key] = [pick(f.colors)]; return; }
      var vals = schemaOf(style, f.key);
      if (!vals.length) return;
      if (f.type === "optional" && Math.random() < 0.55) { a.opts[f.prob] = 0; return; }
      a.opts[f.key] = [pick(vals)];
      if (f.prob) a.opts[f.prob] = 100;
    });
    return materialize(a);
  }

  /* Gleitschalter: Der Griff rutscht mit leichtem Nachfedern zur gewählten Seite. */
  function switcher(items, value, label, onChange) {
    var el = h("div", { cls: "swt", role: "group", "aria-label": label });
    el.style.setProperty("--n", items.length);
    el.appendChild(h("span", { cls: "swt-thumb", "aria-hidden": "true" }));
    var btns = items.map(function (it) {
      var b = h("button", { type: "button", id: it.id, "data-v": it.value, "aria-pressed": "false", text: it.label, on: { click: function () { if (b.getAttribute("aria-pressed") !== "true") { set(it.value); onChange(it.value); } } } });
      el.appendChild(b);
      return b;
    });
    function set(v) {
      items.forEach(function (it, i) {
        btns[i].setAttribute("aria-pressed", it.value === v ? "true" : "false");
        if (it.value === v) el.style.setProperty("--i", i);
      });
    }
    set(value);
    return { el: el, set: set };
  }

  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function readMode() { try { return localStorage.getItem("dfg_colormode") === "b" ? "b" : "a"; } catch (e) { return "a"; } }
  function writeMode(m) { try { localStorage.setItem("dfg_colormode", m); } catch (e) { /* Privatmodus */ } }

  /* Auswahl-Feld: ctx = { player:{id,name}, current, canReset, onSave(avatar|null), onCancel }. */
  function picker(ctx) {
    var cur = materialize(ctx.current && ctx.current.type === "gen" ? JSON.parse(JSON.stringify(ctx.current)) : defaultFor(ctx.player.name));
    if (!cur.opts) cur.opts = {};
    var tab = ctx.current && ctx.current.type === "draw" ? "draw" : "build";
    var colorMode = readMode();
    var wrap = h("div", { cls: "avpick", id: "avpick" });
    var body = h("div", { cls: "avbody" });
    var drawEl = null, prev = null, fields = null, styleSw = null;

    function setOpt(key, vals) { if (vals === null) delete cur.opts[key]; else cur.opts[key] = vals; }
    function paint(how) {
      prev.src = genUri(cur, ctx.player.name) || "";
      if (how) replay(prev, how);
    }

    /* Durchklicken: Pfeile links und rechts, am Ende geht es von vorn los. Bei Zubehör steht „Keine“ vorn. */
    function stepRow(f) {
      var vals = schemaOf(cur.style, f.key), optional = f.type === "optional";
      var slots = optional ? [null].concat(vals) : vals, n = slots.length;
      var val = h("span", { cls: "avval", "aria-live": "polite" });
      function idx() {
        if (optional && (cur.opts[f.prob] === 0 || !cur.opts[f.key])) return 0;
        var i = cur.opts[f.key] ? slots.indexOf(cur.opts[f.key][0]) : -1;
        return i < 0 ? 0 : i;
      }
      function show(dir) {
        var i = idx();
        val.textContent = slots[i] === null ? "Keine" : (optional ? i : i + 1) + " / " + (optional ? n - 1 : n);
        if (dir) replay(val, dir < 0 ? "tick-l" : "tick-r");
      }
      function go(d) {
        var i = (idx() + d + n) % n, v = slots[i];
        if (v === null) { setOpt(f.key, null); setOpt(f.prob, 0); }
        else { setOpt(f.key, [v]); if (optional) setOpt(f.prob, 100); }
        show(d); paint("pop");
      }
      var row = h("div", { cls: "avrow", role: "group", "aria-label": f.label, "data-key": f.key, on: { keydown: function (e) {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      } } }, [
        h("span", { cls: "avlab", text: f.label }),
        h("div", { cls: "avstep" }, [
          h("button", { type: "button", cls: "avarrow", "data-dir": "prev", "aria-label": f.label + ": zurück", on: { click: function () { go(-1); } } }, [Icons.icon("chevron-left")]),
          val,
          h("button", { type: "button", cls: "avarrow", "data-dir": "next", "aria-label": f.label + ": weiter", on: { click: function () { go(1); } } }, [Icons.icon("chevron-right")])
        ])
      ]);
      show(0);
      return row;
    }

    /* Farbe, Test A: fünf Farbfelder. Test B: freier Farbwähler. */
    function colorRow(f) {
      var row = h("div", { cls: "avrow avcolor", "data-key": f.key }, [h("span", { cls: "avlab", text: f.label })]);
      if (colorMode === "a") {
        var cs = h("span", { cls: "avsw" });
        var btns = f.colors.map(function (c) {
          var b = h("button", { type: "button", cls: "sw-c", "data-color": c, "aria-label": f.label + " " + c, on: { click: function () {
            var on = cur.opts[f.key] && cur.opts[f.key][0] === c;
            setOpt(f.key, on ? null : [c]); mark(); paint("pop");
          } } });
          b.style.background = "#" + c;
          cs.appendChild(b);
          return b;
        });
        var mark = function () { btns.forEach(function (b) { b.classList.toggle("on", !!cur.opts[f.key] && cur.opts[f.key][0] === b.getAttribute("data-color")); }); };
        mark();
        row.appendChild(cs);
      } else {
        var now = cur.opts[f.key] ? cur.opts[f.key][0] : f.colors[0];
        var inp = h("input", { type: "color", cls: "avpicker", "aria-label": f.label + " wählen", value: "#" + now });
        inp.addEventListener("input", function () { setOpt(f.key, [inp.value.replace("#", "").toLowerCase()]); paint(); });
        row.appendChild(h("span", { cls: "avsw" }, [inp, h("button", { type: "button", cls: "btn btn-sm", text: "Auto", "aria-label": f.label + " zurücksetzen", on: { click: function () {
          setOpt(f.key, null); inp.value = "#" + f.colors[0]; paint("pop");
        } } })]));
      }
      return row;
    }

    function buildFields() {
      fields.textContent = "";
      FIELDS[cur.style].forEach(function (f) { fields.appendChild(f.type === "color" ? colorRow(f) : stepRow(f)); });
    }

    function buildTab() {
      body.textContent = "";
      if (tab === "build") {
        prev = h("img", { cls: "avatar avprev", id: "av-preview", alt: "Vorschau", src: genUri(cur, ctx.player.name) || "" });
        var dice = h("button", { type: "button", cls: "avdice", id: "av-random", "aria-label": "Zufällige Figur", title: "Zufällige Figur", on: { click: function () {
          cur = randomFigure(cur.style); buildFields(); paint("pop"); replay(dice, "rolling");
        } } }, [Icons.icon("dice")]);
        styleSw = switcher(STYLES.map(function (s) { return { value: s.id, label: s.label, id: "av-style-" + s.id }; }), cur.style, "Stil", function (id) {
          cur = materialize({ type: "gen", style: id, seed: cur.seed, opts: {} }); buildFields(); paint("swap");
        });
        fields = h("div", { cls: "avfields", id: "av-fields" });
        var colorSw = switcher([{ value: "a", label: "A: Farbfelder", id: "av-color-a" }, { value: "b", label: "B: Farbwähler", id: "av-color-b" }], colorMode, "Farbwahl im Test", function (m) {
          colorMode = m; writeMode(m); buildFields();
        });
        body.appendChild(h("div", { cls: "avstage" }, [h("div", { cls: "avframe" }, [prev, dice]), h("div", { cls: "avstyle" }, [styleSw.el])]));
        body.appendChild(fields);
        buildFields();
        body.appendChild(h("div", { cls: "avtest" }, [h("span", { cls: "avlab", text: "Farbwahl im Test" }), colorSw.el]));
        body.appendChild(h("div", { cls: "actions", style: "margin-top:12px" }, [
          h("button", { type: "button", cls: "btn btn-main", id: "av-save", text: "Speichern", on: { click: function () { ctx.onSave(JSON.parse(JSON.stringify(cur))); } } }),
          ctx.canReset ? h("button", { type: "button", cls: "btn", id: "av-reset", text: "Zurücksetzen", on: { click: function () { ctx.onSave(null); } } }) : null,
          h("button", { type: "button", cls: "btn", id: "av-cancel", text: "Abbrechen", on: { click: function () { ctx.onCancel(); } } })
        ]));
      } else {
        if (!drawEl) {
          var initial = ctx.current && ctx.current.type === "draw" ? (ctx.current.png || (ctx.current.v && roomCode() ? src(ctx.player) : null)) : null;
          drawEl = Draw.create({ initial: initial, onSave: function (url) { ctx.onSave({ type: "draw", png: url }); } });
        }
        body.appendChild(drawEl);
        body.appendChild(h("div", { cls: "actions", style: "margin-top:8px" }, [h("button", { type: "button", cls: "btn", id: "av-cancel", text: "Abbrechen", on: { click: function () { ctx.onCancel(); } } })]));
      }
    }

    var modeSw = switcher([{ value: "build", label: "Figur bauen", id: "av-tab-build" }, { value: "draw", label: "Selbst zeichnen", id: "av-tab-draw" }], tab, "Art", function (t) { tab = t; buildTab(); });
    wrap.appendChild(h("h2", { text: "Deine Figur" }));
    wrap.appendChild(h("div", { cls: "avmode" }, [modeSw.el]));
    wrap.appendChild(body);
    buildTab();
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
