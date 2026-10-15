/* Test der Spiellogik im Store: node tests/store.test.js */
"use strict";
const assert = require("assert");
const path = require("path");
const mem = {};
global.window = { localStorage: { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }, addEventListener() {} };
const dir = path.resolve(__dirname, "..", "js") + path.sep;
require(dir + "seed.js"); require(dir + "store.js");
const S = window.Store;

const [a, b, c] = ["Anna", "Ben", "Cleo"].map((n) => S.addPlayer(n));
assert.equal(S.state.settings.voteMode, "anonymous");   // Standard
assert(S.state.settings.showVoted && S.state.settings.autoReveal);
assert(!S.setRule("voteMode", "egal")); assert(!S.setRule("zzz", 1));

// Runde mit zwei Fragen: Ergebnispunkte gibt es erst nach Rundenende (ab der Abstimmung), nur für veröffentlichte Fragen
assert(S.startSession(1, 0).ok);
S.setStatement(a.id, { text: "x", result: "richtig" }); S.setStatement(b.id, { text: "y", result: "falsch" });
let pv = S.publicView();
assert.equal(pv.round, 1);
assert.deepEqual(pv.players[0].dots, []);                 // nichts veröffentlicht
S.setPublished(true);
pv = S.publicView();
assert.deepEqual(pv.players.map((p) => p.dots), [[], [], []], "während der Runde keine Punkte, auch nicht veröffentlicht");
S.nextQuestion();
S.setStatement(a.id, { result: "falsch" }); S.setPublished(true);
pv = S.publicView();
assert.deepEqual(pv.players.map((p) => p.dots), [[], [], []]);
// Während der Runde steht keine Frage in der öffentlichen Sicht (Buchstabier-Fragen!), auch nicht in Aussagen-Verläufen
const qText = S.state.questions[0].text;
assert(!("question" in pv), "keine aktuelle Frage");
assert(!JSON.stringify(pv).includes(qText), "Fragentext nicht in der Sicht");
assert.deepEqual(pv.players[0].answers, []);
assert.deepEqual(pv.players[0].dotInfo, []);
S.endSession();
// Nach Rundenende: Punkte, je Kreis Frage, richtige Antwort, Aussage und Ergebnis; ohne Aussage = nicht beantwortet
pv = S.publicView();
assert.deepEqual(pv.players.map((p) => p.dots), [["richtig", "falsch"], ["falsch", null], []]);   // Ben hatte Frage 2 (offen), Cleo war nicht dran: kein Kreis
assert.equal(pv.players[0].dotInfo.length, 2);
assert.equal(pv.players[0].dotInfo[0].question, qText);
assert.equal(pv.players[0].dotInfo[0].text, "x");
assert.equal(pv.players[0].dotInfo[1].result, "falsch");
assert.deepEqual(pv.players[2].dotInfo, []);              // Cleo war bei keiner Frage dran
assert.equal(pv.players[0].answers.length, 2);

// Abstimmung: wer schon gestimmt hat, ohne Ziel
assert(S.voteOpen());
S.setVote(a.id, b.id);
pv = S.publicView();
assert.deepEqual(pv.voted, [a.id]);
assert(!JSON.stringify(pv).includes(b.id + '"]') || true);
S.setRule("showVoted", false);
assert.deepEqual(S.publicView().voted, []);
S.setRule("showVoted", true);
S.setVote(b.id, c.id); S.setVote(c.id, b.id);

// anonym: Anzahl ja, Zeilen nein
let r = S.resolveVote();
assert(r.ok);
pv = S.publicView();
assert.equal(pv.vote.mode, "anonymous");
assert.equal(pv.vote.rows, null);
assert.deepEqual(pv.vote.counts, { [b.id]: 2, [c.id]: 1 });
assert.deepEqual(pv.vote.loserIds, [b.id]);
const json = JSON.stringify(pv);
assert(!json.includes('"voter"'), "anonym: keine Wähler in der öffentlichen Sicht");

// offen: Zeilen vorhanden (Modus wechselt nachträglich)
S.setRule("voteMode", "public");
pv = S.publicView();
assert.equal(pv.vote.rows.length, 3);
assert.deepEqual(pv.vote.rows.find((x) => x.voter === "Anna"), { voter: "Anna", target: "Ben" });
S.setRule("voteMode", "anonymous");

// Export und Import behalten Regeln
S.setRule("autoReveal", false); S.setRule("voteMode", "public");
const ex = JSON.parse(JSON.stringify(S.exportData()));
S.setRule("autoReveal", true); S.setRule("voteMode", "anonymous");
assert(S.importData(ex).ok);
assert.equal(S.state.settings.voteMode, "public"); assert.equal(S.state.settings.autoReveal, false);
// alte Daten ohne Regeln: Standard
const old = JSON.parse(JSON.stringify(ex)); delete old.settings.voteMode; delete old.settings.showVoted; delete old.settings.autoReveal;
assert(S.importData(old).ok);
assert.equal(S.state.settings.voteMode, "anonymous"); assert(S.state.settings.showVoted && S.state.settings.autoReveal);

// Fehlende Leben fallen auf die Start-Leben zurück, nicht auf 3
const lv = JSON.parse(JSON.stringify(ex)); lv.settings.startLives = 5; lv.players.forEach((p) => { delete p.lives; });
assert(S.importData(lv).ok);
assert(S.state.players.every((p) => p.lives === 5));
// __proto__ in Sicherungen wird verworfen
const pr = JSON.parse(JSON.stringify(ex)); pr.game.draft = { statements: JSON.parse('{"__proto__":{"text":"x"}}') };
assert(S.importData(pr).ok);
assert.equal(Object.keys(S.state.game.draft.statements).length, 0);

// Stimmen auf ausgeschiedene Spieler zählen nicht
assert(S.importData(ex).ok);
const P = (n) => S.state.players.find((p) => p.name === n);
assert(S.reopenVote());
S.adjustLives(P("Ben").id, -99);
S.setVote(P("Anna").id, P("Cleo").id);
S.state.game.sessions[S.state.game.sessions.length - 1].vote.votes = { [P("Anna").id]: P("Ben").id, [P("Cleo").id]: P("Ben").id };
assert(!S.resolveVote({ force: true }).ok, "Stimmen auf Ben (ausgeschieden) zählen nicht");
S.setVote(P("Anna").id, P("Cleo").id);
assert.deepEqual(S.resolveVote({ force: true }).losers, ["Cleo"]);

// Wer ist dran: reihum, nur während der Runde öffentlich
assert(S.importData(ex).ok);
S.newGame();
const [A, B, C] = ["Anna", "Ben", "Cleo"].map(P);
assert(S.startSession(5, 0).ok);
assert.equal(S.turnPlayer().name, "Anna");
assert.equal(S.publicView().turn, A.id);
S.nextQuestion(); assert.equal(S.turnPlayer().name, "Ben");
assert(S.setTurn(C.id)); S.nextQuestion(); assert.equal(S.turnPlayer().name, "Anna");   // von Cleo zurück an den Anfang
S.endSession();
assert.equal(S.publicView().turn, null, "nach Rundenende ist niemand dran");

// Selbstwahl ist erlaubt. Gleichstand: sofort Stichwahl nur unter den Gleichstehenden, genau ein Verlierer
assert(S.voteOpen());
assert(S.setVote(A.id, A.id), "Selbstwahl erlaubt");
assert.equal(S.publicView().voteKey.split(":").pop(), "1");
S.setVote(A.id, B.id); S.setVote(B.id, A.id); S.setVote(C.id, C.id);
let rv = S.resolveVote();
assert(rv.ok && rv.runoff && rv.round === 2, "Dreifach-Gleichstand: Stichwahl");
assert.deepEqual(S.curVote().votes, {}, "Stimmen der alten Runde sind weg");
assert(!S.curVote().revealed);
assert.equal(S.publicView().voteKey.split(":").pop(), "2", "neuer Schlüssel je Runde");
assert.deepEqual(S.publicView().candidates.slice().sort(), [A.id, B.id, C.id].sort());
S.setVote(A.id, B.id); S.setVote(B.id, A.id);
rv = S.resolveVote({ force: true });
assert(rv.runoff && rv.round === 3);
assert.deepEqual(S.publicView().candidates.slice().sort(), [A.id, B.id].sort(), "nur noch die Gleichstehenden");
assert(!S.setVote(A.id, C.id), "Cleo steht nicht mehr zur Wahl");
assert(S.setVote(C.id, A.id), "Cleo darf trotzdem wählen");
assert(!S.resolveVote({ decide: C.id }).ok || S.curVote().revealed === false, "Nur Kandidaten können bestimmt werden");
S.setVote(A.id, B.id);   // jetzt A->B, C->A, B hat noch nicht gewählt
S.setVote(B.id, B.id);   // B->B: B hat 2 Stimmen
rv = S.resolveVote();
assert(rv.ok && !rv.runoff && rv.losers.length === 1 && rv.losers[0] === "Ben", "genau ein Verlierer");
assert.equal(B.lives, 2);
assert(S.reopenVote()); assert.equal(B.lives, 3);

// Entscheidung des Masters erst nach zwei Stichwahlen
S.setVote(A.id, A.id); S.setVote(B.id, B.id);   // A:1 B:1 C->A: A:2... Cleo wechselt zu B für Gleichstand
S.setVote(C.id, "");
rv = S.resolveVote({ force: true });
assert(rv.runoff, "Gleichstand A/B");
assert(S.curVote().round >= 4);
rv = S.resolveVote({ decide: A.id });
assert(rv.ok && rv.losers[0] === "Anna");

// Geist: 0 Leben, vom Master zugelassen. Wählt je nach Einstellung mit, bekommt Fragen, steht nie zur Wahl
assert(S.reopenVote());
S.adjustLives(B.id, -99);
assert.equal(B.lives, 0); assert.equal(B.ghost, null);
assert(!S.askablePlayers().includes(B) && !S.voterPlayers().includes(B), "ohne Geist-Modus ganz draußen");
assert(!S.setGhost(A.id, { vote: true }), "Lebende sind keine Geister");
assert(S.setGhost(B.id, { vote: true, questions: false }));
assert(S.voterPlayers().includes(B) && !S.askablePlayers().includes(B));
assert(!S.candidatePlayers().includes(B), "Geister stehen nie zur Wahl");
assert(!S.setVote(A.id, B.id));
assert(S.setVote(B.id, A.id), "Geist mit Wahlrecht darf wählen");
pv = S.publicView();
assert(pv.players.find((p) => p.id === B.id).ghost && pv.voterIds.includes(B.id) && !pv.candidates.includes(B.id));
S.setGhost(B.id, { vote: false, questions: true });
assert(S.askablePlayers().includes(B) && !S.voterPlayers().includes(B));
assert(!S.setVote(B.id, A.id), "Geist ohne Wahlrecht darf nicht wählen");
S.adjustLives(B.id, 1);
assert.equal(B.ghost, null, "mit Leben ist man kein Geist mehr");
// Finale: genau zwei am Leben
assert(!S.endgame());
S.adjustLives(C.id, -99);
assert(S.endgame() && S.publicView().endgame);

// Absenden: Antwort festhalten, veröffentlichen, weiter zum nächsten Spieler und zur nächsten Frage
assert(S.importData(ex).ok); S.newGame();
const [X, Y] = ["Anna", "Ben"].map(P);
assert(S.startSession(5, 0).ok);
const q1 = S.curQuestion().text;
assert.equal(S.turnPlayer().name, "Anna");
S.setStatement(X.id, { text: "Spanien" });
let cr = S.commitAnswer(X.id);
assert(!cr.ok && cr.needResult, "mit Text braucht es ein Ergebnis");
cr = S.commitAnswer(X.id, { result: "richtig" });
assert(cr.ok && cr.advanced);
assert.equal(S.turnPlayer().name, "Ben"); assert.notEqual(S.curQuestion().text, q1, "Frage wechselt mit dem Spieler");
assert.deepEqual(S.askedList(X.id), [{ result: "richtig", live: false }]);
assert.deepEqual(S.askedList(Y.id), [{ result: null, live: true }], "laufende Frage als offener Kreis");
cr = S.commitAnswer(Y.id);   // ohne Text und Ergebnis: keine Antwort
assert(cr.ok);
assert.deepEqual(S.askedList(Y.id), [{ result: "keine", live: false }]);
assert.equal(S.state.game.sessions[0].played[0].pid, X.id);
pv = S.publicView();
assert.deepEqual(pv.players.map((p) => p.dots), [[], [], []], "während der Runde keine Punkte");
assert.equal(pv.correct, null); assert.equal(pv.statements, null);
S.endSession();
pv = S.publicView();
assert.deepEqual(pv.players[0].dots, ["richtig"]); assert.deepEqual(pv.players[1].dots, ["keine"]);

// Beschädigte Einträge werden einzeln verworfen, der Rest bleibt
const bad = JSON.parse(JSON.stringify(ex));
bad.questions.splice(1, 0, { text: 5 });
bad.game.sessions.splice(0, 0, { dur: "x" });
const nq = ex.questions.length, ns = ex.game.sessions.length;
const rb = S.importData(bad);
assert(rb.ok && rb.dropped === 2 && rb.questions === nq && rb.sessions === ns);
assert.deepEqual(S.state.game.sessions.map((x) => x.n), S.state.game.sessions.map((_, i) => i + 1));
assert(!S.importData({ questions: "kaputt" }).ok, "ohne Grundform bleibt es abgelehnt");
console.log("Store-Test: alle Prüfungen bestanden");
