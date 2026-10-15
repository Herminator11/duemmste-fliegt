/* Seite „Fragen“: alle Fragen ansehen, suchen, hinzufügen, bearbeiten, löschen */
(function () {
  "use strict";
  var h = U.h, $ = U.$;
  var root = null;
  var search = "", editId = null, delId = null, panel = null, notice = null;

  function render(r) {
    if (r) root = r;
    if (!root) return;
    root.textContent = "";
    App.applyColor();
    var st = Store.state;
    var page = h("div", { cls: "page" });
    page.appendChild(h("h1", { text: "Fragen" }));
    page.appendChild(h("p", { cls: "lead", id: "q-count", text: st.questions.length + " Fragen in fester Reihenfolge. Neue Fragen kommen ans Ende." }));

    page.appendChild(h("div", { cls: "bar" }, [
      h("input", { type: "search", id: "q-search", placeholder: "Fragen oder Antworten durchsuchen", "aria-label": "Fragen durchsuchen", value: search,
        on: { input: function (e) { search = e.target.value; renderList(); } } }),
      h("button", { cls: "btn", id: "btn-new-q", type: "button", text: "+ Neue Frage",
        on: { click: function () { panel = panel === "single" ? null : "single"; notice = null; renderPanel(); } } }),
      h("button", { cls: "btn", id: "btn-bulk-q", type: "button", text: "Mehrere einfügen",
        on: { click: function () { panel = panel === "bulk" ? null : "bulk"; notice = null; renderPanel(); } } })
    ]));
    page.appendChild(h("div", { id: "q-panel" }));
    page.appendChild(h("p", { id: "q-notice", role: "status" }));
    page.appendChild(h("p", { cls: "hint", id: "q-hits" }));
    page.appendChild(h("div", { cls: "qlist", id: "q-list" }));
    root.appendChild(page);
    renderPanel();
    renderNotice();
    renderList();
  }

  function renderNotice() {
    var n = $("q-notice");
    if (!n) return;
    n.textContent = notice ? notice.text : "";
    n.className = notice ? (notice.err ? "err" : "ok") : "";
  }

  /* ---------- Eingabefelder für neue Fragen ---------- */
  function renderPanel() {
    var box = $("q-panel");
    if (!box) return;
    box.textContent = "";
    if (!panel) return;
    if (panel === "single") {
      var q = h("input", { type: "text", id: "new-q", autocomplete: "off" });
      var a = h("input", { type: "text", id: "new-a", autocomplete: "off" });
      var err = h("p", { cls: "err", id: "new-err", role: "alert", hidden: true, text: "Bitte Frage und Antwort ausfüllen." });
      box.appendChild(h("form", { cls: "panel", id: "form-single", on: { submit: function (e) {
        e.preventDefault();
        var made = Store.addQuestion(q.value, a.value);
        if (!made) { err.hidden = false; return; }
        notice = { text: "Frage hinzugefügt als Nr. " + Store.state.questions.length + ".", err: false };
        q.value = ""; a.value = ""; err.hidden = true;
        renderNotice(); renderList(); q.focus();
      } } }, [
        h("label", {}, ["Frage", q]),
        h("label", {}, ["Antwort (mehrere mit Komma trennen)", a]),
        err,
        h("div", { cls: "actions" }, [
          h("button", { cls: "btn btn-main", id: "new-save", type: "submit", text: "Frage speichern" }),
          h("button", { cls: "btn", type: "button", text: "Schließen", on: { click: function () { panel = null; renderPanel(); } } })
        ])
      ]));
      q.focus();
    } else {
      var ta = h("textarea", { id: "bulk-text", "aria-label": "Fragen im Textformat", spellcheck: "false",
        placeholder: "Nenne irgendeinen bekannten Music Streaming Dienst.\nA: Spotify, Amazon Music, Deezer\n\nWie viel ist ein Dutzend?\nA: 12" });
      var res = h("p", { id: "bulk-result", role: "status" });
      box.appendChild(h("div", { cls: "panel", id: "form-bulk" }, [
        h("p", { cls: "hint", text: "Eine Frage pro Absatz: die Frage, darunter eine Zeile mit „A: Antwort“. Absätze trennst du mit einer Leerzeile." }),
        ta, res,
        h("div", { cls: "actions", style: "margin-top:12px" }, [
          h("button", { cls: "btn btn-main", id: "bulk-save", type: "button", text: "Fragen hinzufügen", on: { click: function () {
            var p = Store.parseBulk(ta.value);
            if (p.results.length) { Store.addMany(p.results); ta.value = ""; renderList(); }
            res.className = p.errors.length ? "err" : "ok";
            res.textContent = p.results.length + " Frage(n) hinzugefügt." + (p.errors.length ? " " + p.errors.length + " Absatz/Absätze nicht erkannt. Prüfe das Format „Frage“ + „A: Antwort“." : "");
          } } }),
          h("button", { cls: "btn", type: "button", text: "Schließen", on: { click: function () { panel = null; renderPanel(); } } })
        ])
      ]));
      ta.focus();
    }
  }

  /* ---------- Liste ---------- */
  function playedMap() {
    var map = {};
    Store.state.game.sessions.forEach(function (s) {
      s.played.forEach(function (p) { if (p.qid) map[p.qid] = s; });
    });
    return map;
  }

  function renderList() {
    var list = $("q-list");
    if (!list) return;
    list.textContent = "";
    var st = Store.state, term = search.trim().toLowerCase();
    var map = playedMap(), active = Store.isActive(), shown = 0;
    st.questions.forEach(function (q, i) {
      if (term && q.text.toLowerCase().indexOf(term) < 0 && q.answer.toLowerCase().indexOf(term) < 0) return;
      shown += 1;
      list.appendChild(row(q, i, map[q.id], active));
    });
    var hits = $("q-hits");
    hits.textContent = term ? shown + " von " + st.questions.length + " Fragen passen zur Suche." : "";
    $("q-count").textContent = st.questions.length + " Fragen in fester Reihenfolge. Neue Fragen kommen ans Ende.";
    if (!shown) list.appendChild(h("p", { cls: "empty", id: "q-empty", style: "padding:16px 0", text: term ? "Keine Frage passt zur Suche." : "Noch keine Fragen vorhanden." }));
  }

  function row(q, i, sess, active) {
    var st = Store.state;
    var isNext = i === st.game.pos && i < st.questions.length;
    var cls = "qrow" + (sess ? " played" : "") + (isNext ? " up" : "");
    var r = h("div", { cls: cls, "data-id": q.id });
    if (sess) r.style.setProperty("--sc", sess.color);
    r.appendChild(h("div", { cls: "qnum", text: String(i + 1) }));

    if (editId === q.id) {
      var qi = h("input", { type: "text", value: q.text, "aria-label": "Frage" });
      var ai = h("input", { type: "text", value: q.answer, "aria-label": "Antwort" });
      var err = h("p", { cls: "err", hidden: true, text: "Frage und Antwort dürfen nicht leer sein." });
      r.appendChild(h("div", { cls: "qedit" }, [qi, ai, err,
        h("div", { cls: "actions" }, [
          h("button", { cls: "btn btn-main btn-sm", type: "button", text: "Speichern", "data-act": "save",
            on: { click: function () {
              if (!Store.updateQuestion(q.id, qi.value, ai.value)) { err.hidden = false; return; }
              editId = null; notice = { text: "Änderung gespeichert.", err: false }; renderNotice(); renderList();
            } } }),
          h("button", { cls: "btn btn-sm", type: "button", text: "Abbrechen", "data-act": "cancel",
            on: { click: function () { editId = null; renderList(); } } })
        ])]));
      return r;
    }

    var tags = [];
    if (isNext) tags.push(h("span", { cls: "qtag", text: active ? "aktuell" : "als Nächstes" }));
    if (sess) tags.push(h("span", { cls: "qtag sess", text: "Session " + sess.n }));
    r.appendChild(h("div", {}, [
      h("div", { cls: "qtext" }, [q.text].concat(tags)),
      h("div", { cls: "qans", text: q.answer })
    ]));

    var act = h("div", { cls: "qact" });
    if (delId === q.id) {
      act.appendChild(h("span", { text: "Wirklich löschen?" }));
      act.appendChild(h("button", { cls: "btn btn-danger btn-sm", type: "button", text: "Ja, löschen", "data-act": "del-yes",
        on: { click: function () {
          Store.deleteQuestion(q.id); delId = null; notice = { text: "Frage gelöscht.", err: false }; renderNotice(); renderList();
        } } }));
      act.appendChild(h("button", { cls: "btn btn-sm", type: "button", text: "Abbrechen", "data-act": "del-no",
        on: { click: function () { delId = null; renderList(); } } }));
    } else {
      act.appendChild(h("button", { cls: "btn btn-sm btn-text", type: "button", text: "Bearbeiten", "data-act": "edit",
        on: { click: function () { editId = q.id; delId = null; renderList(); } } }));
      act.appendChild(h("button", { cls: "btn btn-sm btn-text", type: "button", text: "Löschen", "data-act": "del",
        on: { click: function () { delId = q.id; editId = null; renderList(); } } }));
      if (!isNext) {
        act.appendChild(h("button", { cls: "btn btn-sm btn-text", type: "button", text: "Hier weiterspielen", "data-act": "pos", disabled: active,
          title: active ? "Während einer Session nicht möglich" : null,
          on: { click: function () {
            if (Store.setPos(i)) { notice = { text: "Das Spiel macht bei Nr. " + (i + 1) + " weiter.", err: false }; renderNotice(); renderList(); }
          } } }));
      }
    }
    r.appendChild(act);
    return r;
  }

  Views.fragen = { render: render, refresh: function () { if (!editId) renderList(); },
    reset: function () { editId = null; delId = null; notice = null; } };
})();
