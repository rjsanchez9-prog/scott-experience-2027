/* Pagina de gestion de una reserva: confirmar (desde el email) y cancelar.
 * Lee ?ref=...&t=... (token secreto del email). Ninguna accion se ejecuta solo al abrir el enlace:
 * hay que pulsar un boton (asi los analizadores de enlaces del correo no confirman ni cancelan por error). */
(function () {
  "use strict";
  var C = window.SCOTT_CONFIG || {};
  var qs = new URLSearchParams(location.search);
  var REF = (qs.get("ref") || "").trim(), TOKEN = (qs.get("t") || "").trim();
  var MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var TYPE = { mtb: "MTB", gravel: "Gravel" };
  var data = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, opts) { return fetch(C.API_URL + path, opts).then(function (r) { return r.json(); }); }
  function post(body) { return api("", { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) }); }
  function dateText(iso) { var p = iso.split("-").map(Number), d = new Date(p[0], p[1] - 1, p[2]); return DOW[d.getDay()] + " " + p[2] + " de " + MONTHS[p[1] - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function summary(items) {
    return items.map(function (it) {
      return '<dl class="sum-row sum-test"><dt>' + TYPE[it.type] + "</dt><dd><strong>" + esc(cap(dateText(it.date))) + " · " + esc(it.start) + "–" + esc(it.end) + "</strong><br>" +
        esc(it.store) + " (" + esc(it.city) + ')' + (it.map ? ' · <a class="map-link" href="' + esc(it.map) + '" target="_blank" rel="noopener noreferrer">Ver ubicación</a>' : "") +
        "<br>Presentarse a las <strong>" + esc(it.arrive) + "</strong> (30 min antes)<br>" + esc(it.bike) + " · <strong>talla " + esc(it.size) + "</strong></dd></dl>";
    }).join("");
  }

  function show(opts) {
    $("#m-loading").hidden = true; $("#m-body").hidden = false;
    $("#m-title").textContent = opts.title;
    var b = $("#m-banner"); b.className = "m-banner " + (opts.tone || ""); b.innerHTML = opts.banner || ""; b.hidden = !opts.banner;
    $("#m-summary").innerHTML = opts.items ? summary(opts.items) : ""; $("#m-summary").hidden = !opts.items;
    $("#m-note").innerHTML = opts.note || ""; $("#m-note").hidden = !opts.note;
    $("#m-actions").innerHTML = opts.actions || "";
    $("#m-error").hidden = true;
  }
  function showError(msg) { var e = $("#m-error"); e.hidden = false; e.textContent = msg; }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = on ? "Un momento…" : (btn.dataset.label || btn.textContent); }

  function downloadICS() {
    function stamp(date, hm) { return date.replace(/-/g, "") + "T" + hm.replace(":", "") + "00"; }
    var now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var ev = data.items.map(function (it, i) {
      return ["BEGIN:VEVENT", "UID:" + data.ref + "-" + i + "@scott-experience-2027", "DTSTAMP:" + now,
        "DTSTART:" + stamp(it.date, it.start), "DTEND:" + stamp(it.date, it.end),
        "SUMMARY:Test SCOTT " + TYPE[it.type] + " · " + it.bike + " (" + it.size + ") · llegar " + it.arrive,
        "LOCATION:" + it.store + "\\, " + it.city,
        "DESCRIPTION:Referencia " + data.ref + ". Presentate a las " + it.arrive + " (30 minutos antes del inicio). Ubicacion: " + it.map + " . Casco obligatorio. Lleva tu documento de identidad.",
        "URL:" + it.map, "END:VEVENT"].join("\r\n");
    }).join("\r\n");
    var ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SCOTT Experience 2027//ES\r\nCALSCALE:GREGORIAN\r\n" + ev + "\r\nEND:VCALENDAR\r\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "scott-experience-2027-" + data.ref + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  var HOME = '<a class="btn btn-ghost" href="./">Volver a la web</a>';
  var NEW = '<a class="btn" href="./#reservar">Hacer una reserva nueva</a>';

  function render() {
    var untilTxt = data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }) : "";
    if (data.state === "PENDIENTE") {
      show({ title: "Confirma tu reserva", tone: "warn", items: data.items,
        banner: "Reserva a nombre de <strong>" + esc(data.name) + "</strong> · ref. <strong>" + esc(data.ref) + "</strong><br>Tu bici está retenida hasta las <strong>" + esc(untilTxt) + "</strong>.",
        note: "Si no has hecho tú esta reserva, no pulses nada: caducará sola.",
        actions: '<button class="btn" type="button" id="b-confirm">Confirmar mi reserva</button><button class="btn btn-ghost" type="button" id="b-cancel">Cancelar esta reserva</button>' });
    } else if (data.state === "CONFIRMADA") {
      show({ title: "Reserva confirmada", tone: "ok", items: data.items,
        banner: "✓ Reserva a nombre de <strong>" + esc(data.name) + "</strong> · ref. <strong>" + esc(data.ref) + "</strong>",
        note: "Llega 30 minutos antes del inicio de tu test. Casco obligatorio y lleva tu DNI/NIE/pasaporte. Si no puedes venir, cancélala para liberar la bici a otra persona.",
        actions: '<button class="btn" type="button" id="b-ics">Añadir al calendario</button><button class="btn btn-ghost" type="button" id="b-cancel">Cancelar mi reserva</button>' });
    } else if (data.state === "CANCELADA") {
      show({ title: "Reserva cancelada", tone: "", items: null,
        banner: "Esta reserva (ref. <strong>" + esc(data.ref) + "</strong>) está cancelada y las bicis han quedado libres.", actions: NEW + HOME });
    } else { // EXPIRADA
      show({ title: "La reserva ha caducado", tone: "warn", items: data.items,
        banner: "El plazo de 30 minutos para confirmar ha terminado (ref. <strong>" + esc(data.ref) + "</strong>).",
        note: "Si la bici sigue libre, aún puedes confirmarla ahora.",
        actions: '<button class="btn" type="button" id="b-confirm">Intentar confirmarla ahora</button>' + NEW });
    }
    bind();
  }

  function bind() {
    var c = $("#b-confirm"), x = $("#b-cancel"), i = $("#b-ics");
    if (i) i.addEventListener("click", downloadICS);
    if (c) c.addEventListener("click", function () {
      busy(c, true, true);
      post({ action: "confirm", ref: REF, t: TOKEN }).then(function (r) {
        if (r.ok) { data.state = "CONFIRMADA"; data.items = r.items || data.items; render(); window.scrollTo(0, 0); return; }
        busy(c, false);
        var msg = { SOLD_OUT: "Lo sentimos: esa bicicleta ya no está disponible. Puedes hacer una reserva nueva.", CANCELLED: "Esta reserva fue cancelada.", DUPLICATE: r.detail || "Ya tienes otra reserva activa para ese test.", NOT_FOUND: "No encontramos esta reserva." }[r.error];
        showError(msg || "No hemos podido confirmar la reserva. Inténtalo de nuevo en unos minutos.");
      }).catch(function () { busy(c, false); showError("No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."); });
    });
    if (x) x.addEventListener("click", function () {
      var msg = data.state === "CONFIRMADA" ? "¿Seguro que quieres cancelar tu reserva? Las bicis quedarán libres para otras personas." : "¿Seguro que quieres cancelar esta reserva?";
      if (!window.confirm(msg)) return;
      busy(x, true, true);
      post({ action: "cancel", ref: REF, t: TOKEN }).then(function (r) {
        if (r.ok) { data.state = "CANCELADA"; render(); window.scrollTo(0, 0); return; }
        busy(x, false); showError("No hemos podido cancelar la reserva. Inténtalo de nuevo en unos minutos.");
      }).catch(function () { busy(x, false); showError("No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo."); });
    });
  }

  function init() {
    if (!C.API_URL) { show({ title: "Tu reserva", banner: "Esta página necesita el servidor de reservas (modo demostración).", actions: HOME }); return; }
    if (!REF || !TOKEN) { show({ title: "Enlace no válido", tone: "warn", banner: "Falta información en el enlace. Usa el botón del email que te enviamos.", actions: HOME }); return; }
    api("?action=status&ref=" + encodeURIComponent(REF) + "&t=" + encodeURIComponent(TOKEN), { cache: "no-store" }).then(function (r) {
      if (!r.ok) { show({ title: "No encontramos la reserva", tone: "warn", banner: "El enlace no es válido o ha cambiado. Usa el botón del email más reciente que te enviamos.", actions: HOME }); return; }
      data = r; render();
    }).catch(function () { show({ title: "No hemos podido cargar tu reserva", tone: "warn", banner: "Comprueba tu conexión y recarga la página.", actions: '<button class="btn" type="button" onclick="location.reload()">Recargar</button>' }); });
  }
  init();
})();
