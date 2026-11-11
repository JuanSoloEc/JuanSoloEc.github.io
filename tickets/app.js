/* Juan Solo · Tickets — panel de staff: emitir, enviar y validar QR. */
(function () {
  "use strict";

  var STORE = "jsTickets.v1";
  var $ = function (id) { return document.getElementById(id); };

  /* ───────── estado ───────── */
  var db = load();
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      var d = raw ? JSON.parse(raw) : null;
      if (d && d.events) return d;
    } catch (e) {}
    return { active: null, events: {} };
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(db)); }
    catch (e) { toast("No se pudo guardar en este teléfono (¿modo privado?)"); }
  }
  function ev() { return db.active ? db.events[db.active] : null; }
  function normEvent(e) {
    e.tickets = e.tickets || [];
    e.checkins = e.checkins || {};
    e.revoked = e.revoked || {};
    e.types = e.types && e.types.length ? e.types : ["General"];
    return e;
  }

  /* ───────── utilidades ───────── */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return el;
  }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function parseTypes(s) {
    var arr = String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    return arr.length ? arr.slice(0, 12) : ["General"];
  }
  function phoneDigits(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (d.length === 10 && d[0] === "0") return "593" + d.slice(1);   // 099… → 59399…
    if (d.length === 9 && d[0] === "9") return "593" + d;
    return d;
  }
  function timeStr(ts) {
    try { return new Date(ts).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function dateTimeStr(ts) {
    try { return new Date(ts).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }
  function plural(q) { return Number(q) === 1 ? "1 persona" : q + " personas"; }
  function download(name, blob) {
    var a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function copy(text, msg) {
    var done = function () { toast(msg || "Copiado"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { prompt("Copia el enlace:", text); });
    else prompt("Copia el enlace:", text);
  }

  /* ───────── arranque ───────── */
  if (!window.isSecureContext || !window.crypto || !crypto.subtle) $("insecure").hidden = false;

  function render() {
    var e = ev();
    $("setup").hidden = !!e;
    $("app").hidden = !e;
    $("eventChip").hidden = !e;
    if (!e) {
      stopCamera();
      if (!$("sDate").value) $("sDate").value = new Date().toISOString().slice(0, 10);
      return;
    }
    normEvent(e);
    $("eventChipText").textContent = [e.name, TK.prettyDate(e.date), e.place].filter(Boolean).join(" · ");
    var sel = $("iType"), cur = sel.value;
    sel.innerHTML = "";
    e.types.forEach(function (t) { sel.appendChild(h("option", { value: t, text: t })); });
    if (e.types.indexOf(cur) !== -1) sel.value = cur;
    fillEventForm();
    renderStats();
    renderList();
  }

  /* ───────── crear / editar evento ───────── */
  $("setupForm").addEventListener("submit", function (x) {
    x.preventDefault();
    var id = TK.randomId(6);
    db.events[id] = normEvent({
      id: id,
      name: $("sName").value.trim(),
      date: $("sDate").value,
      place: $("sPlace").value.trim(),
      types: parseTypes($("sTypes").value),
      key: TK.randomKey(),
      created: Date.now()
    });
    db.active = id;
    save();
    $("setupForm").reset();
    $("sTypes").value = "General, VIP";
    render();
    selectTab("emitir");
    toast("Evento creado");
  });

  function fillEventForm() {
    var e = ev();
    $("eName").value = e.name || "";
    $("eDate").value = e.date || "";
    $("ePlace").value = e.place || "";
    $("eTypes").value = e.types.join(", ");
    $("keyView").textContent = "••••••••••••••••••••••••";
    $("keyToggle").textContent = "Mostrar";
    $("linkBox").hidden = true;
    var sel = $("eventSelect");
    sel.innerHTML = "";
    Object.keys(db.events).map(function (k) { return db.events[k]; })
      .sort(function (a, b) { return (b.created || 0) - (a.created || 0); })
      .forEach(function (x) {
        sel.appendChild(h("option", { value: x.id, text: x.name + (x.date ? " · " + x.date : "") }));
      });
    sel.value = e.id;
  }

  $("eventForm").addEventListener("submit", function (x) {
    x.preventDefault();
    var e = ev();
    e.name = $("eName").value.trim() || e.name;
    e.date = $("eDate").value;
    e.place = $("ePlace").value.trim();
    e.types = parseTypes($("eTypes").value);
    save(); render(); toast("Evento actualizado");
  });

  $("keyToggle").addEventListener("click", function () {
    var shown = $("keyToggle").textContent === "Ocultar";
    $("keyView").textContent = shown ? "••••••••••••••••••••••••" : ev().key;
    $("keyToggle").textContent = shown ? "Mostrar" : "Ocultar";
  });

  $("eventSelect").addEventListener("change", function () {
    db.active = $("eventSelect").value; save();
    $("issued").hidden = true; scanLog = [];
    renderScanLog(); render();
    toast("Evento activo: " + ev().name);
  });
  $("newEvent").addEventListener("click", function () {
    db.active = null; save(); render();
    window.scrollTo(0, 0);
  });
  $("deleteEvent").addEventListener("click", function () {
    var e = ev();
    if (!confirm("¿Eliminar \"" + e.name + "\" de este teléfono? Se pierde su lista de tickets e ingresos. Descarga un respaldo antes si lo necesitas.")) return;
    delete db.events[e.id];
    var rest = Object.keys(db.events);
    db.active = rest.length ? rest[0] : null;
    save(); render();
  });

  /* — vincular dispositivos — */
  function linkUrl() {
    var e = ev();
    var payload = TK.encodeJSON({ v: 1, id: e.id, name: e.name, date: e.date, place: e.place, types: e.types, key: e.key });
    return TK.BASE + "#acceso=" + accessSecret + "&link=" + payload;
  }
  $("showLink").addEventListener("click", function () {
    var url = linkUrl();
    var box = $("linkQr");
    box.innerHTML = "";
    box.appendChild(TK.qrCanvas(url, 440, { plain: true }));
    $("waLink").href = "https://wa.me/?text=" + encodeURIComponent("Acceso staff para validar tickets de " + ev().name + ":\n" + url);
    $("linkBox").hidden = false;
  });
  $("copyLink").addEventListener("click", function () { copy(linkUrl(), "Enlace de vinculación copiado"); });

  function importLinkFromHash() {
    var m = /[#&]link=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    var data;
    try { data = TK.decodeJSON(m[1]); } catch (e) { data = null; }
    if (!data || !data.id || !data.key) { setTimeout(function () { toast("Enlace de vinculación inválido"); }, 300); return; }
    var existing = db.events[data.id];
    if (!existing && !confirm("¿Vincular este teléfono al evento \"" + data.name + "\" para validar tickets?")) return;
    if (existing) {
      existing.name = data.name; existing.date = data.date; existing.place = data.place;
      existing.types = data.types; existing.key = data.key;
    } else {
      db.events[data.id] = normEvent({ id: data.id, name: data.name, date: data.date, place: data.place, types: data.types, key: data.key, created: Date.now(), linked: true });
    }
    db.active = data.id;
    save();
    setTimeout(function () { selectTab("escanear"); toast("Teléfono vinculado a " + data.name); }, 50);
  }

  /* ───────── pestañas ───────── */
  var currentTab = "emitir";
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { selectTab(b.getAttribute("data-tab")); });
  });
  function selectTab(name) {
    currentTab = name;
    document.querySelectorAll(".tab").forEach(function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
    if (name !== "escanear") stopCamera();
    if (name === "lista") renderList();
    if (name === "escanear") renderStats();
  }

  /* ───────── emitir ───────── */
  $("issueForm").addEventListener("submit", async function (x) {
    x.preventDefault();
    var e = ev();
    var name = $("iName").value.trim();
    if (!name) return;
    var qty = Math.max(1, Math.min(20, parseInt($("iQty").value, 10) || 1));
    var used = {};
    e.tickets.forEach(function (t) { used[t.id] = 1; });
    var id; do { id = TK.randomId(8); } while (used[id]);
    var ticket = { v: 1, e: e.id, i: id, n: name, t: $("iType").value || e.types[0], q: qty, ev: e.name, d: e.date || "", l: e.place || "" };
    var token;
    try { token = await TK.sign(ticket, e.key); }
    catch (err) { toast("No se pudo firmar el ticket (requiere https)"); return; }
    var rec = { id: id, name: name, phone: $("iPhone").value.trim(), type: ticket.t, qty: qty, token: token, created: Date.now() };
    e.tickets.unshift(rec);
    save();
    renderTicketCard($("issued"), rec, true);
    $("issued").hidden = false;
    $("iName").value = ""; $("iPhone").value = ""; $("iQty").value = "1";
    $("issued").scrollIntoView({ behavior: "smooth", block: "start" });
    renderStats();
  });

  function messageFor(rec) {
    var t = TK.peek(rec.token) || {};
    var lines = [
      "Hola " + rec.name.split(" ")[0] + " 👋",
      "Aquí está tu entrada para *" + (t.ev || ev().name) + "*" + (t.d ? " — " + TK.prettyDate(t.d) : "") + (t.l ? ", " + t.l : "") + ".",
      (t.t || rec.type) + " · Admite " + plural(t.q || rec.qty),
      "",
      "Abre tu ticket y muestra el QR en la puerta:",
      TK.ticketUrl(rec.token),
      "",
      "Es de uso único, no lo compartas. 🔊 Juan Solo"
    ];
    return lines.join("\n");
  }

  function renderTicketCard(container, rec, fresh) {
    container.innerHTML = "";
    var url = TK.ticketUrl(rec.token);
    var qrWrap = h("div", { class: "qr" }, [TK.qrCanvas(url, 504)]);
    TK.fontsReady().then(function () { qrWrap.replaceChildren(TK.qrCanvas(url, 504)); });
    var st = statusOf(rec.id);
    container.appendChild(h("div", { class: "row", style: "justify-content: space-between" }, [
      h("h2", { text: fresh ? "Ticket listo ✓" : "Ticket" }),
      h("span", { class: "badge " + st.cls, text: st.label })
    ]));
    container.appendChild(h("div", { class: "ticket" }, [
      qrWrap,
      h("div", null, [
        h("div", { class: "who", text: rec.name }),
        h("div", { class: "meta", text: rec.type + " · Admite " + plural(rec.qty) }),
        rec.phone ? h("div", { class: "muted", text: "WhatsApp " + rec.phone }) : null,
        h("div", { class: "code", text: "CÓDIGO " + rec.id })
      ])
    ]));
    var wa = "https://wa.me/" + phoneDigits(rec.phone) + "?text=" + encodeURIComponent(messageFor(rec));
    if (!rec.phone) wa = "https://wa.me/?text=" + encodeURIComponent(messageFor(rec));
    container.appendChild(h("div", { class: "grid2" }, [
      h("a", { class: "btn btn-wa", href: wa, target: "_blank", rel: "noopener", onclick: function () { markSent(rec); } }, [
        svgIcon("M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3L3 21z"), rec.phone ? "Enviar por WhatsApp" : "Elegir chat de WhatsApp"
      ]),
      h("button", { class: "btn btn-primary", type: "button", onclick: function () { shareImage(rec); } }, [
        svgIcon("M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"), "Compartir imagen QR"
      ]),
      h("button", { class: "btn", type: "button", onclick: function () { downloadImage(rec); } }, [
        svgIcon("M12 3v12M7 10l5 5 5-5M4 21h16"), "Descargar PNG"
      ]),
      h("button", { class: "btn", type: "button", onclick: function () { copy(url, "Enlace del ticket copiado"); markSent(rec); } }, [
        svgIcon("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"), "Copiar enlace"
      ])
    ]));
  }
  function svgIcon(d) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.appendChild(p);
    return s;
  }
  function markSent(rec) {
    if (!rec.sent) { rec.sent = Date.now(); save(); }
  }
  async function ticketBlob(rec) {
    var cv = await TK.ticketImage(TK.peek(rec.token), rec.token);
    return TK.canvasBlob(cv);
  }
  function fileName(rec) { return "ticket-" + TK.slug(ev().name) + "-" + TK.slug(rec.name) + ".png"; }
  async function shareImage(rec) {
    var blob = await ticketBlob(rec);
    var file = new File([blob], fileName(rec), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Ticket " + ev().name, text: messageFor(rec) });
        markSent(rec);
      } catch (e) { /* cancelado */ }
    } else {
      download(fileName(rec), blob);
      toast("Imagen descargada. Adjúntala en WhatsApp.");
      markSent(rec);
    }
  }
  async function downloadImage(rec) {
    download(fileName(rec), await ticketBlob(rec));
  }

  /* ───────── estado de cada ticket ───────── */
  function statusOf(id) {
    var e = ev();
    if (e.revoked[id]) return { cls: "void", label: "ANULADO", key: "void" };
    if (e.checkins[id]) return { cls: "in", label: "INGRESÓ " + timeStr(e.checkins[id].at), key: "in" };
    return { cls: "pend", label: "PENDIENTE", key: "pend" };
  }
  function allRows() {
    var e = ev();
    var known = {};
    var rows = e.tickets.map(function (t) { known[t.id] = 1; return t; });
    // Tickets validados en esta puerta que se emitieron en otro teléfono.
    Object.keys(e.checkins).forEach(function (id) {
      if (known[id]) return;
      var c = e.checkins[id];
      rows.push({ id: id, name: c.name || "—", type: c.type || "", qty: c.qty || 1, phone: "", token: c.token || "", created: c.at, external: true });
    });
    return rows;
  }
  function renderStats() {
    var e = ev(); if (!e) return;
    var ins = 0, people = 0;
    Object.keys(e.checkins).forEach(function (id) { ins++; people += Number(e.checkins[id].qty) || 1; });
    var issued = e.tickets.filter(function (t) { return !e.revoked[t.id]; }).length;
    $("stIn").textContent = $("lsIn").textContent = ins;
    $("stPeople").textContent = $("lsPeople").textContent = people;
    $("stIssued").textContent = $("lsIssued").textContent = issued;
  }

  /* ───────── lista ───────── */
  var filter = "all";
  $("filter").addEventListener("click", function (x) {
    var b = x.target.closest("[data-f]"); if (!b) return;
    filter = b.getAttribute("data-f");
    $("filter").querySelectorAll("[data-f]").forEach(function (o) {
      o.setAttribute("aria-pressed", o === b ? "true" : "false");
      o.classList.toggle("btn-primary", o === b);
    });
    renderList();
  });
  $("filter").querySelector("[data-f=all]").classList.add("btn-primary");
  $("search").addEventListener("input", function () { renderList(); });

  function renderList() {
    var e = ev(); if (!e) return;
    renderStats();
    var q = $("search").value.trim().toLowerCase();
    var rows = allRows().filter(function (r) {
      var st = statusOf(r.id).key;
      if (filter === "pend" && st !== "pend") return false;
      if (filter === "in" && st !== "in") return false;
      if (!q) return true;
      return (r.name + " " + r.id + " " + (r.phone || "") + " " + r.type).toLowerCase().indexOf(q) !== -1;
    });
    var list = $("list");
    list.innerHTML = "";
    if (!rows.length) {
      list.appendChild(h("div", { class: "empty", text: allRows().length ? "Nada coincide con la búsqueda." : "Todavía no hay tickets. Emite el primero en la pestaña Emitir." }));
      return;
    }
    rows.slice(0, 400).forEach(function (r) {
      var st = statusOf(r.id);
      var acts = [];
      if (r.token && !r.external) acts.push(h("button", { class: "btn btn-sm", type: "button", onclick: function () { openTicket(r); } }, ["Ver / reenviar"]));
      if (st.key === "pend") acts.push(h("button", { class: "btn btn-sm", type: "button", onclick: function () { checkIn(r); renderList(); toast(r.name + " marcado como ingresado"); } }, ["Marcar ingreso"]));
      if (st.key === "in") acts.push(h("button", { class: "btn btn-sm", type: "button", onclick: function () { undoCheckIn(r.id); renderList(); } }, ["Deshacer ingreso"]));
      if (st.key !== "void" && !r.external) acts.push(h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: function () {
        if (!confirm("¿Anular el ticket de " + r.name + "? Ya no podrá entrar (en este teléfono y en los que importen tu respaldo).")) return;
        e.revoked[r.id] = Date.now(); save(); renderList();
      } }, ["Anular"]));
      if (st.key === "void") acts.push(h("button", { class: "btn btn-sm", type: "button", onclick: function () { delete e.revoked[r.id]; save(); renderList(); } }, ["Reactivar"]));
      list.appendChild(h("div", { class: "item" }, [
        h("div", null, [
          h("div", { class: "n", text: r.name }),
          h("div", { class: "s", text: [r.type, plural(r.qty), r.id, r.external ? "emitido en otro teléfono" : (r.sent ? "enviado" : "sin enviar")].filter(Boolean).join(" · ") })
        ]),
        h("span", { class: "badge " + st.cls, text: st.label }),
        h("div", { class: "acts" }, acts)
      ]));
    });
  }

  function openTicket(rec) {
    var box = $("modalBox");
    renderTicketCard(box, rec, false);
    box.appendChild(h("button", { class: "btn btn-block", type: "button", onclick: closeModal }, ["Cerrar"]));
    $("modal").hidden = false;
  }
  function closeModal() { $("modal").hidden = true; renderList(); }
  $("modal").addEventListener("click", function (x) { if (x.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", function (x) { if (x.key === "Escape" && !$("modal").hidden) closeModal(); });

  function checkIn(r, token) {
    var e = ev();
    e.checkins[r.id] = { at: Date.now(), name: r.name, type: r.type, qty: r.qty, token: token || r.token || "" };
    save(); renderStats();
  }
  function undoCheckIn(id) {
    delete ev().checkins[id]; save(); renderStats();
  }

  /* — exportar / importar — */
  $("exportCsv").addEventListener("click", function () {
    var e = ev();
    var esc = function (v) { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [["codigo", "nombre", "whatsapp", "tipo", "personas", "emitido", "estado", "hora_ingreso", "enlace"].join(",")];
    allRows().forEach(function (r) {
      var c = e.checkins[r.id];
      lines.push([r.id, r.name, r.phone, r.type, r.qty, r.external ? "" : dateTimeStr(r.created),
        e.revoked[r.id] ? "anulado" : c ? "ingreso" : "pendiente", c ? dateTimeStr(c.at) : "",
        r.token ? TK.ticketUrl(r.token) : ""].map(esc).join(","));
    });
    download("tickets-" + TK.slug(e.name) + ".csv", new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  });
  $("exportJson").addEventListener("click", function () {
    var e = ev();
    var data = { app: "juansolo-tickets", v: 1, exported: Date.now(), event: e };
    download("respaldo-" + TK.slug(e.name) + ".json", new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    toast("Respaldo descargado. Contiene la clave: guárdalo en privado.");
  });
  $("importJson").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt);
      var inc = data && data.event;
      if (!inc || !inc.id || !inc.key) throw new Error("bad");
      normEvent(inc);
      var cur = db.events[inc.id];
      if (!cur) {
        db.events[inc.id] = inc;
      } else {
        normEvent(cur);
        var have = {};
        cur.tickets.forEach(function (t) { have[t.id] = 1; });
        inc.tickets.forEach(function (t) { if (!have[t.id]) cur.tickets.push(t); });
        cur.tickets.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
        Object.keys(inc.checkins).forEach(function (id) {
          var a = cur.checkins[id], b = inc.checkins[id];
          if (!a || (b.at && b.at < a.at)) cur.checkins[id] = b;
        });
        Object.keys(inc.revoked).forEach(function (id) { cur.revoked[id] = cur.revoked[id] || inc.revoked[id]; });
      }
      db.active = inc.id;
      save(); render(); selectTab("lista");
      toast("Respaldo importado y combinado");
    }).catch(function () { toast("Ese archivo no es un respaldo de tickets válido"); });
  });

  /* ───────── escáner ───────── */
  var video = $("video");
  var stream = null, scanning = false, paused = false, facing = "environment";
  var detector = null;
  var work = document.createElement("canvas");
  var wctx = work.getContext("2d", { willReadFrequently: true });
  var lastToken = "", lastAt = 0, resumeTimer = null;
  var scanLog = [];
  var audio = null;

  if ("BarcodeDetector" in window) {
    try {
      BarcodeDetector.getSupportedFormats().then(function (f) {
        if (f.indexOf("qr_code") !== -1) detector = new BarcodeDetector({ formats: ["qr_code"] });
      }).catch(function () {});
    } catch (e) {}
  }

  $("camStart").addEventListener("click", startCamera);
  $("camStop").addEventListener("click", stopCamera);
  $("camSwitch").addEventListener("click", function () {
    facing = facing === "environment" ? "user" : "environment";
    stopCamera(); startCamera();
  });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopCamera(); });

  async function startCamera() {
    unlockAudio();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $("idleText").textContent = "Este navegador no permite usar la cámara. Usa \"Validar desde imagen\".";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
    } catch (err) {
      $("idleText").textContent = err && err.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Actívalo en los ajustes del navegador para este sitio."
        : "No se pudo abrir la cámara.";
      return;
    }
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    scanning = true; paused = false;
    $("idle").hidden = true; $("frame").hidden = false; $("laser").hidden = false;
    $("camStop").hidden = false;
    navigator.mediaDevices.enumerateDevices().then(function (d) {
      $("camSwitch").hidden = d.filter(function (x) { return x.kind === "videoinput"; }).length < 2;
    }).catch(function () {});
    loop();
  }
  function stopCamera() {
    scanning = false;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    video.srcObject = null;
    $("idle").hidden = false; $("frame").hidden = true; $("laser").hidden = true;
    $("camStop").hidden = true; $("camSwitch").hidden = true;
    $("idleText").textContent = "Apunta la cámara al QR del ticket.";
  }

  var busy = false;
  function loop() {
    if (!scanning) return;
    setTimeout(function () { requestAnimationFrame(loop); }, 110);
    if (paused || busy || video.readyState < 2) return;
    busy = true;
    detectFrame().then(function (text) {
      busy = false;
      if (text && scanning && !paused) onCode(text);
    }, function () { busy = false; });
  }
  async function detectFrame() {
    if (detector) {
      try {
        var codes = await detector.detect(video);
        return codes && codes.length ? codes[0].rawValue : null;
      } catch (e) { detector = null; }
    }
    var vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    var scale = Math.min(1, 720 / Math.max(vw, vh));
    work.width = Math.round(vw * scale); work.height = Math.round(vh * scale);
    wctx.drawImage(video, 0, 0, work.width, work.height);
    var img = wctx.getImageData(0, 0, work.width, work.height);
    var code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    return code ? code.data : null;
  }

  function onCode(text) {
    var now = Date.now();
    if (text === lastToken && now - lastAt < 5000) return;
    lastToken = text; lastAt = now;
    validate(text);
  }

  $("scanFile").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = "";
    if (!f) return;
    unlockAudio();
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      work.width = Math.round(img.width * scale); work.height = Math.round(img.height * scale);
      wctx.drawImage(img, 0, 0, work.width, work.height);
      var d = wctx.getImageData(0, 0, work.width, work.height);
      var code = jsQR(d.data, d.width, d.height, { inversionAttempts: "attemptBoth" });
      URL.revokeObjectURL(img.src);
      if (code) validate(code.data);
      else showResult("bad", "SIN QR", "", "No se encontró un código QR en la imagen.");
    };
    img.onerror = function () { toast("No se pudo leer la imagen"); };
    img.src = URL.createObjectURL(f);
  });

  async function validate(text) {
    var e = ev();
    if (/#link=/.test(text)) { showResult("bad", "QR DE STAFF", "", "Este es un QR de vinculación, no un ticket."); return; }
    var token = TK.extractToken(text);
    if (!token) { showResult("bad", "NO VÁLIDO", "", "Este QR no es un ticket de Juan Solo."); log("bad", "QR desconocido"); return; }
    var res;
    try { res = await TK.verify(token, e.key); } catch (err) { showResult("bad", "ERROR", "", "No se pudo verificar (¿https?)."); return; }
    var t = res.ticket || {};
    if (!res.ok) {
      if (t.e && t.e !== e.id) {
        showResult("bad", "OTRO EVENTO", t.n || "", "Este ticket es para " + (t.ev || "otro evento") + ".");
        log("bad", (t.n || "?") + " · otro evento");
      } else {
        showResult("bad", "TICKET FALSO", t.n || "", "La firma no coincide. No dejar pasar.");
        log("bad", (t.n || "?") + " · firma inválida");
      }
      return;
    }
    if (t.e !== e.id) {
      showResult("bad", "OTRO EVENTO", t.n, "Este ticket es para " + (t.ev || "otro evento") + ".");
      log("bad", t.n + " · otro evento"); return;
    }
    if (e.revoked[t.i]) {
      showResult("bad", "ANULADO", t.n, "Este ticket fue anulado.");
      log("bad", t.n + " · anulado"); return;
    }
    var prev = e.checkins[t.i];
    if (prev) {
      showResult("used", "YA INGRESÓ", t.n, "Entró a las " + timeStr(prev.at) + " · " + t.t + " · " + plural(t.q));
      log("used", t.n + " · repetido");
      return;
    }
    checkIn({ id: t.i, name: t.n, type: t.t, qty: t.q }, token);
    showResult("ok", "ADELANTE", t.n, t.t + " · Admite " + plural(t.q), t.i);
    log("ok", t.n + " · " + t.t + " · " + plural(t.q));
  }

  var ICONS = {
    ok: "M20 6 9 17l-5-5",
    used: "M12 8v5M12 16.5v.5M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
    bad: "M18 6 6 18M6 6l12 12"
  };
  function showResult(kind, big, name, info, undoId) {
    paused = true;
    beep(kind);
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 80 : [120, 60, 120, 60, 120]);
    var r = $("result");
    r.className = "result " + kind;
    r.innerHTML = "";
    var ic = svgIcon(ICONS[kind]); ic.setAttribute("stroke-width", "2.4");
    r.appendChild(h("div", { class: "icon" }, [ic]));
    r.appendChild(h("div", { class: "big", text: big }));
    if (name) r.appendChild(h("div", { class: "name", text: name }));
    if (info) r.appendChild(h("div", { class: "info", text: info }));
    if (undoId) r.appendChild(h("button", { class: "btn btn-sm", type: "button", style: "margin-top: 8px; color: #fff; border-color: rgba(255,255,255,.5)", onclick: function (x) {
      x.stopPropagation(); undoCheckIn(undoId); log("used", (name || "") + " · ingreso deshecho"); dismissResult();
    } }, ["Deshacer ingreso"]));
    r.appendChild(h("div", { class: "hint", text: "TOCA PARA ESCANEAR EL SIGUIENTE" }));
    r.hidden = false;
    clearTimeout(resumeTimer);
    if (kind === "ok") resumeTimer = setTimeout(dismissResult, 3500);
  }
  function dismissResult() {
    clearTimeout(resumeTimer);
    $("result").hidden = true;
    paused = false;
    lastAt = Date.now();
  }
  $("result").addEventListener("click", dismissResult);

  function log(kind, text) {
    scanLog.unshift({ kind: kind, text: text, at: Date.now() });
    scanLog = scanLog.slice(0, 8);
    renderScanLog();
  }
  function renderScanLog() {
    var box = $("scanLog");
    box.innerHTML = "";
    if (!scanLog.length) { box.appendChild(h("div", { class: "empty", text: "Aún no hay escaneos en esta sesión." })); return; }
    var map = { ok: ["in", "OK"], used: ["pend", "REPETIDO"], bad: ["void", "RECHAZADO"] };
    scanLog.forEach(function (s) {
      box.appendChild(h("div", { class: "item" }, [
        h("div", null, [h("div", { class: "n", text: s.text }), h("div", { class: "s", text: timeStr(s.at) })]),
        h("span", { class: "badge " + map[s.kind][0], text: map[s.kind][1] })
      ]));
    });
  }

  function unlockAudio() {
    if (audio) return;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
  }
  function beep(kind) {
    if (!audio) return;
    try {
      if (audio.state === "suspended") audio.resume();
      var seq = kind === "ok" ? [[880, 0, .09], [1320, .1, .14]] : kind === "used" ? [[520, 0, .14], [520, .2, .14]] : [[220, 0, .35]];
      seq.forEach(function (s) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === "bad" ? "square" : "sine";
        o.frequency.value = s[0];
        var t0 = audio.currentTime + s[1];
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + s[2]);
        o.connect(g); g.connect(audio.destination);
        o.start(t0); o.stop(t0 + s[2] + 0.02);
      });
    } catch (e) {}
  }

  /* ───────── acceso privado ─────────
     La página sólo se abre con el enlace secreto (#acceso=…). Aquí sólo está
     su huella SHA-256: el secreto no aparece en el código ni en el repositorio.
     Quien entra sin él ve un "404". */
  var ACCESS_HASH = "0915657c786e2439aae5a248f8d13ef2e268924b4444b993d497bceee596e577";
  var ACCESS_STORE = "jsTickets.access";
  var accessSecret = "";

  async function sha256hex(s) {
    var d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
    return Array.prototype.map.call(d, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  async function isValid(secret) {
    if (!secret || !window.crypto || !crypto.subtle) return false;
    try { return (await sha256hex(secret)) === ACCESS_HASH; } catch (e) { return false; }
  }
  function secretFrom(text) {
    var m = /[#&?]acceso=([A-Za-z0-9_-]+)/.exec(String(text || ""));
    return m ? m[1] : "";
  }
  function unlock(secret) {
    accessSecret = secret;
    try { localStorage.setItem(ACCESS_STORE, secret); } catch (e) {}
    importLinkFromHash();
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    document.title = "Tickets · Juan Solo";
    var mf = document.createElement("link");
    mf.rel = "manifest"; mf.href = "manifest.webmanifest";
    document.head.appendChild(mf);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
    $("locked").hidden = true;
    $("main").hidden = false;
    render();
    if (ev() && ev().linked) selectTab("escanear");
  }
  function lockOut() {
    db = { active: null, events: {} };
    $("main").hidden = true;
    $("locked").hidden = false;
    // Dentro de la app instalada (icono) se puede pegar el enlace una vez.
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
    $("unlockForm").hidden = !standalone;
  }
  $("unlockForm").addEventListener("submit", async function (x) {
    x.preventDefault();
    var s = secretFrom($("unlockInput").value) || $("unlockInput").value.trim();
    if (await isValid(s)) unlock(s);
    else $("unlockInput").value = "";
  });

  /* ───────── inicio ───────── */
  (async function () {
    var fromUrl = secretFrom(location.hash);
    var saved = "";
    try { saved = localStorage.getItem(ACCESS_STORE) || ""; } catch (e) {}
    if (await isValid(fromUrl)) return unlock(fromUrl);
    if (await isValid(saved)) return unlock(saved);
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    lockOut();
  })();
})();
