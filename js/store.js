/* Speicher-Schicht: Fragen, Spiel, Sessions, Timer.
   Alles, was Daten ändert oder speichert, liegt hier. Die Seiten (view-*.js) rufen nur diese Funktionen auf.
   Später lässt sich diese Datei gegen einen Server austauschen, ohne die Seiten umzubauen. */
(function () {
  "use strict";

  var KEY = "dfg_v2";
  var RESULTS = ["richtig", "falsch", "keine"];
  var AVATAR_STYLES = ["open-peeps", "lorelei"];
  var COLORS = ["#ffb347", "#5fd0a4", "#5aa9ff", "#ff7ab6", "#b794ff", "#ff8a5b", "#4fd6e0", "#c6e34f"];

  var storageOK = probe();
  var salvaged = 0, onProblem = null, onExternal = null, onChange = null, recovered = false;
  var counter = 0;
  var state = load();

  function probe() {
    try {
      var k = "dfg_probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function uid() {
    counter += 1;
    return "i" + Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function newDraft() { return { statements: {}, published: false, pid: null }; }
  function newGameObj(pos) { return { id: uid(), pos: pos || 0, sessions: [], draft: newDraft(), turn: null }; }

  function seedState() {
    var qs = (window.SEED_QUESTIONS || []).map(function (a) { return { id: uid(), text: a[0], answer: a[1] }; });
    return { version: 2, questions: qs, players: [], game: newGameObj(0), settings: { min: 2, sec: 0, startLives: 3, voteMode: "anonymous", showVoted: true, autoReveal: true } };
  }

  /* Avatar eines Spielers: erzeugt ({type:"gen", style, seed, opts}) oder gezeichnet ({type:"draw", png?, v?}).
     Prüft nur die Form und die Größe. Die Auswahlwerte prüft Avatar.sanitize in der Oberfläche. */
  var TOKEN = /^[A-Za-z0-9]{1,24}$/;
  function normAvatar(a) {
    if (!a || typeof a !== "object") return null;
    if (a.type === "gen") {
      if (AVATAR_STYLES.indexOf(a.style) < 0) return null;
      var opts = {}, n = 0, o = a.opts && typeof a.opts === "object" ? a.opts : {};
      Object.keys(o).forEach(function (k) {
        if (n >= 20 || !/^[a-zA-Z]{1,24}$/.test(k)) return;
        var v = o[k];
        if (typeof v === "number" && isFinite(v)) { opts[k] = Math.max(0, Math.min(100, Math.round(v))); n += 1; }
        else if (typeof v === "string" && TOKEN.test(v)) { opts[k] = v; n += 1; }
        else if (Array.isArray(v) && v.length && v.length <= 4 && v.every(function (x) { return typeof x === "string" && TOKEN.test(x); })) { opts[k] = v.slice(); n += 1; }
      });
      return { type: "gen", style: a.style, seed: String(a.seed == null ? "" : a.seed).slice(0, 40), opts: opts };
    }
    if (a.type === "draw") {
      var png = typeof a.png === "string" && a.png.length <= 40000 && /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/.test(a.png) ? a.png : null;
      var ver = typeof a.v === "string" && TOKEN.test(a.v) ? a.v : null;
      if (!png && !ver) return null;
      var out = { type: "draw" };
      if (png) out.png = png;
      if (ver) out.v = ver;
      return out;
    }
    return null;
  }

  /* Aussagen der Spieler zu einer Frage: { spielerId: {name, text, result} } */
  /* Geist: ausgeschiedener Spieler, den der Master im Spiel lässt. vote = darf mitwählen, questions = bekommt weiter Fragen. */
  function normGhost(g, lives) {
    if (lives > 0 || !g || typeof g !== "object") return null;
    return { vote: g.vote !== false, questions: g.questions !== false };
  }

  function normStatements(o) {
    var out = {};
    if (!o || typeof o !== "object") return out;
    Object.keys(o).forEach(function (id) {
      var e = o[id];
      if (id === "__proto__" || !e || typeof e !== "object") return;
      var text = String(e.text == null ? "" : e.text).slice(0, 500);
      var result = RESULTS.indexOf(e.result) >= 0 ? e.result : null;
      if (text || result) out[id] = { name: String(e.name || ""), text: text, result: result };
    });
    return out;
  }
  function normVote(v) {
    if (!v || typeof v !== "object") return null;
    var votes = {}, names = {};
    Object.keys(v.votes || {}).forEach(function (k) { if (k !== "__proto__" && typeof v.votes[k] === "string") votes[k] = v.votes[k]; });
    Object.keys(v.names || {}).forEach(function (k) { if (k !== "__proto__") names[k] = String(v.names[k]); });
    return {
      votes: votes, names: names, revealed: !!v.revealed, skipped: !!v.skipped,
      loserIds: Array.isArray(v.loserIds) ? v.loserIds.filter(function (x) { return typeof x === "string"; }) : [],
      round: Number.isInteger(v.round) && v.round >= 1 && v.round <= 99 ? v.round : 1,
      candidates: Array.isArray(v.candidates) ? v.candidates.filter(function (x) { return typeof x === "string"; }) : null
    };
  }

  /* Prüft und bereinigt gelesene Daten. Gibt null zurück, wenn die Grundform fehlt.
     Einzelne unbrauchbare Fragen oder Sessions werden verworfen und in `dropped` gezählt, der Rest bleibt erhalten. */
  var dropped = 0;
  function normalize(p) {
    dropped = 0;
    if (!p || typeof p !== "object" || !Array.isArray(p.questions) || !p.game || !Array.isArray(p.game.sessions)) return null;
    var qs = [], seen = {}, rawPos = typeof p.game.pos === "number" && p.game.pos >= 0 ? Math.floor(p.game.pos) : 0, droppedBeforePos = 0;
    for (var i = 0; i < p.questions.length; i++) {
      var q = p.questions[i];
      if (!q || typeof q.text !== "string" || typeof q.answer !== "string") { dropped += 1; if (i < rawPos) droppedBeforePos += 1; continue; }
      var id = typeof q.id === "string" && q.id && !seen[q.id] ? q.id : uid();
      seen[id] = true;
      qs.push({ id: id, text: q.text, answer: q.answer });
    }
    var sessions = [];
    for (var j = 0; j < p.game.sessions.length; j++) {
      var s = p.game.sessions[j];
      if (!s || typeof s.dur !== "number" || !isFinite(s.dur) || s.dur <= 0 || ["running", "paused", "ended"].indexOf(s.status) < 0 || !Array.isArray(s.played)) { dropped += 1; continue; }
      if (s.status === "running" && typeof s.endsAt !== "number") { s.status = "paused"; s.left = s.dur; }
      sessions.push({
        n: sessions.length + 1,
        color: COLORS[sessions.length % COLORS.length],
        dur: s.dur,
        status: s.status,
        endsAt: typeof s.endsAt === "number" ? s.endsAt : null,
        left: typeof s.left === "number" ? s.left : null,
        played: s.played.filter(function (x) { return x && typeof x.text === "string"; })
          .map(function (x) {
            return { qid: String(x.qid || ""), text: x.text, answer: String(x.answer || ""),
              statements: normStatements(x.statements), published: !!x.published, pid: typeof x.pid === "string" ? x.pid : null };
          }),
        vote: normVote(s.vote),
        startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
        endedAt: typeof s.endedAt === "number" ? s.endedAt : null
      });
    }
    var pos = Math.max(0, rawPos - droppedBeforePos);
    var st = p.settings || {};
    var startLives = Number.isInteger(st.startLives) && st.startLives >= 1 && st.startLives <= 99 ? st.startLives : 3;
    var players = [], pseen = {};
    (Array.isArray(p.players) ? p.players : []).forEach(function (x) {
      if (!x || typeof x.name !== "string" || !clean(x.name)) return;
      var id = typeof x.id === "string" && x.id && !pseen[x.id] ? x.id : uid();
      pseen[id] = true;
      var lv = Number.isInteger(x.lives) ? Math.max(0, Math.min(99, x.lives)) : startLives;
      players.push({ id: id, name: clean(x.name), lives: lv, avatar: normAvatar(x.avatar), ghost: normGhost(x.ghost, lv) });
    });
    var d = p.game.draft || {};
    return {
      version: 2,
      questions: qs,
      players: players,
      game: { id: typeof p.game.id === "string" ? p.game.id : uid(), pos: Math.min(pos, qs.length), sessions: sessions,
        draft: { statements: normStatements(d.statements), published: !!d.published, pid: typeof d.pid === "string" ? d.pid : null }, turn: typeof p.game.turn === "string" ? p.game.turn : null },
      settings: { min: Number.isInteger(st.min) ? st.min : 2, sec: Number.isInteger(st.sec) ? st.sec : 0,
        startLives: startLives,
        voteMode: st.voteMode === "public" ? "public" : "anonymous", showVoted: st.showVoted !== false, autoReveal: st.autoReveal !== false }
    };
  }

  function load() {
    var s = null;
    if (storageOK) {
      try {
        var raw = window.localStorage.getItem(KEY);
        if (raw) {
          try { s = normalize(JSON.parse(raw)); } catch (e) { s = null; }
          if (!s) { backupBroken(raw); }
        }
      } catch (e) { s = null; }
    }
    salvaged = dropped;
    if (s && dropped) backupBroken(window.localStorage.getItem(KEY));
    var fresh = !s;
    if (!s) s = seedState();
    state = s;
    recovered = fresh && storageOK && hadRaw();
    if (fresh) save();
    return s;
  }

  /* Zwei Sicherungen des defekten Stands: die vorige bleibt erhalten, wenn es erneut passiert. */
  function backupBroken(raw) {
    try {
      var prev = window.localStorage.getItem(KEY + "_defekt");
      if (prev && prev !== raw) window.localStorage.setItem(KEY + "_defekt_alt", prev);
      window.localStorage.setItem(KEY + "_defekt", raw);
    } catch (e) { /* ignorieren */ }
  }

  function hadRaw() {
    try { return !!window.localStorage.getItem(KEY); } catch (e) { return false; }
  }

  function save() {
    if (onChange) { try { onChange(); } catch (e) { /* Netzwerk-Hook darf das Speichern nicht stören */ } }
    if (!storageOK) { if (onProblem) onProblem(); return false; }
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      storageOK = false;
      if (onProblem) onProblem();
      return false;
    }
  }

  /* Änderungen aus einem anderen Tab übernehmen, damit sich die Tabs nicht gegenseitig überschreiben. */
  window.addEventListener("storage", function (ev) {
    if (ev.key !== KEY || !ev.newValue) return;
    var s = null;
    try { s = normalize(JSON.parse(ev.newValue)); } catch (e) { s = null; }
    if (!s) return;
    state = s;
    if (onExternal) onExternal();
  });

  /* ---------- Hilfen ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);
  }
  function fmtDur(sec) { return Math.floor(sec / 60) + ":" + pad(sec % 60); }

  /* ---------- Spiel ---------- */
  function curSession() {
    var a = state.game.sessions;
    return a.length ? a[a.length - 1] : null;
  }
  function isActive() {
    var s = curSession();
    return !!s && s.status !== "ended";
  }
  function nextColor() { return COLORS[state.game.sessions.length % COLORS.length]; }
  function currentColor() { var s = curSession(); return s ? s.color : nextColor(); }
  function remaining(s) {
    if (!s) return 0;
    if (s.status === "running") return Math.max(0, (s.endsAt - Date.now()) / 1000);
    if (s.status === "paused") return Math.max(0, s.left || 0);
    return 0;
  }
  function curQuestion() { return state.questions[state.game.pos] || null; }
  /* Die Frage wandert samt Spieleraussagen in die Session. */
  function pushPlayed(s, q) {
    var d = state.game.draft, who = d.pid || currentTurnId();
    /* pid: wem diese Frage gestellt wurde (auch ohne Antwort), damit jeder Spieler seine Fragen zählen kann */
    s.played.push({ qid: q.id, text: q.text, answer: q.answer, statements: d.statements, published: d.published, pid: who });
    state.game.draft = newDraft();
    state.game.turn = nextTurnId(who);
  }
  function playedCount() {
    return state.game.sessions.reduce(function (n, s) { return n + s.played.length; }, 0);
  }

  function startSession(min, sec) {
    var m = (min === "" || min == null) ? 0 : Number(min);
    var s = (sec === "" || sec == null) ? 0 : Number(sec);
    if (!Number.isInteger(m) || !Number.isInteger(s) || m < 0 || s < 0 || s > 59 || m > 99) {
      return { ok: false, error: "Bitte Minuten (0–99) und Sekunden (0–59) als ganze Zahlen angeben." };
    }
    var dur = m * 60 + s;
    if (dur <= 0) return { ok: false, error: "Die Dauer muss größer als 0 sein." };
    if (!state.questions.length) return { ok: false, error: "Es gibt keine Fragen. Lege zuerst unter „Fragen“ welche an." };
    if (!isActive() && state.game.pos >= state.questions.length) {
      return { ok: false, error: "Alle Fragen sind gespielt. Lege neue Fragen an, starte ein neues Spiel oder wähle unter „Fragen“ eine andere Stelle." };
    }
    if (voteOpen()) return { ok: false, error: "Die Abstimmung der letzten Session ist noch offen. Löse sie auf oder überspringe sie." };
    if (isActive()) endSession();
    var n = state.game.sessions.length + 1;
    state.game.sessions.push({
      n: n, color: COLORS[(n - 1) % COLORS.length], dur: dur, status: "running",
      endsAt: Date.now() + dur * 1000, left: null, played: [], startedAt: Date.now(), endedAt: null
    });
    state.settings.min = m; state.settings.sec = s;
    save();
    return { ok: true };
  }

  function pauseResume() {
    var s = curSession();
    if (!s) return;
    if (s.status === "running") {
      s.left = remaining(s); s.endsAt = null; s.status = "paused";
    } else if (s.status === "paused") {
      s.endsAt = Date.now() + (s.left || 0) * 1000; s.left = null; s.status = "running";
    }
    save();
  }

  /* Die gerade gezeigte Frage zählt zur Session. */
  function endSession() {
    var s = curSession();
    if (!s || s.status === "ended") return;
    var q = curQuestion();
    if (q) { pushPlayed(s, q); state.game.pos += 1; }
    s.status = "ended"; s.endsAt = null; s.left = 0; s.endedAt = Date.now();
    save();
  }

  function canNext() { return isActive() && state.game.pos + 1 < state.questions.length; }
  function nextQuestion() {
    if (!canNext()) return false;
    var s = curSession();
    pushPlayed(s, curQuestion());
    state.game.pos += 1;
    save();
    return true;
  }

  /* Wird regelmäßig aufgerufen. Gibt true zurück, wenn der Timer abgelaufen ist und die Session beendet wurde. */
  function tick() {
    var s = curSession();
    if (s && s.status === "running" && s.endsAt <= Date.now()) { endSession(); return true; }
    return false;
  }

  /* Neues Spiel: altes Spiel wird gelöscht, die Fragen laufen weiter. */
  function newGamePos() {
    return state.game.pos + (isActive() && curQuestion() ? 1 : 0);
  }
  function newGame() {
    state.game = newGameObj(newGamePos());
    state.players.forEach(function (pl) { pl.lives = state.settings.startLives; pl.ghost = null; });
    save();
  }

  function setPos(index) {
    if (isActive()) return false;
    if (!Number.isInteger(index) || index < 0 || index >= state.questions.length) return false;
    state.game.pos = index;
    state.game.draft = newDraft();
    save();
    return true;
  }

  /* ---------- Fragen ---------- */
  function clean(v) { return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }

  function addQuestion(text, answer) {
    text = clean(text); answer = clean(answer);
    if (!text || !answer) return null;
    var q = { id: uid(), text: text, answer: answer };
    state.questions.push(q);
    save();
    return q;
  }
  function findIndex(id) {
    for (var i = 0; i < state.questions.length; i++) if (state.questions[i].id === id) return i;
    return -1;
  }
  function updateQuestion(id, text, answer) {
    text = clean(text); answer = clean(answer);
    var i = findIndex(id);
    if (i < 0 || !text || !answer) return false;
    state.questions[i].text = text; state.questions[i].answer = answer;
    save();
    return true;
  }
  function deleteQuestion(id) {
    var i = findIndex(id);
    if (i < 0) return false;
    state.questions.splice(i, 1);
    if (i < state.game.pos) state.game.pos -= 1;
    else if (i === state.game.pos) state.game.draft = newDraft();
    save();
    return true;
  }

  /* Text im Format „Frage“ + „A: Antwort“ (je Frage ein Absatz) einlesen. */
  function parseBulk(raw) {
    var blocks = String(raw || "").split(/\n\s*\n/).map(function (b) { return b.trim(); }).filter(Boolean);
    var results = [], errors = [];
    blocks.forEach(function (block) {
      var lines = block.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      var text = null, answer = null;
      if (lines.length >= 2 && /^A:/i.test(lines[lines.length - 1])) {
        answer = lines[lines.length - 1].replace(/^A:\s*/i, "");
        text = lines.slice(0, -1).join(" ");
      } else {
        var m = block.match(/^([\s\S]*?)\s+A:\s*([\s\S]+)$/);
        if (m) { text = m[1]; answer = m[2]; }
      }
      text = clean(text); answer = clean(answer);
      if (text && answer) results.push({ text: text, answer: answer });
      else errors.push(block.slice(0, 60));
    });
    return { results: results, errors: errors };
  }
  function addMany(items) {
    items.forEach(function (it) { state.questions.push({ id: uid(), text: it.text, answer: it.answer }); });
    save();
    return items.length;
  }

  /* ---------- Spieler und Leben ---------- */
  function findPlayer(id) {
    for (var i = 0; i < state.players.length; i++) if (state.players[i].id === id) return state.players[i];
    return null;
  }
  function alivePlayers() { return state.players.filter(function (p) { return p.lives > 0; }); }
  /* Rollen: Lebende können alles. Ein Geist (0 Leben, vom Master zugelassen) darf je nach Einstellung mitwählen und Fragen bekommen,
     steht aber nie zur Wahl. Ausgeschiedene ohne Geist-Modus sind überall draußen. */
  function askablePlayers() { return state.players.filter(function (p) { return p.lives > 0 || (p.ghost && p.ghost.questions); }); }
  function voterPlayers() { return state.players.filter(function (p) { return p.lives > 0 || (p.ghost && p.ghost.vote); }); }
  /* Zur Wahl stehen die Lebenden, in der Stichwahl nur die Gleichstehenden. */
  function candidatePlayers() {
    var v = curVote(), alive = alivePlayers();
    if (v && v.candidates) {
      var c = alive.filter(function (p) { return v.candidates.indexOf(p.id) >= 0; });
      if (c.length) return c;
    }
    return alive;
  }
  function isGhost(p) { return !!p && p.lives <= 0 && !!p.ghost; }
  /* Finale: nur noch zwei Spieler am Leben. Wird bisher nur angezeigt, die Regeln dafür fehlen noch. */
  function endgame() { return alivePlayers().length === 2; }

  /* ---------- Wer ist dran? Reihum in der Reihenfolge der Spielerliste, nur wer Fragen bekommen darf. ---------- */
  function nextTurnId(fromId) {
    var a = askablePlayers(), n = state.players.length, idx = -1;
    if (!a.length) return null;
    for (var i = 0; i < n; i++) if (state.players[i].id === fromId) idx = i;
    for (var k = 1; k <= n; k++) {
      var p = state.players[(idx + k + n) % n];
      if (a.indexOf(p) >= 0) return p.id;
    }
    return null;
  }
  function currentTurnId() {
    var cur = findPlayer(state.game.turn);
    if (cur && askablePlayers().indexOf(cur) >= 0) return cur.id;
    return nextTurnId(state.game.turn);
  }
  function turnPlayer() { return findPlayer(currentTurnId()); }
  function setTurn(id) {
    var p = findPlayer(id);
    if (!p || askablePlayers().indexOf(p) < 0) return false;
    state.game.turn = p.id;
    save();
    return true;
  }
  function nameOf(id, snapshot) { var p = findPlayer(id); return p ? p.name : (snapshot || "Unbekannt"); }

  function addPlayer(name) {
    name = clean(name).slice(0, 40);
    if (!name) return null;
    var low = name.toLowerCase();
    if (state.players.some(function (p) { return p.name.toLowerCase() === low; })) return null;
    var p = { id: uid(), name: name, lives: state.settings.startLives, avatar: null, ghost: null };
    state.players.push(p);
    save();
    return p;
  }
  function renamePlayer(id, name) {
    var p = findPlayer(id); name = clean(name).slice(0, 40);
    if (!p || !name) return false;
    var low = name.toLowerCase();
    if (state.players.some(function (x) { return x !== p && x.name.toLowerCase() === low; })) return false;
    p.name = name;
    save();
    return true;
  }
  function removePlayer(id) {
    var i = state.players.indexOf(findPlayer(id));
    if (i < 0) return false;
    state.players.splice(i, 1);
    delete state.game.draft.statements[id];
    var cv = curVote();
    if (cv) { delete cv.votes[id]; Object.keys(cv.votes).forEach(function (k) { if (cv.votes[k] === id) delete cv.votes[k]; }); }
    save();
    return true;
  }
  /* Ohne bisherige Session gilt die neue Zahl sofort für alle, sonst ab dem nächsten Spiel. */
  function setStartLives(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 1 || n > 99) return false;
    state.settings.startLives = n;
    if (!state.game.sessions.length) state.players.forEach(function (p) { p.lives = n; p.ghost = null; });
    save();
    return true;
  }
  /* Avatar setzen (null entfernt ihn, dann gilt der Standard aus dem Namen). */
  function setAvatar(id, avatar) {
    var p = findPlayer(id);
    if (!p) return false;
    var a = avatar == null ? null : normAvatar(avatar);
    if (avatar != null && !a) return false;
    p.avatar = a;
    save();
    return true;
  }

  /* Spielregeln: Stimmen anonym oder offen, „hat gestimmt“ sichtbar, automatisch auflösen. */
  function setRule(key, value) {
    var st = state.settings;
    if (key === "voteMode") { if (value !== "anonymous" && value !== "public") return false; st.voteMode = value; }
    else if (key === "showVoted" || key === "autoReveal") st[key] = !!value;
    else return false;
    save();
    return true;
  }
  function adjustLives(id, delta) {
    var p = findPlayer(id);
    if (!p || !Number.isInteger(delta)) return false;
    p.lives = Math.max(0, Math.min(99, p.lives + delta));
    if (p.lives > 0) p.ghost = null;
    save();
    return true;
  }
  /* Geist-Modus für einen Ausgeschiedenen: cfg = { vote, questions } oder null (wieder ganz draußen). */
  function setGhost(id, cfg) {
    var p = findPlayer(id);
    if (!p || p.lives > 0) return false;
    if (!cfg) p.ghost = null;
    else p.ghost = { vote: cfg.vote !== false, questions: cfg.questions !== false };
    save();
    return true;
  }
  /* Gewinner: genau ein Spieler übrig, nachdem andere ausgeschieden sind. */
  function winner() {
    var alive = alivePlayers();
    if (state.players.length < 2 || alive.length !== 1 || alive.length === state.players.length) return null;
    return alive[0];
  }

  /* ---------- Aussagen der Spieler ---------- */
  /* Ziel der Eingabe: die laufende Frage, nach Session-Ende die zuletzt gespielte Frage. */
  function statementTarget() {
    var s = curSession(), q = curQuestion();
    if (isActive() && q) return { entry: state.game.draft, text: q.text, answer: q.answer, live: true };
    if (s && s.status === "ended" && s.played.length) {
      var e = s.played[s.played.length - 1];
      return { entry: e, text: e.text, answer: e.answer, live: false };
    }
    return null;
  }
  function applyStatement(entry, p, patch) {
    var cur = entry.statements[p.id] || { name: p.name, text: "", result: null };
    if ("text" in patch) cur.text = String(patch.text == null ? "" : patch.text).slice(0, 500);
    if ("result" in patch) cur.result = RESULTS.indexOf(patch.result) >= 0 ? patch.result : null;
    cur.name = p.name;
    if (cur.text || cur.result) entry.statements[p.id] = cur; else delete entry.statements[p.id];
  }
  function setStatement(pid, patch) {
    var t = statementTarget(), p = findPlayer(pid);
    if (!t || !p) return false;
    applyStatement(t.entry, p, patch);
    save();
    return true;
  }
  /* Eintrag einer beliebigen Frage: ref = { n: Session, idx: Platz in played } oder { live: true } für die laufende Frage. */
  function entryAt(ref) {
    if (!ref) return null;
    if (ref.live) return isActive() && curQuestion() ? state.game.draft : null;
    var s = state.game.sessions.filter(function (x) { return x.n === ref.n; })[0];
    return s && s.played[ref.idx] ? s.played[ref.idx] : null;
  }
  /* Master: Antwort oder Ergebnis zu einer früheren (oder der laufenden) Frage nachträglich ändern, zum Beispiel nach einem Tippfehler. */
  function editStatement(ref, pid, patch) {
    var e = entryAt(ref), p = findPlayer(pid);
    if (!e || !p || !patch) return false;
    applyStatement(e, p, patch);
    save();
    return true;
  }
  /* Absenden: Antwort und Ergebnis des Spielers zur laufenden Frage festhalten, veröffentlichen und zur nächsten Frage und
     zum nächsten Spieler gehen. Ohne Text und Ergebnis zählt es als „keine Antwort“. Mit Text braucht es ein Ergebnis. */
  function commitAnswer(pid, patch) {
    var t = statementTarget(), p = findPlayer(pid);
    if (!t || !t.live || !p) return { ok: false, error: "Es läuft keine Frage." };
    if (patch) setStatement(pid, patch);
    var cur = t.entry.statements[pid];
    if (!cur || !cur.result) {
      if (cur && cur.text) return { ok: false, needResult: true, error: "Bitte „Richtig“ oder „Falsch“ wählen." };
      setStatement(pid, { result: "keine" });
    }
    state.game.draft.pid = pid;
    state.game.draft.published = true;
    var advanced = canNext() && nextQuestion();
    if (!advanced) save();
    return { ok: true, advanced: advanced };
  }
  /* Fragen dieser Session, die ein Spieler bekommen hat: je Frage ein Eintrag mit Ergebnis (null = offen), die laufende zuletzt. */
  function askedList(pid) {
    var s = curSession(), out = [];
    if (!s) return out;
    s.played.forEach(function (e, idx) {
      var st = e.statements[pid];
      if (e.pid === pid || st) out.push({ result: st ? st.result : null, live: false, ref: { n: s.n, idx: idx }, question: e.text, correct: e.answer, text: st ? st.text : "" });
    });
    var q = curQuestion();
    if (isActive() && q) {
      var d = state.game.draft, st2 = d.statements[pid];
      if (currentTurnId() === pid || st2) out.push({ result: st2 ? st2.result : null, live: true, ref: { live: true }, question: q.text, correct: q.answer, text: st2 ? st2.text : "" });
    }
    return out;
  }
  function setPublished(flag) {
    var t = statementTarget();
    if (!t) return false;
    t.entry.published = !!flag;
    save();
    return true;
  }
  function statementList(entry) {
    var out = [], used = {};
    state.players.forEach(function (p) {
      var e = entry.statements[p.id];
      if (e) { used[p.id] = true; out.push({ id: p.id, name: p.name, text: e.text, result: e.result }); }
    });
    Object.keys(entry.statements).forEach(function (id) {
      if (!used[id]) { var e = entry.statements[id]; out.push({ id: id, name: e.name || "Unbekannt", text: e.text, result: e.result }); }
    });
    return out;
  }
  /* Alle Aussagen eines Spielers über das ganze Spiel (neueste zuerst). */
  function playerHistory(pid) {
    var out = [];
    state.game.sessions.forEach(function (s) {
      s.played.forEach(function (e) {
        var st = e.statements[pid];
        if (st) out.push({ n: s.n, color: s.color, text: e.text, answer: e.answer, said: st.text, result: st.result, ref: { n: s.n, idx: s.played.indexOf(e) } });
      });
    });
    var d = state.game.draft.statements[pid], q = curQuestion();
    if (d && isActive() && q) out.push({ n: curSession().n, color: curSession().color, text: q.text, answer: q.answer, said: d.text, result: d.result, live: true, ref: { live: true } });
    return out.reverse();
  }

  /* ---------- Abstimmung: wer hat die dümmste Antwort gegeben? ---------- */
  function voteOpen() {
    var s = curSession();
    if (!s || s.status !== "ended" || !s.played.length || alivePlayers().length < 2) return false;
    return !(s.vote && (s.vote.revealed || s.vote.skipped));
  }
  function voteKey() { var s = curSession(), v = curVote(); return s ? state.game.id + ":" + s.n + ":" + (v ? v.round : 1) : null; }
  function curVote() { var s = curSession(); return s && s.vote ? s.vote : null; }
  function newVote() { return { votes: {}, names: {}, revealed: false, skipped: false, loserIds: [], round: 1, candidates: null }; }
  /* Selbstwahl ist erlaubt. Wählen dürfen Lebende und Geister mit Wahlrecht, gewählt werden nur Kandidaten. */
  function setVote(voterId, targetId) {
    if (!voteOpen()) return false;
    var voter = findPlayer(voterId), target = findPlayer(targetId);
    if (!voter || voterPlayers().indexOf(voter) < 0) return false;
    var s = curSession();
    if (!s.vote) s.vote = newVote();
    if (!targetId) { delete s.vote.votes[voterId]; save(); return true; }
    if (!target || candidatePlayers().indexOf(target) < 0) return false;
    s.vote.votes[voterId] = targetId;
    save();
    return true;
  }
  function missingVoters() {
    var v = curVote();
    return voterPlayers().filter(function (p) { return !v || !v.votes[p.id]; });
  }
  /* opts.force: auch mit fehlenden Stimmen auflösen. opts.decide: Master bestimmt den Verlierer selbst, erst wenn zwei Stichwahlen
     hintereinander gleich ausgingen (Runde 3). Es verliert genau einer. Bei Gleichstand beginnt sofort eine Stichwahl
     nur unter den Gleichstehenden (runoff: true). */
  function resolveVote(opts) {
    opts = opts || {};
    if (!voteOpen()) return { ok: false, error: "Es gibt keine offene Abstimmung." };
    var v = curVote(), s = curSession();
    var missing = missingVoters();
    if (v && v.round >= 3 && typeof opts.decide === "string" && candidatePlayers().some(function (p) { return p.id === opts.decide; })) {
      return finishVote(v, opts.decide);
    }
    if (missing.length && !opts.force) {
      return { ok: false, missing: missing.map(function (p) { return p.name; }), error: "Es fehlen Stimmen von: " + missing.map(function (p) { return p.name; }).join(", ") + "." };
    }
    var cand = candidatePlayers().map(function (p) { return p.id; });
    var tally = {}, best = 0;
    voterPlayers().forEach(function (p) {
      var t = v && v.votes[p.id];
      if (t && cand.indexOf(t) >= 0) { tally[t] = (tally[t] || 0) + 1; if (tally[t] > best) best = tally[t]; }
    });
    if (!best) return { ok: false, error: "Es wurde noch keine Stimme abgegeben." };
    var leaders = Object.keys(tally).filter(function (id) { return tally[id] === best; });
    if (leaders.length > 1) {
      v.candidates = leaders; v.votes = {}; v.round += 1;
      save();
      return { ok: true, runoff: true, round: v.round, tie: leaders.map(function (id) { return { id: id, name: nameOf(id) }; }) };
    }
    return finishVote(v, leaders[0]);
  }
  function finishVote(v, loser) {
    state.players.forEach(function (p) { v.names[p.id] = p.name; });
    var lp = findPlayer(loser);
    if (lp) lp.lives = Math.max(0, lp.lives - 1);
    v.loserIds = [loser]; v.revealed = true; v.skipped = false;
    save();
    return { ok: true, losers: [nameOf(loser)] };
  }
  /* Fehlklick zurücknehmen: Leben zurückgeben, Abstimmung wieder öffnen. */
  function reopenVote() {
    var s = curSession(), v = s && s.vote;
    if (!v || !v.revealed) return false;
    v.loserIds.forEach(function (id) { var p = findPlayer(id); if (p) { p.lives = Math.min(99, p.lives + 1); p.ghost = null; } });
    v.loserIds = []; v.revealed = false;
    save();
    return true;
  }
  /* Stimmen vom Server übernehmen: { spielerId: zielId } */
  function applyVotes(map) {
    var n = 0;
    Object.keys(map || {}).forEach(function (voter) { if (setVote(voter, map[voter])) n += 1; });
    return n;
  }
  function skipVote() {
    var s = curSession();
    if (!voteOpen()) return false;
    if (!s.vote) s.vote = newVote();
    s.vote.skipped = true;
    save();
    return true;
  }
  function voteRows(v) {
    return Object.keys(v.votes).map(function (voter) {
      return { voter: nameOf(voter, v.names[voter]), target: nameOf(v.votes[voter], v.names[v.votes[voter]]) };
    });
  }

  /* ---------- Öffentliche Sicht für den Game Screen ----------
     Enthält die richtige Antwort erst nach dem Veröffentlichen, keine Entwürfe und keine Stimmen vor der Auflösung. */
  function publicView(opts) {
    var forServer = !!(opts && opts.forServer);
    var s = curSession(), t = statementTarget(), active = isActive();
    var v = s && s.status === "ended" && s.vote && s.vote.revealed ? s.vote : null;
    var w = winner();
    var mode = state.settings.voteMode;
    /* Ergebnispunkte: je veröffentlichter Frage der Runde einer. Erst nach Rundenende (ab der Abstimmung),
       damit die Spieler während der Runde nicht abgelenkt werden. */
    var dotEntries = [];
    if (s && s.status === "ended") dotEntries = s.played.filter(function (e) { return e.published; });
    var counts = {};
    if (v) Object.keys(v.votes).forEach(function (k) { counts[v.votes[k]] = (counts[v.votes[k]] || 0) + 1; });
    var cv = curVote(), voterIds = voterPlayers().map(function (p) { return p.id; });
    var open = voteOpen(), tp = active ? turnPlayer() : null;
    /* veröffentlichte Fragen dieser Session, neueste zuerst: Grundlage für „Antworten je Spieler“ */
    var pub = [];
    if (t && t.entry.published) pub.push({ text: t.text, correct: t.answer, entry: t.entry });
    if (s) s.played.slice().reverse().forEach(function (e) { if (e !== (t && t.entry) && e.published) pub.push({ text: e.text, correct: e.answer, entry: e }); });
    return {
      players: state.players.map(function (p) {
        /* Fragentexte erst nach Rundenende: „Buchstabiere …“ darf während der Runde nirgends zu lesen sein */
        var ended = !!s && s.status === "ended";
        var answers = [];
        if (ended) pub.forEach(function (x) {
          var st = x.entry.statements[p.id];
          if (st) answers.push({ question: x.text, correct: x.correct, text: st.text, result: st.result });
        });
        /* Reihum-Spiel: jeder Spieler bekommt seine eigene Frage. Ein Kreis gehört nur zu Fragen, bei denen der Spieler dran war
           (Aussage oder Ergebnis eingetragen). Fragen der anderen erzeugen bei ihm keinen Kreis. „keine“ heißt: nicht beantwortet. */
        var mine = dotEntries.filter(function (e) { return e.pid === p.id || !!e.statements[p.id]; });
        var dots = mine.map(function (e) { var st = e.statements[p.id]; return st && st.result ? st.result : null; });
        /* je Kreis die Frage dazu, nur nach Rundenende */
        var dotInfo = mine.map(function (e) {
          if (!ended) return null;
          var st = e.statements[p.id] || {};
          return { question: e.text, correct: e.answer, text: st.text || "", result: st.result || null };
        });
        /* Gezeichnete Bilder gehen nie in den Strom, nur ein Verweis. Die Bilddatei liegt auf dem Server. */
        var av = p.avatar ? (p.avatar.type === "draw" && forServer ? (p.avatar.v ? { type: "draw", v: p.avatar.v } : null) : p.avatar) : null;
        return { id: p.id, name: p.name, lives: p.lives, out: p.lives <= 0, ghost: isGhost(p), answers: answers, dots: dots, dotInfo: dotInfo, avatar: av };
      }),
      startLives: state.settings.startLives,
      session: s ? { n: s.n, color: s.color, status: s.status, dur: s.dur } : null,
      remaining: remaining(s),
      lastQuestion: !active && t ? t.text : null,
      /* Antworten und richtige Lösung erst nach Rundenende, auch wenn schon veröffentlicht */
      statements: t && t.entry.published && !active ? statementList(t.entry) : null,
      correct: t && t.entry.published && !active ? t.answer : null,
      round: s ? s.n : null,
      voteMode: mode,
      showVoted: !!state.settings.showVoted,
      turn: tp ? tp.id : null,
      endgame: endgame(),
      voted: open && state.settings.showVoted && cv ? Object.keys(cv.votes).filter(function (id) { return voterIds.indexOf(id) >= 0; }) : [],
      voterIds: open ? voterIds : [],
      candidates: open ? candidatePlayers().map(function (p) { return p.id; }) : [],
      voteRound: open && cv ? cv.round : 1,
      vote: v ? { mode: mode, counts: counts, loserIds: v.loserIds.slice(),
        losers: v.loserIds.map(function (id) { return nameOf(id, v.names[id]); }),
        rows: mode === "public" ? voteRows(v) : null } : null,
      voting: voteOpen(),
      gameId: state.game.id,
      voteKey: open ? voteKey() : null,
      winner: w ? w.name : null,
      allOut: state.players.length > 0 && !alivePlayers().length
    };
  }

  /* ---------- Sicherung ---------- */
  function exportData() {
    return { app: "duemmste-fliegt", version: 2, exportedAt: new Date().toISOString(),
      questions: state.questions, players: state.players, game: state.game, settings: state.settings };
  }
  function importData(obj) {
    var s = normalize(obj);
    if (!s) return { ok: false, error: "Die Datei ist keine gültige Sicherung dieser Anwendung." };
    /* Eine mitgesicherte laufende Session wird pausiert, mit der Restzeit vom Zeitpunkt der Sicherung. */
    var ref = Date.parse(obj.exportedAt);
    s.game.sessions.forEach(function (x) {
      if (x.status !== "running") return;
      x.left = Math.max(0, isNaN(ref) ? x.dur : (x.endsAt - ref) / 1000);
      x.endsAt = null; x.status = "paused";
    });
    state = s;
    save();
    return { ok: true, questions: s.questions.length, sessions: s.game.sessions.length, dropped: dropped };
  }

  window.Store = {
    COLORS: COLORS,
    get state() { return state; },
    storageOK: function () { return storageOK; },
    setProblemHandler: function (fn) { onProblem = fn; },
    fmtTime: fmtTime, fmtDur: fmtDur,
    curSession: curSession, isActive: isActive, nextColor: nextColor, currentColor: currentColor,
    remaining: remaining, curQuestion: curQuestion, playedCount: playedCount,
    startSession: startSession, pauseResume: pauseResume, endSession: endSession,
    newGamePos: newGamePos,
    alivePlayers: alivePlayers, askablePlayers: askablePlayers, voterPlayers: voterPlayers, candidatePlayers: candidatePlayers,
    isGhost: isGhost, setGhost: setGhost, endgame: endgame, turnPlayer: turnPlayer, setTurn: setTurn, findPlayer: findPlayer, addPlayer: addPlayer, renamePlayer: renamePlayer,
    removePlayer: removePlayer, setStartLives: setStartLives, adjustLives: adjustLives, winner: winner,
    statementTarget: statementTarget, setStatement: setStatement, editStatement: editStatement, commitAnswer: commitAnswer, askedList: askedList, setPublished: setPublished,
    statementList: statementList, playerHistory: playerHistory,
    setRule: setRule, setAvatar: setAvatar, normAvatar: normAvatar, AVATAR_STYLES: AVATAR_STYLES, applyVotes: applyVotes, setChangeHandler: function (fn) { onChange = fn; },
    voteOpen: voteOpen, voteKey: voteKey, curVote: curVote, setVote: setVote, missingVoters: missingVoters, resolveVote: resolveVote,
    reopenVote: reopenVote, skipVote: skipVote, voteRows: voteRows, publicView: publicView, setExternalHandler: function (fn) { onExternal = fn; },
    wasRecovered: function () { return recovered; },
    salvagedCount: function () { return salvaged; },
    canNext: canNext, nextQuestion: nextQuestion, tick: tick, newGame: newGame, setPos: setPos,
    addQuestion: addQuestion, updateQuestion: updateQuestion, deleteQuestion: deleteQuestion,
    parseBulk: parseBulk, addMany: addMany,
    exportData: exportData, importData: importData
  };
})();
