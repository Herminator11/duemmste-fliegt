/* Test des Servers: node server/test.js */
"use strict";
const assert = require("assert");
process.env.DATA_FILE = require("path").join(require("os").tmpdir(), "dfg-test-" + process.pid + ".json");
const { server } = require("./server.js");

const view = (over) => Object.assign({
  players: [{ id: "a", name: "Anna", lives: 3, out: false, answers: [] }, { id: "b", name: "Ben", lives: 3, out: false, answers: [] },
    { id: "c", name: "Cleo", lives: 3, out: false, answers: [] }],
  startLives: 3, session: null, remaining: 0, voting: false, voteKey: null, vote: null, winner: null
}, over || {});

(async function () {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  // Dateien: nur erlaubte Pfade
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/join.html")).status, 200);
  assert.equal((await fetch(base + "/js/store.js")).status, 200);
  assert.equal((await fetch(base + "/server/server.js")).status, 404);
  assert.equal((await fetch(base + "/package.json")).status, 404);
  assert.equal((await fetch(base + "/js/..%2Fserver%2Fserver.js")).status, 404);

  const room = (await call("POST", "/api/rooms")).body;
  assert(/^[A-Z]{4}$/.test(room.code) && room.hostToken);
  const R = "/api/rooms/" + room.code;

  assert.equal((await call("PUT", R + "/view", { hostToken: "falsch", view: view() })).status, 403);
  assert.equal((await call("PUT", R + "/view", { hostToken: room.hostToken, view: { x: 1 } })).status, 400);
  assert.equal((await call("PUT", R + "/view", { hostToken: room.hostToken, view: view() })).status, 200);

  // Claim
  const ca = (await call("POST", R + "/claim", { playerId: "a" })).body;
  assert(ca.token);
  assert.equal((await call("POST", R + "/claim", { playerId: "a" })).status, 409);       // vergeben
  assert.equal((await call("POST", R + "/claim", { playerId: "a", token: ca.token })).status, 200); // Rückkehr
  const cb = (await call("POST", R + "/claim", { playerId: "b" })).body;
  const cc = (await call("POST", R + "/claim", { playerId: "c" })).body;
  assert.equal((await call("POST", R + "/claim", { playerId: "zzz" })).status, 400);

  // Stimme nur bei offener Abstimmung
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "b" })).status, 409);

  // SSE-Strom lesen
  const events = [];
  const ac = new AbortController();
  const sse = await fetch(base + R + "/events?token=" + ca.token, { signal: ac.signal });
  (async () => {
    const dec = new TextDecoder(); let buf = "";
    try { for await (const chunk of sse.body) { buf += dec.decode(chunk); let i; while ((i = buf.indexOf("\n\n")) >= 0) { const m = buf.slice(0, i); buf = buf.slice(i + 2); if (m.startsWith("data: ")) events.push(JSON.parse(m.slice(6))); } } } catch (e) { /* abgebrochen */ }
  })();
  const waitFor = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error("Timeout: " + JSON.stringify(events.slice(-1))); };
  await waitFor(() => events.length >= 1);
  assert.equal(events[0].me.playerId, "a");

  // Abstimmung öffnen
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:1" }) });
  await waitFor(() => events.some((e) => e.view && e.view.voting));
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "a" })).status, 200);   // Selbstwahl ist erlaubt
  assert.equal((await call("POST", R + "/vote", { token: "nix", target: "b" })).status, 403);
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "b" })).status, 200);
  assert.equal((await call("POST", R + "/vote", { token: cb.token, target: "c" })).status, 200);
  await waitFor(() => { const e = events[events.length - 1]; return e.progress && e.progress.count === 2; });
  const last = events[events.length - 1];
  assert.deepEqual(last.progress.voted, [], "ohne showVoted keine Wählerliste für Spieler");
  const hostView = (await call("GET", R + "?host=" + room.hostToken)).body;
  assert.deepEqual(hostView.progress.voted.sort(), ["a", "b"], "Master sieht die Wählerliste");
  assert.deepEqual((await call("GET", R + "?host=falsch")).body.progress.voted, []);
  assert.equal(last.me.vote, "b");
  assert(!JSON.stringify(events).includes('"c","b"'), "Stimmen anderer dürfen nicht im Strom stehen");
  assert(!("votes" in last), "kein votes-Feld im Strom");
  // Änderung und Rückzug
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "c" })).body.vote, "c");
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "" })).body.vote, null);
  await call("POST", R + "/vote", { token: ca.token, target: "c" });

  // Master holt die Stimmen, Fremde nicht
  assert.equal((await call("POST", R + "/votes", { hostToken: "x" })).status, 403);
  const vs = (await call("POST", R + "/votes", { hostToken: room.hostToken })).body;
  assert.deepEqual(vs.votes, { a: "c", b: "c" });

  // Stichwahl: neuer Schlüssel leert die Stimmen, nur Kandidaten sind wählbar
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:1:2", voterIds: ["a", "b", "c"], candidates: ["a", "b"] }) });
  assert.deepEqual((await call("POST", R + "/votes", { hostToken: room.hostToken })).body.votes, {});
  assert.equal((await call("POST", R + "/vote", { token: cc.token, target: "c" })).status, 400);   // c steht nicht zur Wahl
  assert.equal((await call("POST", R + "/vote", { token: cc.token, target: "a" })).status, 200);   // c darf aber wählen
  // Geist: darf wählen, aber nicht ohne Wahlrecht
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:1:2", voterIds: ["a", "b"], candidates: ["a", "b"] }) });
  assert.equal((await call("POST", R + "/vote", { token: cc.token, target: "a" })).status, 403);
  assert.deepEqual((await call("POST", R + "/votes", { hostToken: room.hostToken })).body.votes, {});   // seine Stimme verfällt

  // Spieler scheidet aus: seine Stimme verfällt, Wahl auf ihn auch
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:1", players: view().players.map((p) => p.id === "c" ? Object.assign({}, p, { out: true }) : p) }) });
  assert.deepEqual((await call("POST", R + "/votes", { hostToken: room.hostToken })).body.votes, {});
  assert.equal((await call("POST", R + "/vote", { token: cc.token, target: "a" })).status, 403);   // ausgeschieden

  // Abstimmung geschlossen: keine Stimmen
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view() });
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "b" })).status, 409);

  // neue Abstimmung mit neuem Schlüssel leert Stimmen
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:2" }) });
  await call("POST", R + "/vote", { token: ca.token, target: "b" });
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:3" }) });
  assert.deepEqual((await call("POST", R + "/votes", { hostToken: room.hostToken })).body.votes, {});

  // Aufgelöste Abstimmung zurücknehmen: Stimmen Ausgeschiedener bleiben erhalten
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:4" }) });
  await call("POST", R + "/vote", { token: ca.token, target: "b" });
  await call("POST", R + "/vote", { token: cb.token, target: "c" });
  const withCOut = view({ players: view().players.map((p) => p.id === "c" ? Object.assign({}, p, { out: true }) : p) });
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: withCOut });
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ voting: true, voteKey: "g:4" }) });
  assert.deepEqual((await call("POST", R + "/votes", { hostToken: room.hostToken })).body.votes, { a: "b", b: "c" });

  // Freigeben
  await call("POST", R + "/release", { hostToken: room.hostToken, playerId: "a" });
  assert.equal((await call("POST", R + "/vote", { token: ca.token, target: "b" })).status, 403);
  assert.equal((await call("POST", R + "/claim", { playerId: "a" })).status, 200);

  // Spieler entfernt: Zuordnung weg
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ players: view().players.slice(0, 2) }) });
  assert.deepEqual((await call("GET", R)).body.claimed.sort(), ["a", "b"]);

  // ---------- Avatare ----------
  const zlib = require("zlib");
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const png = (w, h) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  };
  const uri = (b) => "data:image/png;base64," + b.toString("base64");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const AV = R + "/avatar";
  const gen = { type: "gen", style: "open-peeps", seed: "Anna", opts: { head: ["afro"], skinColor: ["ffdbb4"], facialHairProbability: 100 } };

  assert.equal((await call("POST", AV, { token: "nix", avatar: gen })).status, 403);           // nicht angemeldet
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "gen", style: "evil", seed: "x", opts: {} } })).status, 400);
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "gen", style: "lorelei", seed: "x", opts: { "<script>": ["a"] } } })).status, 400);
  await wait(1600);
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "gen", style: "lorelei", seed: "x", opts: { hair: ["a b"] } } })).status, 400);   // Zeichen nicht erlaubt
  await wait(1600);
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "draw", png: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" } })).status, 400);   // SVG nie
  await wait(1600);
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "draw", png: uri(Buffer.from("kein png, nur Text, aber lang genug damit die Länge stimmt....")) } })).status, 400);
  await wait(1600);
  assert.equal((await call("POST", AV, { token: cb.token, avatar: { type: "draw", png: uri(png(2000, 2000)) } })).status, 400);                              // zu viele Pixel
  await wait(1600);
  const ok = await call("POST", AV, { token: cb.token, avatar: { type: "draw", png: uri(png(128, 128)) } });
  assert.equal(ok.status, 200); assert(ok.body.avatar.v && !ok.body.avatar.png, "Antwort enthält nur die Version");
  assert.equal((await call("POST", AV, { token: cb.token, avatar: gen })).status, 429);                                                                    // zu schnell
  const img = await fetch(base + AV + "/b?v=" + ok.body.avatar.v);
  assert.equal(img.status, 200); assert.equal(img.headers.get("content-type"), "image/png"); assert.equal(img.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(base + AV + "/c")).status, 404);
  // Strom enthält Verweise, keine Bilddaten
  await waitFor(() => events.some((e) => e.avatars && e.avatars.b && e.avatars.b.v));
  const lastEv = events[events.length - 1];
  assert.equal(lastEv.avatars.b.type, "draw"); assert(!JSON.stringify(lastEv).includes("iVBOR"), "kein PNG im Strom");
  // Master setzt erzeugten Avatar und entfernt wieder
  assert.equal((await call("PUT", AV + "/a", { hostToken: "falsch", avatar: gen })).status, 403);
  assert.equal((await call("PUT", AV + "/a", { hostToken: room.hostToken, avatar: gen })).status, 200);
  await waitFor(() => events[events.length - 1].avatars.a && events[events.length - 1].avatars.a.style === "open-peeps");
  assert.equal((await call("PUT", AV + "/a", { hostToken: room.hostToken, avatar: null })).status, 200);
  await waitFor(() => !events[events.length - 1].avatars.a);
  // Spieler entfernt: Avatar weg
  await call("PUT", R + "/view", { hostToken: room.hostToken, view: view({ players: view().players.slice(0, 1) }) });
  assert.equal((await fetch(base + AV + "/b")).status, 404);

  // Schließen
  assert.equal((await call("POST", R + "/close", { hostToken: room.hostToken })).status, 200);
  assert.equal((await call("GET", R)).status, 404);

  ac.abort();
  console.log("Server-Test: alle Prüfungen bestanden");
  server.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
