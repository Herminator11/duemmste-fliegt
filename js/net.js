/* Verbindung zum Server (nur wenn die Seite über den Server geöffnet wurde).
   Master: legt einen Raum an, schickt die öffentliche Sicht und holt die geheimen Stimmen.
   Game Screen und Handys: lesen den Strom über subscribe(). */
(function () {
  "use strict";
  var KEY = "dfg_room";
  var room = readRoom();
  var es = null, pushTimer = null, listeners = [];
  var info = { status: "off", data: null, error: "" };  // off | connecting | online | reconnecting | lost

  function readRoom() {
    try {
      var r = JSON.parse(window.localStorage.getItem(KEY));
      return r && typeof r.code === "string" && typeof r.hostToken === "string" ? r : null;
    } catch (e) { return null; }
  }
  function writeRoom(r) {
    room = r;
    try { if (r) window.localStorage.setItem(KEY, JSON.stringify(r)); else window.localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ }
  }

  function available() { return location.protocol === "http:" || location.protocol === "https:"; }

  function call(method, path, body) {
    return fetch(path, {
      method: method, headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined, cache: "no-store"
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || "Serverfehler"); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  function emit(kind) { listeners.forEach(function (fn) { try { fn(kind, info); } catch (e) { /* weiter */ } }); }
  function setStatus(s, err) { if (info.status !== s || info.error !== (err || "")) { info.status = s; info.error = err || ""; emit("status"); } }

  /* Öffentlicher Strom für Game Screen und Handys. Gibt eine Funktion zum Beenden zurück. */
  function subscribe(code, token, onData, onStatus, hostToken) {
    var src = null, closed = false;
    function open() {
      if (closed) return;
      src = new EventSource("/api/rooms/" + encodeURIComponent(code) + "/events" + (token ? "?token=" + encodeURIComponent(token) : hostToken ? "?host=" + encodeURIComponent(hostToken) : ""));
      src.onopen = function () { if (onStatus) onStatus("online"); };
      src.onmessage = function (ev) {
        var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        d.receivedAt = Date.now();
        onData(d);
      };
      src.onerror = function () {
        if (onStatus) onStatus("reconnecting");
        // EventSource verbindet selbst neu, außer der Server hat die Verbindung ganz beendet (z. B. Raum geschlossen)
        if (src && src.readyState === 2) { src.close(); setTimeout(open, 3000); }
      };
    }
    open();
    return function () { closed = true; if (src) src.close(); };
  }

  var stopHost = null;
  function connect() {
    if (!room) return;
    if (stopHost) stopHost();
    setStatus("connecting");
    stopHost = subscribe(room.code, "", function (d) { info.data = d; syncAvatars(); emit("data"); }, function (s) {
      if (s === "online") { setStatus("online"); pushNow(); } else setStatus("reconnecting");
    }, room.hostToken);
  }

  function pushNow() {
    if (!room || !window.Store) return Promise.resolve();
    return call("PUT", "/api/rooms/" + room.code + "/view", { hostToken: room.hostToken, view: Store.publicView({ forServer: true }) }).catch(function (e) {
      if (e.status === 404) { lose(); }
    });
  }
  function push() {
    if (!room || pushTimer) return;
    pushTimer = setTimeout(function () { pushTimer = null; pushNow(); }, 120);
  }

  function lose() {
    if (stopHost) { stopHost(); stopHost = null; }
    writeRoom(null);
    info.data = null;
    setStatus("lost", "Der Raum existiert auf dem Server nicht mehr (Neustart oder abgelaufen). Öffne einen neuen Raum.");
  }

  function create() {
    return call("POST", "/api/rooms").then(function (r) {
      writeRoom({ code: r.code, hostToken: r.hostToken });
      connect();
      return r;
    });
  }
  /* Beim Laden: gespeicherten Raum wieder aufnehmen, falls der Server ihn noch kennt. */
  function resume() {
    if (!available() || !room) return;
    call("GET", "/api/rooms/" + room.code).then(connect).catch(function (e) { if (e.status === 404) lose(); else setStatus("reconnecting"); });
  }
  function close() {
    var r = room;
    if (!r) return Promise.resolve();
    if (stopHost) { stopHost(); stopHost = null; }
    writeRoom(null);
    info.data = null; setStatus("off");
    return call("POST", "/api/rooms/" + r.code + "/close", { hostToken: r.hostToken }).catch(function () { /* egal */ });
  }
  function fetchVotes() {
    return call("POST", "/api/rooms/" + room.code + "/votes", { hostToken: room.hostToken });
  }
  function release(playerId) {
    return call("POST", "/api/rooms/" + room.code + "/release", { hostToken: room.hostToken, playerId: playerId });
  }
  function origin() { return location.origin; }

  /* Avatar eines Spielers setzen. Online zuerst auf den Server, dann lokal, sonst würde ein älterer Stand vom Server zurückkommen. */
  function assignAvatar(pid, avatar) {
    if (!room || info.status === "lost") { return Promise.resolve(Store.setAvatar(pid, avatar) ? avatar : null); }
    var body = { hostToken: room.hostToken, avatar: avatar };
    return call("PUT", "/api/rooms/" + room.code + "/avatar/" + encodeURIComponent(pid), body).then(function (r) {
      var local = avatar && avatar.type === "draw" && r.avatar ? { type: "draw", png: avatar.png, v: r.avatar.v } : avatar;
      Store.setAvatar(pid, local);
      return local;
    });
  }

  /* Master und Server abgleichen: Fehlendes auf dem Server hochladen, Neues vom Server (Handy) lokal übernehmen. */
  var syncing = {}, failed = {};
  function syncAvatars() {
    var d = info.data;
    if (!room || !d || !window.Store) return;
    var remote = d.avatars || {};
    Store.state.players.forEach(function (p) {
      var l = p.avatar, r = remote[p.id];
      if (syncing[p.id]) return;
      if (l && !r) {
        var sig = JSON.stringify(l).slice(0, 200) + (l.png ? l.png.length : 0);
        if (failed[p.id] === sig) return;     // schon erfolglos versucht, erst bei geändertem Avatar wieder
        syncing[p.id] = true;
        assignAvatar(p.id, l).catch(function () { failed[p.id] = sig; }).then(function () { syncing[p.id] = false; });
      } else if (r) {
        var same = l && l.type === r.type && (r.type === "draw" ? l.v === r.v : JSON.stringify(l) === JSON.stringify(r));
        if (!same) Store.setAvatar(p.id, r);
      }
    });
  }

  window.Net = {
    available: available, info: info, subscribe: subscribe, call: call,
    room: function () { return room; },
    active: function () { return !!room && info.status !== "lost"; },
    assignAvatar: assignAvatar, create: create, resume: resume, close: close, push: push, pushNow: pushNow, fetchVotes: fetchVotes, release: release,
    joinUrl: function () { return room ? origin() + "/join.html?room=" + room.code : ""; },
    displayUrl: function () { return room ? origin() + "/#/anzeige?room=" + room.code : ""; },
    on: function (fn) { listeners.push(fn); },
    /* Fortschritt der Abstimmung. Stammt er noch aus einer früheren Runde (Stichwahl), gilt er nicht. */
    progress: function () {
      var p = info.data && info.data.progress;
      if (!p) return { voted: [], total: 0 };
      if (p.voteKey && window.Store && Store.voteOpen() && p.voteKey !== Store.voteKey()) return { voted: [], count: 0, total: p.total };
      return p;
    },
    claimed: function () { return info.data && info.data.claimed ? info.data.claimed : []; }
  };
})();
