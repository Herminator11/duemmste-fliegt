/* Server für „Der Dümmste fliegt“: liefert die Seiten aus und verteilt den öffentlichen Spielstand in Echtzeit.
   Keine Abhängigkeiten. Echtzeit über Server-Sent Events (SSE), Eingaben der Handys über normale POST-Anfragen.

   Aufgabenteilung:
   - Der Master (Laptop) behält das ganze Spiel. Er schickt nur die öffentliche Sicht („view“) an den Server.
   - Der Server hält die geheimen Stimmen der Spieler und gibt sie nur dem Master auf Anfrage heraus.
   - Spieler-Handys und Game Screen lesen nur die öffentliche Sicht. */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 8000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "rooms.json");
const ROOM_TTL = 24 * 3600 * 1000;
const MAX_BODY = 256 * 1024;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const AVATAR_STYLES = ["open-peeps", "lorelei"];
const MAX_PNG = 30000;            // Bytes einer gezeichneten Figur
const MAX_PNG_SIDE = 256;         // Pixel je Seite
const AVATAR_GAP = 1500;          // ms zwischen zwei Uploads desselben Spielers
const TOKEN_RE = /^[A-Za-z0-9]{1,24}$/;

const MIME = { ".txt": "text/plain; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const PUBLIC_DIRS = ["css", "js", "fonts"];
const PUBLIC_FILES = ["index.html", "join.html"];

/* ---------- Räume ---------- */
const rooms = new Map();
/* room: { code, hostToken, view, claims:{playerId:token}, votes:{playerId:targetId}, voteKey, avatars:{playerId:avatar}, touched, clients:Set }
   avatar: {type:"gen", style, seed, opts} oder {type:"draw", v, png:<base64 ohne Präfix>} */
const lastUpload = new Map();

function token() { return crypto.randomBytes(16).toString("hex"); }
function newCode() {
  for (let n = 0; n < 200; n++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error("Kein freier Raumcode");
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    (raw.rooms || []).forEach(function (r) {
      if (!r || typeof r.code !== "string" || typeof r.hostToken !== "string") return;
      if (Date.now() - (r.touched || 0) > ROOM_TTL) return;
      rooms.set(r.code, { code: r.code, hostToken: r.hostToken, view: r.view || null, claims: r.claims || {}, votes: r.votes || {},
        voteKey: r.voteKey || null, avatars: r.avatars || {}, touched: r.touched || Date.now(), clients: new Set() });
    });
  } catch (e) { /* noch keine Daten */ }
}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(function () {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      const list = [...rooms.values()].map(function (r) {
        return { code: r.code, hostToken: r.hostToken, view: r.view, claims: r.claims, votes: r.votes, voteKey: r.voteKey, avatars: r.avatars, touched: r.touched };
      });
      fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify({ rooms: list }));
      fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);
    } catch (e) { console.error("Speichern fehlgeschlagen:", e.message); }
  }, 500);
}

function alivePlayers(room) {
  return room.view && Array.isArray(room.view.players) ? room.view.players.filter(function (p) { return !p.out; }) : [];
}
/* Wer wählen darf (Lebende und Geister mit Wahlrecht) und wer zur Wahl steht (Lebende, in der Stichwahl nur die Gleichstehenden).
   Beides kommt fertig aus der Sicht des Masters. Ältere Sichten ohne diese Felder fallen auf die Lebenden zurück. */
function voterIds(room) {
  if (room.view && Array.isArray(room.view.voterIds)) return room.view.voterIds;
  return alivePlayers(room).map(function (p) { return p.id; });
}
function candidateIds(room) {
  if (room.view && Array.isArray(room.view.candidates)) return room.view.candidates;
  return alivePlayers(room).map(function (p) { return p.id; });
}
function playerIds(room) {
  return room.view && Array.isArray(room.view.players) ? room.view.players.map(function (p) { return p.id; }) : [];
}

/* Bereinigt Zuordnungen und Stimmen, wenn der Master Spieler entfernt oder ausscheiden lässt. */
function reconcile(room) {
  const ids = playerIds(room), voters = voterIds(room), cands = candidateIds(room);
  Object.keys(room.claims).forEach(function (id) { if (ids.indexOf(id) < 0) delete room.claims[id]; });
  Object.keys(room.avatars).forEach(function (id) { if (ids.indexOf(id) < 0) delete room.avatars[id]; });
  /* Entfernte Spieler verlieren ihre Stimmen immer. Wer nicht (mehr) wählen darf oder nicht (mehr) zur Wahl steht, nur bei offener
     Abstimmung, sonst gingen die Stimmen beim Zurücknehmen einer Auflösung verloren. */
  const open = !!(room.view && room.view.voting);
  Object.keys(room.votes).forEach(function (voter) {
    const t = room.votes[voter];
    if (ids.indexOf(voter) < 0 || ids.indexOf(t) < 0 || (open && (voters.indexOf(voter) < 0 || cands.indexOf(t) < 0))) delete room.votes[voter];
  });
}

function voteProgress(room, full) {
  const eligible = voterIds(room);
  const voted = Object.keys(room.votes).filter(function (id) { return eligible.indexOf(id) >= 0; });
  /* Wer gestimmt hat, sehen nur der Master und, bei eingeschalteter Regel, alle. Sonst nur die Anzahl. */
  return { voted: full || (room.view && room.view.showVoted) ? voted : [], count: voted.length, total: eligible.length, voteKey: room.voteKey };
}

/* Avatar-Verweise für alle: erzeugte komplett (klein), gezeichnete nur mit Versionsnummer. */
function avatarMeta(room) {
  const out = {};
  Object.keys(room.avatars).forEach(function (id) {
    const a = room.avatars[id];
    out[id] = a.type === "draw" ? { type: "draw", v: a.v } : a;
  });
  return out;
}

/* Prüft einen Avatar aus dem Netz. Gibt das bereinigte Objekt zurück oder einen Fehlertext. */
function checkAvatar(a) {
  if (!a || typeof a !== "object") return { error: "Ungültiger Avatar." };
  if (a.type === "gen") {
    if (AVATAR_STYLES.indexOf(a.style) < 0) return { error: "Unbekannter Stil." };
    const opts = {}; let n = 0;
    const o = a.opts && typeof a.opts === "object" && !Array.isArray(a.opts) ? a.opts : {};
    for (const k of Object.keys(o)) {
      if (n >= 20 || !/^[a-zA-Z]{1,24}$/.test(k)) return { error: "Ungültige Option." };
      const v = o[k];
      if (typeof v === "number" && isFinite(v)) opts[k] = Math.max(0, Math.min(100, Math.round(v)));
      else if (typeof v === "string" && TOKEN_RE.test(v)) opts[k] = v;
      else if (Array.isArray(v) && v.length > 0 && v.length <= 4 && v.every(function (x) { return typeof x === "string" && TOKEN_RE.test(x); })) opts[k] = v.slice();
      else return { error: "Ungültiger Optionswert." };
      n += 1;
    }
    return { avatar: { type: "gen", style: a.style, seed: String(a.seed == null ? "" : a.seed).slice(0, 40), opts } };
  }
  if (a.type === "draw") {
    const m = /^data:image\/png;base64,([A-Za-z0-9+\/]+={0,2})$/.exec(typeof a.png === "string" ? a.png : "");
    if (!m) return { error: "Nur PNG-Bilder sind erlaubt." };
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > MAX_PNG) return { error: "Das Bild ist zu groß." };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buf.length < 33 || sig.some(function (b, i) { return buf[i] !== b; }) || buf.toString("ascii", 12, 16) !== "IHDR") return { error: "Das ist kein PNG-Bild." };
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    if (!w || !h || w > MAX_PNG_SIDE || h > MAX_PNG_SIDE) return { error: "Die Bildgröße ist nicht erlaubt." };
    const v = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
    return { avatar: { type: "draw", v, png: m[1] } };
  }
  return { error: "Unbekannter Avatar-Typ." };
}

/* Was ein bestimmter Empfänger sieht. Nie die Stimmen anderer. */
function payloadFor(room, playerToken, isHost) {
  const out = { view: room.view, progress: room.view && room.view.voting ? voteProgress(room, isHost) : null,
    claimed: Object.keys(room.claims), avatars: avatarMeta(room), serverTime: Date.now() };
  if (playerToken) out.me = meFor(room, playerToken);
  return out;
}
function meFor(room, playerToken) {
  const pid = Object.keys(room.claims).find(function (id) { return room.claims[id] === playerToken; });
  return pid ? { playerId: pid, vote: room.votes[pid] || null } : null;
}

/* Der gemeinsame Teil wird je Empfängerart (Master oder nicht) nur einmal serialisiert, nur „me“ kommt je Client dazu. */
function broadcast(room) {
  const base = {};
  room.clients.forEach(function (c) {
    try {
      const k = c.isHost ? "h" : "p";
      if (!base[k]) base[k] = JSON.stringify(payloadFor(room, "", c.isHost)).slice(0, -1);
      const me = c.playerToken ? ',"me":' + JSON.stringify(meFor(room, c.playerToken)) : "";
      c.res.write("data: " + base[k] + me + "}\n\n");
    } catch (e) { room.clients.delete(c); }
  });
}

/* ---------- HTTP-Helfer ---------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readJson(req, res, cb) {
  let size = 0, tooBig = false; const chunks = [];
  req.on("data", function (c) {
    if (tooBig) return;
    size += c.length;
    if (size > MAX_BODY) { tooBig = true; send(res, 413, { error: "Anfrage zu groß" }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on("end", function () {
    let obj = {};
    try { obj = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch (e) { return send(res, 400, { error: "Ungültiges JSON" }); }
    if (!obj || typeof obj !== "object") return send(res, 400, { error: "Ungültige Anfrage" });
    try { cb(obj); } catch (e) {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: "Serverfehler" }); else res.end();
    }
  });
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function getRoom(res, code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) { send(res, 404, { error: "Raum nicht gefunden" }); return null; }
  return room;
}
function hostRoom(res, code, tok) {
  const room = getRoom(res, code);
  if (!room) return null;
  if (!safeEqual(tok, room.hostToken)) { send(res, 403, { error: "Kein Zugriff" }); return null; }
  return room;
}

/* ---------- API ---------- */
function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api","rooms",CODE,...]
  const method = req.method;

  if (parts[1] === "ping") return send(res, 200, { ok: true, time: Date.now() });
  if (parts[1] !== "rooms") return send(res, 404, { error: "Unbekannt" });

  if (parts.length === 2 && method === "POST") {
    if (rooms.size > 500) return send(res, 503, { error: "Zu viele Räume" });
    const room = { code: newCode(), hostToken: token(), view: null, claims: {}, votes: {}, voteKey: null, avatars: {}, touched: Date.now(), clients: new Set() };
    rooms.set(room.code, room);
    saveSoon();
    return send(res, 201, { code: room.code, hostToken: room.hostToken });
  }

  const code = parts[2], sub = parts[3];

  /* Echtzeit-Strom für alle: ?token=<Spielertoken> liefert zusätzlich „me“ */
  if (sub === "events" && method === "GET") {
    const room = getRoom(res, code);
    if (!room) return;
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
    res.write("retry: 2000\n\n");
    const client = { res, playerToken: url.searchParams.get("token") || "", isHost: safeEqual(url.searchParams.get("host"), room.hostToken) };
    room.clients.add(client);
    res.write("data: " + JSON.stringify(payloadFor(room, client.playerToken, client.isHost)) + "\n\n");
    const beat = setInterval(function () { try { res.write(": ♥\n\n"); } catch (e) { /* Verbindung weg */ } }, 25000);
    req.on("close", function () { clearInterval(beat); room.clients.delete(client); });
    return;
  }

  if (!sub && method === "GET") {
    const room = getRoom(res, code);
    if (!room) return;
    return send(res, 200, payloadFor(room, url.searchParams.get("token") || "", safeEqual(url.searchParams.get("host"), room.hostToken)));
  }

  /* Master schickt die öffentliche Sicht */
  if (sub === "view" && method === "PUT") {
    return readJson(req, res, function (b) {
      const room = hostRoom(res, code, b.hostToken);
      if (!room) return;
      const v = b.view;
      if (!v || typeof v !== "object" || !Array.isArray(v.players) ||
        !v.players.every(function (p) { return p && typeof p === "object" && typeof p.id === "string"; })) return send(res, 400, { error: "Ungültige Ansicht" });
      const key = v.voting && typeof v.voteKey === "string" ? v.voteKey : null;
      if (key && key !== room.voteKey) room.votes = {};   // neue Abstimmung: alte Stimmen weg
      if (key) room.voteKey = key;
      room.view = v; room.touched = Date.now();
      reconcile(room);
      saveSoon(); broadcast(room);
      send(res, 200, { ok: true });
    });
  }

  /* Master holt die geheimen Stimmen zur Auflösung */
  if (sub === "votes" && method === "POST") {
    return readJson(req, res, function (b) {
      const room = hostRoom(res, code, b.hostToken);
      if (!room) return;
      reconcile(room);
      send(res, 200, { votes: room.votes, voteKey: room.voteKey });
    });
  }

  /* Avatar-Bild abrufen. Die Versionsnummer in der Adresse macht die Antwort dauerhaft zwischenspeicherbar. */
  if (sub === "avatar" && parts[4] && method === "GET") {
    const room = getRoom(res, code);
    if (!room) return;
    const a = room.avatars[parts[4]];
    if (!a || a.type !== "draw") return send(res, 404, { error: "Kein Bild" });
    const body = Buffer.from(a.png, "base64");
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": body.length, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'", "Cache-Control": "public, max-age=31536000, immutable" });
    return res.end(body);
  }

  /* Spieler setzt seinen eigenen Avatar */
  if (sub === "avatar" && !parts[4] && method === "POST") {
    return readJson(req, res, function (b) {
      const room = getRoom(res, code);
      if (!room) return;
      const pid = Object.keys(room.claims).find(function (id) { return safeEqual(b.token, room.claims[id]); });
      if (!pid) return send(res, 403, { error: "Du bist in diesem Raum nicht angemeldet." });
      const gapKey = room.code + ":" + pid, now = Date.now();
      if (now - (lastUpload.get(gapKey) || 0) < AVATAR_GAP) return send(res, 429, { error: "Bitte kurz warten." });
      const r = checkAvatar(b.avatar);
      if (r.error) return send(res, 400, { error: r.error });
      lastUpload.set(gapKey, now);
      room.avatars[pid] = r.avatar; room.touched = now;
      saveSoon(); broadcast(room);
      send(res, 200, { ok: true, avatar: avatarMeta(room)[pid] });
    });
  }

  /* Master setzt oder entfernt einen Avatar (zum Beispiel Zurücksetzen oder Spieler ohne Handy) */
  if (sub === "avatar" && parts[4] && method === "PUT") {
    return readJson(req, res, function (b) {
      const room = hostRoom(res, code, b.hostToken);
      if (!room) return;
      if (playerIds(room).indexOf(parts[4]) < 0) return send(res, 400, { error: "Diesen Spieler gibt es nicht." });
      if (b.avatar === null) delete room.avatars[parts[4]];
      else {
        const r = checkAvatar(b.avatar);
        if (r.error) return send(res, 400, { error: r.error });
        room.avatars[parts[4]] = r.avatar;
      }
      room.touched = Date.now();
      saveSoon(); broadcast(room);
      send(res, 200, { ok: true, avatar: avatarMeta(room)[parts[4]] || null });
    });
  }

  /* Master gibt einen Spielernamen frei (Handy verloren, falscher Name gewählt) */
  if (sub === "release" && method === "POST") {
    return readJson(req, res, function (b) {
      const room = hostRoom(res, code, b.hostToken);
      if (!room) return;
      delete room.claims[b.playerId];
      delete room.votes[b.playerId];
      saveSoon(); broadcast(room);
      send(res, 200, { ok: true });
    });
  }

  if (sub === "close" && method === "POST") {
    return readJson(req, res, function (b) {
      const room = hostRoom(res, code, b.hostToken);
      if (!room) return;
      room.clients.forEach(function (c) { try { c.res.end(); } catch (e) { /* egal */ } });
      rooms.delete(room.code);
      lastUpload.forEach(function (t, k) { if (k.startsWith(room.code + ":")) lastUpload.delete(k); });
      saveSoon();
      send(res, 200, { ok: true });
    });
  }

  /* Spieler wählt seinen Namen. Mit gültigem Token holt er seinen Platz zurück. */
  if (sub === "claim" && method === "POST") {
    return readJson(req, res, function (b) {
      const room = getRoom(res, code);
      if (!room) return;
      if (playerIds(room).indexOf(b.playerId) < 0) return send(res, 400, { error: "Diesen Spieler gibt es nicht." });
      const cur = room.claims[b.playerId];
      if (cur && !safeEqual(b.token, cur)) return send(res, 409, { error: "Dieser Name ist schon vergeben." });
      // ein Handy hält nur einen Namen
      Object.keys(room.claims).forEach(function (id) { if (id !== b.playerId && safeEqual(b.token, room.claims[id])) { delete room.claims[id]; delete room.votes[id]; } });
      const tok = cur || token();
      room.claims[b.playerId] = tok;
      room.touched = Date.now();
      saveSoon(); broadcast(room);
      send(res, 200, { token: tok, playerId: b.playerId });
    });
  }

  /* Geheime Stimme. Nur während einer offenen Abstimmung. Wählen darf, wer Wahlrecht hat, gewählt wird ein Kandidat (auch man selbst). */
  if (sub === "vote" && method === "POST") {
    return readJson(req, res, function (b) {
      const room = getRoom(res, code);
      if (!room) return;
      const voter = Object.keys(room.claims).find(function (id) { return safeEqual(b.token, room.claims[id]); });
      if (!voter) return send(res, 403, { error: "Du bist in diesem Raum nicht angemeldet." });
      if (!room.view || !room.view.voting) return send(res, 409, { error: "Es läuft gerade keine Abstimmung." });
      if (voterIds(room).indexOf(voter) < 0) return send(res, 403, { error: "Du bist ausgeschieden." });
      if (!b.target) { delete room.votes[voter]; }
      else {
        if (candidateIds(room).indexOf(b.target) < 0) return send(res, 400, { error: "Diese Wahl ist nicht möglich." });
        room.votes[voter] = b.target;
      }
      room.touched = Date.now();
      saveSoon(); broadcast(room);
      send(res, 200, { ok: true, vote: room.votes[voter] || null });
    });
  }

  send(res, 404, { error: "Unbekannt" });
}

/* ---------- Dateien ---------- */
function serveFile(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel === "/" || rel === "") rel = "/index.html";
  // Erlaubt wird nach dem Auflösen von „..“, sonst käme man über /js/..%2Fserver an andere Dateien.
  const file = path.normalize(path.join(ROOT, rel));
  const inside = path.relative(ROOT, file).split(path.sep);
  const allowed = !inside[0].startsWith("..") && (inside.length === 1 ? PUBLIC_FILES.indexOf(inside[0]) >= 0 : PUBLIC_DIRS.indexOf(inside[0]) >= 0);
  if (!allowed) { res.writeHead(404); return res.end("Nicht gefunden"); }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": path.extname(file) === ".woff2" ? "public, max-age=86400" : "no-cache" });
    if (req.method === "HEAD") return res.end();
    res.end(data);
  });
}

const server = http.createServer(function (req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return api(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    serveFile(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500); }
    res.end();
  }
});

setInterval(function () {
  const now = Date.now();
  rooms.forEach(function (r, code) { if (now - r.touched > ROOM_TTL && !r.clients.size) rooms.delete(code); });
  lastUpload.forEach(function (t, k) { if (now - t > AVATAR_GAP) lastUpload.delete(k); });
}, 3600 * 1000).unref();

function lanUrls() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(function (list) {
    (list || []).forEach(function (i) { if (i.family === "IPv4" && !i.internal) out.push("http://" + i.address + ":" + PORT + "/"); });
  });
  return out;
}

if (require.main === module) {
  load();
  server.listen(PORT, function () {
    console.log("Der Dümmste fliegt läuft:");
    console.log("  Master (Laptop):  http://localhost:" + PORT + "/");
    lanUrls().forEach(function (u) { console.log("  Im WLAN (Handys): " + u + "join.html"); });
  });
  process.on("SIGINT", function () { process.exit(0); });
}

module.exports = { server, rooms };
