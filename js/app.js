/* Test SCOTT Experience 2027 - logica de la landing de reservas */
(function () {
  "use strict";
  var D = window.SCOTT_DATA;
  var C = window.SCOTT_CONFIG || {};
  var DEMO = !C.API_URL;
  var DEMO_KEY = "scx2027_demo_bookings";
  var T0 = Date.now();   // momento de apertura de la pagina (anti-bots: el servidor rechaza envios imposiblemente rapidos)

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var TYPE_LABEL = { mtb: "MTB · Spark RC", gravel: "Gravel · Addict Gravel" };
  var TYPE_SHORT = { mtb: "MTB", gravel: "Gravel" };

  function parseDate(iso) { var p = iso.split("-"); return { y: +p[0], m: +p[1], d: +p[2] }; }
  function bikeName(b) { return b.family + " " + b.name; }
  function bikesOf(type) { return D.bikes.filter(function (b) { return b.type === type; }); }
  function bikeById(id) { return D.bikes.filter(function (b) { return b.id === id; })[0]; }
  function sessionsOfDay(date) { return D.sessions.filter(function (s) { return s.date === date; }); }
  function sessionById(id) { return D.sessions.filter(function (s) { return s.id === id; })[0]; }
  function hm(s) { return s.start + "–" + s.end; }
  function dayByDate(date) { return D.days.filter(function (d) { return d.date === date; })[0]; }
  function norm(s) {
    s = String(s).toLowerCase();
    if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");   // "García" = "Garcia"
    return s.replace(/\s+/g, " ").trim();
  }
  function newRequestId() {
    var ch = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", out = "";
    for (var i = 0; i < 8; i++) out += ch.charAt(Math.floor(Math.random() * ch.length));
    return out;
  }
  function setStatus(text, loading) { var el = $("#status"); el.textContent = text || ""; el.classList.toggle("loading", !!loading); }
  // Bloquea el boton principal y muestra un aviso mientras dura una espera (el backend puede tardar unos segundos)
  function busy(label, p) {
    var b = $("#btn-next");
    b.disabled = true; b.textContent = label; setStatus(label, true);
    function restore() { b.textContent = state.step === 5 ? "Confirmar reserva" : "Continuar"; setStatus("", false); updateNext(); }
    return p.then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
  }

  var state = {
    step: 1, dayDate: null, enabled: {}, picks: {},
    person: null, waiverRead: false, booked: {}, availabilityFailed: false, submitting: false, notice: ""
  };

  /* ---------- Disponibilidad ---------- */
  function demoLoad() {
    var out = {};
    try {
      JSON.parse(localStorage.getItem(DEMO_KEY) || "[]").forEach(function (b) {
        var k = b.sessionId + "|" + b.bikeId + "|" + b.size; out[k] = (out[k] || 0) + 1;
      });
    } catch (e) {}
    return out;
  }
  function loadAvailability() {
    if (DEMO) { state.booked = demoLoad(); return Promise.resolve(); }
    return fetch(C.API_URL + "?action=availability", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { state.booked = j.booked || {}; state.availabilityFailed = false; } else throw new Error("bad"); })
      .catch(function () { state.availabilityFailed = true; });
  }
  function remaining(sessionId, bike, size) {
    var total = bike.sizes[size] || 0;
    return Math.max(0, total - (state.booked[sessionId + "|" + bike.id + "|" + size] || 0));
  }
  function sessionRemaining(session) {
    var n = 0;
    bikesOf(session.type).forEach(function (b) { Object.keys(b.sizes).forEach(function (sz) { n += remaining(session.id, b, sz); }); });
    return n;
  }
  function sessionCapacity(type) {
    var n = 0; bikesOf(type).forEach(function (b) { Object.keys(b.sizes).forEach(function (sz) { n += b.sizes[sz]; }); }); return n;
  }

  /* ---------- Galeria ---------- */
  function renderGallery() {
    ["mtb", "gravel"].forEach(function (type) {
      var box = $("#gallery-" + type);
      box.innerHTML = bikesOf(type).map(function (b) {
        var chips = Object.keys(b.sizes).map(function (sz) {
          return '<span class="chip">' + esc(sz) + " <small>×" + b.sizes[sz] + "</small></span>";
        }).join("");
        return '<article class="bike-card"><div class="photo"><img loading="lazy" src="' + esc(b.img) + '" alt="' + esc(bikeName(b) + " " + b.color) + '"></div>' +
          '<div class="body"><div class="fam">' + esc(b.family) + "</div><h4>" + esc(b.name) + '</h4><div class="color">' + esc(b.color) + "</div>" +
          '<div class="chips" aria-label="Tallas disponibles">' + chips + '</div><span class="pedal">Pedales ' + esc(b.pedal) + "</span></div></article>";
      }).join("");
    });
  }

  /* ---------- Pasos ---------- */
  function go(step, opts) {
    var quiet = opts && (opts.silent || opts.fromPop);
    state.step = step;
    $$(".panel").forEach(function (p) { p.hidden = String(p.getAttribute("data-panel")) !== String(step); });
    $$("#stepper li").forEach(function (li) {
      var n = +li.getAttribute("data-step");
      li.classList.toggle("done", step === "done" || n < step);
      li.classList.toggle("current", n === step);
      if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    var back = $("#btn-back"), next = $("#btn-next");
    $("#nav-buttons").hidden = step === "done";
    back.hidden = step === 1 || step === "done";
    next.textContent = step === 5 ? "Confirmar reserva" : "Continuar";
    renderStoreBanner(step);
    if (step === 2) renderTests();
    if (step === 4) { updateWaiverUI(); }
    if (step === 5) renderSummary();
    updateNext();
    if (!quiet) {
      try { history.pushState({ scx: step }, "", location.href); } catch (e) {}   // el boton "Atras" del navegador vuelve al paso anterior
      $("#stepper").scrollIntoView({ block: "start", behavior: "smooth" });
      var h = $('.panel[data-panel="' + step + '"] > h3');                          // el foco pasa al titulo del paso (teclado / lector de pantalla)
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }

  /* Banner con el logo de la tienda elegida: visible en todo el proceso (pasos 2-5 y confirmación) */
  function renderStoreBanner(step) {
    var el = $("#store-banner");
    if (step === 1 || !state.dayDate) { el.hidden = true; el.innerHTML = ""; return; }
    var d = dayByDate(state.dayDate), p = parseDate(d.date);
    el.innerHTML = '<span class="logo-tile lg" style="background:' + d.logoBg + '"><img src="' + esc(d.logo) + '" alt="Logo ' + esc(d.store) + '"></span>' +
      '<div class="sb-text"><div class="sb-eyebrow">' + (step === "done" ? "Tu test en" : "Reservas para el test en") + '</div><div class="sb-name">' + esc(d.store) + "</div>" +
      '<div class="sb-meta">' + esc(d.city) + " · " + esc(d.weekday) + " " + p.d + " de diciembre</div>" +
      '<a class="sb-map" href="' + esc(d.mapUrl) + '" target="_blank" rel="noopener noreferrer"><svg class="pin" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg> Cómo llegar · ver ubicación en Google Maps</a></div>' +
      (step === 2 ? '<button type="button" class="btn btn-ghost btn-sm sb-change" id="sb-change">Cambiar tienda</button>' : "");
    el.hidden = false;
    var c = $("#sb-change"); if (c) c.addEventListener("click", function () { go(1); });
  }

  function updateNext() {
    var ok = false, s = state.step;
    if (s === 1) ok = !!state.dayDate;
    else if (s === 2) ok = testsValid();
    else if (s === 3) ok = true;
    else if (s === 4) ok = waiverValid();
    else if (s === 5) ok = !state.submitting;
    $("#btn-next").disabled = !ok;
  }

  /* ---------- Paso 1: dias ---------- */
  function renderDays() {
    $("#day-grid").innerHTML = D.days.map(function (d) {
      var p = parseDate(d.date);
      var sel = state.dayDate === d.date;
      return '<button type="button" class="day-card" data-date="' + d.date + '" aria-pressed="' + sel + '">' +
        '<span class="day-date"><div class="dow">' + esc(d.weekday.slice(0, 3)) + '</div><div class="dnum">' + p.d + '</div><div class="dmon">' + MONTHS[p.m - 1] + "</div></span>" +
        '<span class="logo-tile sm" style="background:' + d.logoBg + '"><img src="' + esc(d.logo) + '" alt="Logo ' + esc(d.store) + '" loading="lazy"></span>' +
        '<span class="day-info"><div class="city">' + esc(d.city) + '</div><div class="store">' + esc(d.store) + '</div><div class="tests">' + sessionsOfDay(d.date).map(function (s) { return TYPE_SHORT[s.type] + " " + hm(s); }).join(" · ") + "</div></span>" +
        '<span class="day-radio" aria-hidden="true"></span></button>';
    }).join("");
  }

  /* ---------- Paso 2: tests ---------- */
  function testsValid() {
    var any = false, list = sessionsOfDay(state.dayDate);
    for (var i = 0; i < list.length; i++) {
      var id = list[i].id;
      if (state.enabled[id]) { any = true; if (!state.picks[id]) return false; }
    }
    return any;
  }
  function renderTests() {
    var d = dayByDate(state.dayDate);
    var p = parseDate(d.date);
    $("#day-summary").innerHTML = "<strong>" + esc(d.weekday) + " " + p.d + " de diciembre</strong> · " + esc(d.store) + " (" + esc(d.city) + ")" +
      (state.availabilityFailed ? '<br><span class="hint">No hemos podido comprobar el stock en este momento; se verificará al confirmar.</span>' : "") +
      (state.notice ? '<div class="form-error">' + esc(state.notice) + "</div>" : "");
    state.notice = "";
    renderTestBlocks();
    renderSizeHelper();
  }
  function renderTestBlocks() {
    $("#tests-box").innerHTML = sessionsOfDay(state.dayDate).map(function (s) { return testBlockHTML(s.id); }).join("");
  }

  /* ---------- Guia de tallas (altura -> talla recomendada por SCOTT) ---------- */
  var GUIDE = D.sizeGuide || {};
  var SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
  function fitSizes(type, h) {
    var g = GUIDE[type]; if (!g || !h) return [];
    return SIZE_ORDER.filter(function (sz) {
      var r = g.ranges[sz]; if (!r) return false;
      return (r[0] == null || h >= r[0]) && (r[1] == null || h <= r[1]);
    });
  }
  function fleetSizes(type) {
    var seen = {}; bikesOf(type).forEach(function (b) { Object.keys(b.sizes).forEach(function (sz) { seen[sz] = true; }); });
    return SIZE_ORDER.filter(function (sz) { return seen[sz]; });
  }
  function guideBounds(type) {
    var lo = null, hi = null; var g = GUIDE[type]; if (!g) return {};
    Object.keys(g.ranges).forEach(function (sz) { var r = g.ranges[sz]; if (r[0] != null && (lo == null || r[0] < lo)) lo = r[0]; if (r[1] != null && (hi == null || r[1] > hi)) hi = r[1]; });
    return { lo: lo, hi: hi };
  }
  function renderSizeHelper() {
    var gbox = $("#size-guides");
    if (!gbox.innerHTML) {
      gbox.innerHTML = ["mtb", "gravel"].filter(function (t) { return GUIDE[t]; }).map(function (t) {
        var g = GUIDE[t];
        var alt = "Guía de tallas " + g.label + ": " + SIZE_ORDER.filter(function (sz) { return g.ranges[sz]; }).map(function (sz) {
          var r = g.ranges[sz]; return sz + " " + (r[0] == null ? "hasta " + r[1] : (r[1] == null ? "desde " + r[0] : r[0] + " a " + r[1])) + " cm";
        }).join(", ");
        return '<figure><figcaption>' + esc(g.label) + '</figcaption><img loading="lazy" src="' + esc(g.img) + '" alt="' + esc(alt) + '"></figure>';
      }).join("");
    }
    var res = $("#size-result"), h = state.height;
    if (!h) { res.innerHTML = ""; return; }
    res.innerHTML = ["mtb", "gravel"].filter(function (t) { return GUIDE[t]; }).map(function (t) {
      var fit = fitSizes(t, h), fleet = fleetSizes(t), ok = fit.filter(function (sz) { return fleet.indexOf(sz) >= 0; });
      var label = '<span class="sr-type">' + esc(GUIDE[t].label) + "</span>", body;
      if (ok.length) body = '<span class="sr-sizes">' + ok.map(function (sz) { return "<b>" + sz + "</b>"; }).join(" o ") + "</span>";
      else if (fit.length) body = '<span class="sr-none">Tu talla (' + fit.join(" / ") + ") no está en este test</span>";
      else { var bd = guideBounds(t); body = '<span class="sr-none">' + (bd.lo != null && h < bd.lo ? "Por debajo del rango de la guía (desde " + bd.lo + " cm)" : "Por encima del rango de la guía (hasta " + bd.hi + " cm)") + "</span>"; }
      return '<div class="sr-item">' + label + body + "</div>";
    }).join("") + '<p class="sr-note">Rangos orientativos de la guía oficial SCOTT. Si estás entre dos tallas, la guía las recomienda ambas.</p>';
  }
  function testBlockHTML(sid) {
    var s = sessionById(sid), type = s.type;
    var left = sessionRemaining(s), cap = sessionCapacity(type);
    var on = !!state.enabled[sid];
    var badgeCls = left === 0 ? "badge out" : (left <= 3 ? "badge low" : "badge");
    var badgeTxt = left === 0 ? "Completo" : (left + " de " + cap + " libres");
    var pick = state.picks[sid];
    var body = "";
    if (on) {
      body = '<div class="test-body"><div class="pick-grid">' + bikesOf(type).map(function (b) {
        var selected = pick && pick.bikeId === b.id;
        var sizes = Object.keys(b.sizes).map(function (sz) {
          var r = remaining(s.id, b, sz);
          var pressed = selected && pick.size === sz;
          var fit = !!state.height && fitSizes(type, state.height).indexOf(sz) >= 0;   // talla recomendada para la altura indicada
          return '<button type="button" class="size-btn' + (fit ? " fit" : "") + '" data-session="' + sid + '" data-bike="' + b.id + '" data-size="' + sz + '" aria-pressed="' + pressed + '"' + (r === 0 ? " disabled" : "") +
            ' aria-label="Talla ' + sz + (fit ? ", recomendada para tu altura" : "") + ", " + (r === 0 ? "agotada" : r + (r === 1 ? " unidad libre" : " unidades libres")) + '">' + (fit ? '<em class="fit-tag">Para ti</em>' : "") + sz + "<small>" + (r === 0 ? "agotada" : "quedan " + r) + "</small></button>";
        }).join("");
        return '<div class="pick-card' + (selected ? " selected" : "") + '"><div class="photo"><img loading="lazy" src="' + esc(b.img) + '" alt="' + esc(bikeName(b) + " " + b.color) + '"></div>' +
          '<div class="pbody"><div class="pname">' + esc(bikeName(b)) + '</div><div class="pcolor">' + esc(b.color) + " · pedales " + esc(b.pedal) + '</div><div class="size-chips">' + sizes + "</div></div></div>";
      }).join("") + "</div></div>";
    }
    return '<div class="test-block' + (on ? " on" : "") + '" data-block="' + sid + '">' +
      '<button type="button" class="test-head" data-toggle="' + sid + '" aria-expanded="' + on + '"' + (left === 0 ? " disabled" : "") + '>' +
      '<span class="box" aria-hidden="true">✓</span><span class="left"><div class="t-title">' + TYPE_LABEL[type] + " · " + esc(s.period) + '</div><div class="t-sub">' + esc(hm(s)) + " · " + esc(s.store) + '</div><div class="t-arrive">Presentarse a las <strong>' + esc(s.arrive) + "</strong> (30 min antes)</div></span>" +
      '<span class="' + badgeCls + '">' + badgeTxt + "</span></button>" + body + "</div>";
  }
  function refreshBlock(sid) {
    var el = $('[data-block="' + sid + '"]');
    var tmp = document.createElement("div");
    tmp.innerHTML = testBlockHTML(sid);
    el.parentNode.replaceChild(tmp.firstChild, el);
    updateNext();
  }

  /* ---------- Paso 3: datos ---------- */
  function ageOf(iso) {
    var d = new Date(iso + "T00:00:00"); if (isNaN(d)) return -1;
    var n = new Date(), a = n.getFullYear() - d.getFullYear(), m = n.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < d.getDate())) a--; return a;
  }
  function validateKyc() {
    var f = $("#kyc-form"), v = {}, bad = [], msgs = [];
    ["nombre", "apellidos", "documento", "nacimiento", "telefono", "email", "emergenciaNombre", "emergenciaTelefono", "peso", "sillin"].forEach(function (n) {
      v[n] = f.elements[n].value.trim(); f.elements[n].setAttribute("aria-invalid", "false");
    });
    function fail(n, msg) { bad.push(n); if (msgs.indexOf(msg) < 0) msgs.push(msg); }
    if (v.nombre.length < 2) fail("nombre", "Escribe tu nombre.");
    if (v.apellidos.length < 2) fail("apellidos", "Escribe tus apellidos.");
    if (!/^[A-Za-z0-9\-\s]{5,20}$/.test(v.documento)) fail("documento", "Revisa tu DNI/NIE/pasaporte (5–20 letras o números).");
    var age = v.nacimiento ? ageOf(v.nacimiento) : -1;
    if (age < 0 || age > 100) fail("nacimiento", "Indica una fecha de nacimiento válida.");
    else if (age < 18) fail("nacimiento", "Solo pueden participar personas mayores de 18 años.");
    function phoneOk(x) { return /^[+\d\s().\-]{9,20}$/.test(x) && x.replace(/\D/g, "").length >= 9; }
    if (!phoneOk(v.telefono)) fail("telefono", "Revisa tu teléfono (mínimo 9 dígitos).");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.email)) fail("email", "Revisa tu correo electrónico.");
    if (v.emergenciaNombre.length < 2) fail("emergenciaNombre", "Indica un contacto de emergencia.");
    if (!phoneOk(v.emergenciaTelefono)) fail("emergenciaTelefono", "Revisa el teléfono de emergencia.");
    var peso = parseFloat(String(v.peso).replace(",", "."));                       // peso: obligatorio
    if (!(peso >= 30 && peso <= 250)) fail("peso", "Indica tu peso en kg (entre 30 y 250).");
    if (v.sillin !== "") {                                                         // altura de sillin: opcional, pero si se rellena debe ser valida
      var sillin = parseFloat(String(v.sillin).replace(",", "."));
      if (!(sillin >= 50 && sillin <= 100)) fail("sillin", "La altura de sillín debe estar entre 50 y 100 cm (o déjala en blanco).");
    }
    bad.forEach(function (n) { f.elements[n].setAttribute("aria-invalid", "true"); });
    var box = $("#kyc-error");
    if (bad.length) { box.hidden = false; box.textContent = msgs.join(" "); f.elements[bad[0]].focus(); return null; }
    box.hidden = true; return v;
  }

  /* ---------- Paso 4: descargo ---------- */
  function waiverValid() {
    // Basta con las casillas de lectura y aceptacion (y la de datos personales); ya no se pide firmar con el nombre
    return state.waiverRead && $("#waiver-read").checked && $("#waiver-check").checked && $("#privacy-check").checked;
  }
  function onWaiverScroll() {
    var w = $("#waiver"), max = w.scrollHeight - w.clientHeight;
    var pct = max <= 0 ? 100 : Math.min(100, Math.round((w.scrollTop / max) * 100));
    $("#waiver-bar").style.width = pct + "%";
    if (!state.waiverRead && (max <= 0 || w.scrollTop >= max - 8)) { state.waiverRead = true; updateWaiverUI(); updateNext(); }
  }
  function updateWaiverUI() {
    var st = $("#waiver-status");
    $("#waiver-read").disabled = !state.waiverRead;
    $("#waiver-check").disabled = !state.waiverRead;
    st.classList.toggle("ok", state.waiverRead);
    st.textContent = state.waiverRead ? "Has llegado al final del documento. Ya puedes marcar las casillas." : "Aún no has llegado al final del documento: desplázate hasta el final para poder marcar las casillas.";
    if (state.step === 4) setTimeout(onWaiverScroll, 0);
  }

  /* ---------- Paso 5: resumen ---------- */
  function bookingsList() {
    return sessionsOfDay(state.dayDate).filter(function (s) { return state.enabled[s.id] && state.picks[s.id]; }).map(function (s) {
      var b = bikeById(state.picks[s.id].bikeId);
      return { sessionId: s.id, bikeId: b.id, size: state.picks[s.id].size, session: s, bike: b };
    });
  }
  function summaryHTML(person, withPerson) {
    var rows = bookingsList().map(function (bk) {
      var p = parseDate(bk.session.date);
      return '<dl class="sum-row sum-test"><dt>' + TYPE_SHORT[bk.session.type] + "</dt><dd><strong>" + esc(bk.session.weekday) + " " + p.d + " " + MONTHS[p.m - 1] + " · " + esc(bk.session.start) + "–" + esc(bk.session.end) + "</strong><br>" +
        esc(bk.session.store) + " (" + esc(bk.session.city) + ') · <a class="map-link" href="' + esc(bk.session.mapUrl) + '" target="_blank" rel="noopener noreferrer">Ver ubicación</a><br>Presentarse a las <strong>' + esc(bk.session.arrive) + "</strong> (30 min antes)<br>" + esc(bikeName(bk.bike)) + " · " + esc(bk.bike.color) + " · <strong>talla " + esc(bk.size) + "</strong></dd></dl>";
    }).join("");
    if (withPerson && person) {
      rows += '<dl class="sum-row"><dt>Participante</dt><dd>' + esc(person.nombre + " " + person.apellidos) + "<br>" + esc(person.documento) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Contacto</dt><dd>' + esc(person.email) + "<br>" + esc(person.telefono) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Emergencia</dt><dd>' + esc(person.emergenciaNombre) + " · " + esc(person.emergenciaTelefono) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Ajuste bici</dt><dd>Peso ' + esc(person.peso) + " kg" + (person.sillin ? " · sillín " + esc(person.sillin) + " cm" : "") + "</dd></dl>" +
        '<dl class="sum-row"><dt>Descargo</dt><dd>Leído y aceptado</dd></dl>';
    }
    return rows;
  }
  function renderSummary() { $("#summary").innerHTML = summaryHTML(state.person, true); $("#submit-error").hidden = true; }

  /* ---------- Envio ---------- */
  function newRef() { return "SCX-" + String(new Date().getMonth() + 1).padStart(2, "0") + String(new Date().getDate()).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  function submit() {
    if (state.submitting) return;
    var bookings = bookingsList().map(function (b) { return { sessionId: b.sessionId, bikeId: b.bikeId, size: b.size }; });
    // Identificador de intento: si la respuesta se pierde y el cliente reintenta, el servidor devuelve la misma reserva sin duplicarla
    var fp = JSON.stringify(bookings) + "|" + (state.person && state.person.documento);
    if (!state.requestId || state.requestFp !== fp) { state.requestId = newRequestId(); state.requestFp = fp; }
    var payload = {
      requestId: state.requestId, bookings: bookings, person: state.person, privacy: true,
      hp: $("#hp-field").value, elapsedMs: Date.now() - T0,   // anti-bots: campo trampa y tiempo desde que se abrio la pagina
      waiver: { read: $("#waiver-read").checked, accepted: $("#waiver-check").checked, version: C.WAIVER_VERSION, acceptedAt: new Date().toISOString() }
    };
    state.submitting = true; $("#btn-next").textContent = "Enviando…"; setStatus("Enviando tu reserva… puede tardar unos segundos. No cierres la página.", true); updateNext();
    var done = DEMO ? demoSubmit(payload) : fetch(C.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
    done.then(function (res) {
      state.submitting = false; $("#btn-next").textContent = "Confirmar reserva"; setStatus("", false);
      if (res && res.ok) return success(res);
      handleError(res || { error: "SERVER" });
    }).catch(function () {
      state.submitting = false; $("#btn-next").textContent = "Confirmar reserva"; setStatus("", false); updateNext();
      showSubmitError("No hemos podido confirmar si tu reserva se ha guardado. Comprueba tu conexión y pulsa «Confirmar reserva» otra vez: si ya estaba guardada, no se duplicará.");
    });
  }
  function demoSubmit(payload) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        var booked = demoLoad(), stored = [];
        try { stored = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch (e) {}
        for (var i = 0; i < payload.bookings.length; i++) {
          var b = payload.bookings[i], bike = bikeById(b.bikeId), k = b.sessionId + "|" + b.bikeId + "|" + b.size;
          if ((booked[k] || 0) >= bike.sizes[b.size]) return resolve({ ok: false, error: "SOLD_OUT", detail: "Esa bicicleta/talla se acaba de agotar." });
        }
        var ref = newRef();
        payload.bookings.forEach(function (b) { stored.push({ sessionId: b.sessionId, bikeId: b.bikeId, size: b.size, ref: ref, email: payload.person.email }); });
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(stored)); } catch (e) {}
        resolve({ ok: true, ref: ref });
      }, 500);
    });
  }
  function showSubmitError(msg) { var e = $("#submit-error"); e.hidden = false; e.textContent = msg; }
  function handleError(res) {
    updateNext();
    if (res.error === "SOLD_OUT") {
      state.notice = "Lo sentimos: esa bici/talla se acaba de agotar en este test. Elige otra opción.";
      state.picks = {};
      loadAvailability().then(function () { go(2); });
      return;
    }
    var map = {
      UNDERAGE: "Solo pueden participar personas mayores de 18 años.",
      DUPLICATE: res.detail || "Ya existe una reserva con este documento de identidad para ese test.",
      WAIVER: "No se ha podido validar la aceptación del descargo. Revisa la firma (debe coincidir con tu nombre y apellidos).",
      INVALID: res.detail || "Algún dato no es válido. Revísalos e inténtalo de nuevo.",
      TOO_FAST: res.detail, TOO_MANY: res.detail, BUSY: res.detail, MAIL: res.detail,
      EXPIRED: res.detail
    };
    if (res.error === "EXPIRED") { state.requestId = ""; state.requestFp = ""; }   // la reserva anterior caduco: el siguiente intento es nuevo
    showSubmitError(map[res.error] || "Ha ocurrido un error al guardar la reserva. Inténtalo de nuevo en unos minutos.");
  }

  function success(res) {
    var ref = res.ref;
    $("#done-ref").textContent = ref;
    $("#done-summary").innerHTML = summaryHTML(null, false);
    state.lastRef = ref; state.submitting = false;
    if (res.pending) {
      // Reserva PENDIENTE: la bici queda retenida hasta que el participante valida el enlace del email
      var until = new Date(res.expiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
      $("#done-icon").textContent = "✉"; $("#done-title").textContent = "Último paso: confirma tu reserva";
      $("#done-note").innerHTML = "Te hemos enviado un email a <strong>" + esc(state.person.email) + "</strong>. Abre el enlace y pulsa «Confirmar mi reserva» <strong>antes de las " + esc(until) + "</strong>; hasta entonces tu bici queda retenida. Si no lo ves, mira en spam o promociones.";
      $("#done-actions").innerHTML = '<button type="button" class="btn btn-ghost" id="resend-btn">Reenviar el email</button>';
      $("#resend-btn").addEventListener("click", function () {
        var btn = this; btn.disabled = true; setStatus("Reenviando el email…", true);
        fetch(C.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "resend", ref: ref }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { setStatus(j.ok ? "Email reenviado. Revisa tu bandeja de entrada y el spam." : (j.detail || "No hemos podido reenviarlo."), false); btn.disabled = !!(j && j.error === "RATE"); })
          .catch(function () { setStatus("No hemos podido reenviarlo. Inténtalo de nuevo.", false); btn.disabled = false; });
      });
    } else {
      $("#done-icon").textContent = "✓"; $("#done-title").textContent = "¡Reserva confirmada!";
      $("#done-note").innerHTML = DEMO ? "Modo demostración: esta reserva solo existe en este navegador." :
        (res.emailSent === false
          ? "<strong>No hemos podido enviarte el email ahora mismo</strong>, pero tu reserva está confirmada: guarda tu referencia (" + esc(ref) + "). "
          : "Te hemos enviado la confirmación a <strong>" + esc(state.person.email) + "</strong>; revisa también el spam. Si no puedes venir, cancela desde el enlace del email. ") +
        "Llega 30 minutos antes del inicio de tu test, con casco (obligatorio) y tu documento de identidad.";
      $("#done-actions").innerHTML = '<button type="button" class="btn" id="dl-ics">Añadir al calendario</button>';
      $("#dl-ics").addEventListener("click", function () { downloadICS(ref); });
    }
    go("done");
    loadAvailability().then(function () { renderTestsIfVisible(); });
  }
  function renderTestsIfVisible() { /* el stock se refresca al volver al paso 2 */ }

  function downloadICS(ref) {
    function stamp(date, hm) { return date.replace(/-/g, "") + "T" + hm.replace(":", "") + "00"; }
    var now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    var ev = bookingsList().map(function (b, i) {
      return ["BEGIN:VEVENT", "UID:" + ref + "-" + i + "@scott-experience-2027", "DTSTAMP:" + now,
        "DTSTART:" + stamp(b.session.date, b.session.start), "DTEND:" + stamp(b.session.date, b.session.end),
        "SUMMARY:Test SCOTT " + TYPE_SHORT[b.session.type] + " · " + bikeName(b.bike) + " (" + b.size + ") · llegar " + b.session.arrive,
        "LOCATION:" + b.session.store + "\\, " + b.session.city,
        "DESCRIPTION:Referencia " + ref + ". Presentate a las " + b.session.arrive + " (30 minutos antes del inicio). Ubicacion: " + b.session.mapUrl + " . Casco obligatorio. Lleva tu documento de identidad.","URL:" + b.session.mapUrl, "END:VEVENT"].join("\r\n");
    }).join("\r\n");
    var ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SCOTT Experience 2027//ES\r\nCALSCALE:GREGORIAN\r\n" + ev + "\r\nEND:VCALENDAR\r\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "scott-experience-2027-" + ref + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // Desde los chips de fecha/ciudad de la cabecera: preselecciona ese dia/tienda y lleva directo a elegir bici
  function jumpToDay(date) {
    if (state.submitting) return;
    if (state.step === "done") { resetState(); renderDays(); }
    if (state.dayDate !== date) { state.enabled = {}; state.picks = {}; }
    state.dayDate = date;
    $$(".day-card").forEach(function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-date") === date)); });
    busy("Comprobando disponibilidad…", loadAvailability()).then(function () { go(2); });
  }

  function resetState() {
    state.requestId = ""; state.requestFp = "";
    state.height = null; $("#height-input").value = ""; $("#size-result").innerHTML = "";
    state.dayDate = null; state.enabled = {}; state.picks = {};
    state.person = null; state.waiverRead = false; state.notice = "";
    $("#kyc-form").reset(); $("#waiver-read").checked = false; $("#waiver-check").checked = false; $("#privacy-check").checked = false;
    $("#waiver").scrollTop = 0; $("#waiver-bar").style.width = "0";
  }
  function resetAll() {
    resetState();
    renderDays();
    loadAvailability().then(function () { go(1); });
  }

  /* ---------- Eventos ---------- */
  function init() {
    if (DEMO) $("#demo-banner").hidden = false;
    var today = new Date(); $("#kyc-form").elements.nacimiento.max = today.toISOString().slice(0, 10);
    renderGallery(); renderDays();

    $("#day-grid").addEventListener("click", function (e) {
      var b = e.target.closest(".day-card"); if (!b) return;
      if (state.dayDate !== b.getAttribute("data-date")) { state.enabled = {}; state.picks = {}; }
      state.dayDate = b.getAttribute("data-date");
      $$(".day-card").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      updateNext();
    });

    $("#tests-box").addEventListener("click", function (e) {
      var head = e.target.closest("[data-toggle]");
      if (head) {
        var t = head.getAttribute("data-toggle"); state.enabled[t] = !state.enabled[t]; if (!state.enabled[t]) state.picks[t] = null;
        if (state.enabled[t]) {
          // un solo test de cada tipo por dia: al elegir uno se desmarca el otro del mismo tipo
          var me = sessionById(t);
          sessionsOfDay(state.dayDate).forEach(function (o) {
            if (o.id !== t && o.type === me.type && state.enabled[o.id]) { state.enabled[o.id] = false; state.picks[o.id] = null; refreshBlock(o.id); }
          });
        }
        refreshBlock(t); return;
      }
      var sz = e.target.closest(".size-btn");
      if (sz && !sz.disabled) {
        var sid = sz.getAttribute("data-session");
        state.picks[sid] = { bikeId: sz.getAttribute("data-bike"), size: sz.getAttribute("data-size") };
        refreshBlock(sid);
      }
    });

    // Guia de tallas: al escribir la altura se marca la talla recomendada en las bicis
    $("#height-input").addEventListener("input", function (e) {
      var v = parseInt(e.target.value, 10);
      state.height = (v >= 120 && v <= 230) ? v : null;
      renderSizeHelper();
      renderTestBlocks();
    });

    $("#btn-back").addEventListener("click", function () { if (state.step > 1) go(state.step - 1); });
    $("#btn-next").addEventListener("click", function () {
      var s = state.step;
      if (s === 1) { busy("Comprobando disponibilidad…", loadAvailability()).then(function () { go(2); }); }
      else if (s === 2) { busy("Comprobando disponibilidad…", loadAvailability()).then(function () {
        // por si el stock cambio mientras elegia
        var changed = false;
        sessionsOfDay(state.dayDate).forEach(function (se) {
          var p = state.picks[se.id]; if (!p) return;
          if (remaining(se.id, bikeById(p.bikeId), p.size) === 0) { state.picks[se.id] = null; changed = true; }
        });
        if (changed) { state.notice = "Una de tus opciones se ha agotado mientras elegías. Selecciona otra."; renderTests(); updateNext(); } else go(3);
      }); }
      else if (s === 3) { var v = validateKyc(); if (v) { state.person = v; go(4); } }
      else if (s === 4) { if (waiverValid()) go(5); }
      else if (s === 5) submit();
    });

    $("#kyc-form").addEventListener("submit", function (e) { e.preventDefault(); $("#btn-next").click(); });
    $("#kyc-form").addEventListener("input", function (e) { e.target.setAttribute("aria-invalid", "false"); });
    $("#waiver").addEventListener("scroll", onWaiverScroll, { passive: true });
    window.addEventListener("resize", function () { if (state.step === 4) onWaiverScroll(); });
    ["#waiver-read", "#waiver-check", "#privacy-check"].forEach(function (s) { $(s).addEventListener("change", updateNext); });
    $("#open-privacy").addEventListener("click", function () { var d = $("#privacy-dialog"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); });
    $("#new-booking").addEventListener("click", resetAll);

    // Logo SCOTT de la cabecera: boton "ir al inicio" (la cabecera es fija, asi que un ancla #top no llegaba arriba)
    $$(".brand").forEach(function (brand) {
      brand.addEventListener("click", function (e) {
        e.preventDefault();
        var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        try { history.replaceState(history.state, "", location.pathname + location.search); } catch (x) {}   // sin "#top" en la URL
      });
    });

    // Chips de fecha/ciudad de la cabecera: botones que llevan directo a reservar ese dia y tienda
    $$(".date-chip").forEach(function (chip) {
      chip.addEventListener("click", function () { jumpToDay(chip.getAttribute("data-date")); });
    });

    // Boton "Atras" del navegador = paso anterior (en vez de salir de la pagina); aviso si se recarga con datos a medias
    try { history.replaceState({ scx: 1 }, "", location.href); } catch (e) {}
    window.addEventListener("popstate", function (e) {
      var st = e.state && e.state.scx;
      if (!st) return;
      if (st !== 1 && !state.dayDate) st = 1;
      go(st, { fromPop: true });
    });
    window.addEventListener("beforeunload", function (e) {
      if (state.step === 3 || state.step === 4 || state.step === 5) { e.preventDefault(); e.returnValue = ""; }
    });

    // El paso 1 se pinta de inmediato; el stock se refresca cuando llega (sin devolver al usuario al paso 1 si ya avanzo)
    renderGallery(); go(1, { silent: true });
    loadAvailability().then(function () {
      renderGallery();
      if (state.step === 2) { renderTestBlocks(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
