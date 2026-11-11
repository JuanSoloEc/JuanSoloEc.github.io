/* Juan Solo · Tickets — núcleo compartido.
   Cada ticket es un token firmado: base64url(JSON) + "." + firma HMAC-SHA256.
   La firma usa la "clave del evento", que sólo vive en los dispositivos del
   staff (localStorage). Sin esa clave nadie puede fabricar un ticket válido. */
(function () {
  "use strict";

  var enc = new TextEncoder();
  var dec = new TextDecoder();
  var BASE = new URL(".", document.currentScript ? document.currentScript.src : location.href).href;

  function b64u(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(str) {
    var s = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function encodeJSON(obj) { return b64u(enc.encode(JSON.stringify(obj))); }
  function decodeJSON(str) { return JSON.parse(dec.decode(unb64u(str))); }

  async function hmac(key, data) {
    var k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    var sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
    return b64u(sig.slice(0, 12));
  }

  function randomId(len, alphabet) {
    alphabet = alphabet || "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var bytes = crypto.getRandomValues(new Uint8Array(len));
    var out = "";
    for (var i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  function randomKey() {
    return b64u(crypto.getRandomValues(new Uint8Array(18)));
  }

  /* ticket = { v, e (id evento), i (id ticket), n (nombre), t (tipo), q (personas),
                ev (nombre evento), d (fecha), l (lugar) } */
  async function sign(ticket, key) {
    var payload = encodeJSON(ticket);
    return payload + "." + (await hmac(key, payload));
  }

  /* Lee un token sin verificar la firma (para mostrarlo al asistente). */
  function peek(token) {
    try {
      var parts = String(token).split(".");
      if (parts.length !== 2) return null;
      var t = decodeJSON(parts[0]);
      return t && t.i ? t : null;
    } catch (e) { return null; }
  }

  async function verify(token, key) {
    var parts = String(token).split(".");
    if (parts.length !== 2) return { ok: false, reason: "format" };
    var ticket = peek(token);
    if (!ticket) return { ok: false, reason: "format" };
    var expected = await hmac(key, parts[0]);
    if (expected !== parts[1]) return { ok: false, reason: "signature", ticket: ticket };
    return { ok: true, ticket: ticket };
  }

  /* Acepta el texto crudo de un QR: puede ser la URL del ticket o el token solo. */
  function extractToken(text) {
    var s = String(text || "").trim();
    var hash = s.indexOf("#");
    if (hash !== -1) s = s.slice(hash + 1);
    s = s.replace(/^t=/, "");
    return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s) ? s : null;
  }

  function ticketUrl(token) { return BASE + "t.html#" + token; }

  /* — QR — */
  function qrMatrix(text) {
    var qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    return { size: n, dark: function (r, c) { return qr.isDark(r, c); } };
  }
  function drawQR(ctx, text, x, y, size, color) {
    var m = qrMatrix(text);
    var quiet = 2;
    var cell = size / (m.size + quiet * 2);
    ctx.fillStyle = color || "#111";
    for (var r = 0; r < m.size; r++) {
      for (var c = 0; c < m.size; c++) {
        if (m.dark(r, c)) {
          ctx.fillRect(
            Math.floor(x + (c + quiet) * cell),
            Math.floor(y + (r + quiet) * cell),
            Math.ceil(cell),
            Math.ceil(cell)
          );
        }
      }
    }
  }
  function qrCanvas(text, px) {
    var cv = document.createElement("canvas");
    cv.width = cv.height = px;
    var ctx = cv.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, px, px);
    drawQR(ctx, text, 0, 0, px, "#111");
    return cv;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitText(ctx, text, maxW, size, weight) {
    var s = size;
    do {
      ctx.font = (weight || 500) + " " + s + "px Inter, system-ui, sans-serif";
      if (ctx.measureText(text).width <= maxW) break;
      s -= 2;
    } while (s > 18);
    return s;
  }

  function prettyDate(d) {
    if (!d) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (!m) return d;
    var dt = new Date(+m[1], +m[2] - 1, +m[3]);
    try {
      return dt.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return d; }
  }

  /* Imagen PNG del ticket (1080×1500) para compartir por WhatsApp o guardar. */
  async function ticketImage(ticket, token) {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    var W = 1080, H = 1500;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var ctx = cv.getContext("2d");

    ctx.fillStyle = "#161826";
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * 0.5, 0, 40, W * 0.5, 0, H * 0.75);
    g.addColorStop(0, "rgba(255,77,46,.55)");
    g.addColorStop(0.45, "rgba(255,77,46,.12)");
    g.addColorStop(1, "rgba(255,77,46,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#FF7A33";
    ctx.font = "600 26px Inter, system-ui, sans-serif";
    ctx.fillText("J U A N   S O L O   ·   T I C K E T", W / 2, 100);

    ctx.fillStyle = "#ffffff";
    var evName = ticket.ev || "Evento";
    var fs = fitText(ctx, evName, W - 140, 84, 600);
    ctx.font = "600 " + fs + "px Inter, system-ui, sans-serif";
    ctx.fillText(evName, W / 2, 205);

    var sub = [prettyDate(ticket.d), ticket.l].filter(Boolean).join("  ·  ");
    if (sub) {
      ctx.fillStyle = "#cfd3e5";
      fitText(ctx, sub, W - 140, 34, 400);
      ctx.fillText(sub, W / 2, 262);
    }

    var qs = 720, qx = (W - qs) / 2, qy = 320;
    ctx.save();
    ctx.shadowColor = "rgba(255,90,40,.55)";
    ctx.shadowBlur = 60;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qx - 28, qy - 28, qs + 56, qs + 56, 36);
    ctx.fill();
    ctx.restore();
    drawQR(ctx, ticketUrl(token), qx, qy, qs, "#111111");

    ctx.fillStyle = "#ffffff";
    var name = ticket.n || "";
    fitText(ctx, name, W - 140, 64, 600);
    ctx.fillText(name, W / 2, 1190);

    var meta = (ticket.t || "General") + "  ·  Admite " + (ticket.q || 1) + (Number(ticket.q) === 1 || !ticket.q ? " persona" : " personas");
    ctx.fillStyle = "#FF8A4D";
    ctx.font = "500 38px Inter, system-ui, sans-serif";
    ctx.fillText(meta, W / 2, 1255);

    ctx.strokeStyle = "rgba(233,233,237,.18)";
    ctx.setLineDash([10, 12]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(80, 1320); ctx.lineTo(W - 80, 1320); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#9397ab";
    ctx.font = "500 30px Inter, system-ui, sans-serif";
    ctx.fillText("CÓDIGO  " + ticket.i, W / 2, 1385);
    ctx.font = "400 26px Inter, system-ui, sans-serif";
    ctx.fillText("Presenta este QR en la puerta · Uso único · No lo compartas", W / 2, 1435);

    return cv;
  }

  function canvasBlob(cv) {
    return new Promise(function (res) { cv.toBlob(res, "image/png"); });
  }

  function slug(s) {
    return String(s || "ticket").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "ticket";
  }

  window.TK = {
    BASE: BASE,
    b64u: b64u, unb64u: unb64u, encodeJSON: encodeJSON, decodeJSON: decodeJSON,
    randomId: randomId, randomKey: randomKey,
    sign: sign, verify: verify, peek: peek, extractToken: extractToken, ticketUrl: ticketUrl,
    qrCanvas: qrCanvas, ticketImage: ticketImage, canvasBlob: canvasBlob,
    prettyDate: prettyDate, slug: slug
  };
})();
