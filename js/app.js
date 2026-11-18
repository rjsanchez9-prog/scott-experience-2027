/* Test SCOTT Experience 2027 - logica de la landing de reservas */
(function () {
  "use strict";
  var D = window.SCOTT_DATA;
  var C = window.SCOTT_CONFIG || {};
  var DEMO = !C.API_URL;
  var DEMO_KEY = "scx2027_demo_bookings";

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
  function sessionFor(date, type) { return D.sessions.filter(function (s) { return s.date === date && s.type === type; })[0]; }
  function dayByDate(date) { return D.days.filter(function (d) { return d.date === date; })[0]; }
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, " ").trim(); }

  var state = {
    step: 1, dayDate: null, enabled: { mtb: false, gravel: false }, picks: { mtb: null, gravel: null },
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
    if (!opts || !opts.silent) $("#stepper").scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* Banner con el logo de la tienda elegida: visible en todo el proceso (pasos 2-5 y confirmación) */
  function renderStoreBanner(step) {
    var el = $("#store-banner");
    if (step === 1 || !state.dayDate) { el.hidden = true; el.innerHTML = ""; return; }
    var d = dayByDate(state.dayDate), p = parseDate(d.date);
    el.innerHTML = '<span class="logo-tile lg" style="background:' + d.logoBg + '"><img src="' + esc(d.logo) + '" alt="Logo ' + esc(d.store) + '"></span>' +
      '<div class="sb-text"><div class="sb-eyebrow">' + (step === "done" ? "Tu test en" : "Reservas para el test en") + '</div><div class="sb-name">' + esc(d.store) + "</div>" +
      '<div class="sb-meta">' + esc(d.city) + " · " + esc(d.weekday) + " " + p.d + " de diciembre</div></div>" +
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
        '<span class="day-info"><div class="city">' + esc(d.city) + '</div><div class="store">' + esc(d.store) + '</div><div class="tests">MTB 09:30–11:00 · Gravel 11:30–13:00</div></span>' +
        '<span class="day-radio" aria-hidden="true"></span></button>';
    }).join("");
  }

  /* ---------- Paso 2: tests ---------- */
  function testsValid() {
    var any = false;
    for (var i = 0; i < 2; i++) {
      var t = ["mtb", "gravel"][i];
      if (state.enabled[t]) { any = true; if (!state.picks[t]) return false; }
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
    $("#tests-box").innerHTML = ["mtb", "gravel"].map(function (t) { return testBlockHTML(t); }).join("");
  }
  function testBlockHTML(type) {
    var s = sessionFor(state.dayDate, type);
    var left = sessionRemaining(s), cap = sessionCapacity(type);
    var on = state.enabled[type];
    var badgeCls = left === 0 ? "badge out" : (left <= 3 ? "badge low" : "badge");
    var badgeTxt = left === 0 ? "Completo" : (left + " de " + cap + " libres");
    var pick = state.picks[type];
    var body = "";
    if (on) {
      body = '<div class="test-body"><div class="pick-grid">' + bikesOf(type).map(function (b) {
        var selected = pick && pick.bikeId === b.id;
        var sizes = Object.keys(b.sizes).map(function (sz) {
          var r = remaining(s.id, b, sz);
          var pressed = selected && pick.size === sz;
          return '<button type="button" class="size-btn" data-type="' + type + '" data-bike="' + b.id + '" data-size="' + sz + '" aria-pressed="' + pressed + '"' + (r === 0 ? " disabled" : "") +
            ' aria-label="Talla ' + sz + ", " + (r === 0 ? "agotada" : r + (r === 1 ? " unidad libre" : " unidades libres")) + '">' + sz + "<small>" + (r === 0 ? "agotada" : "quedan " + r) + "</small></button>";
        }).join("");
        return '<div class="pick-card' + (selected ? " selected" : "") + '"><div class="photo"><img loading="lazy" src="' + esc(b.img) + '" alt="' + esc(bikeName(b) + " " + b.color) + '"></div>' +
          '<div class="pbody"><div class="pname">' + esc(bikeName(b)) + '</div><div class="pcolor">' + esc(b.color) + " · pedales " + esc(b.pedal) + '</div><div class="size-chips">' + sizes + "</div></div></div>";
      }).join("") + "</div></div>";
    }
    return '<div class="test-block' + (on ? " on" : "") + '" data-block="' + type + '">' +
      '<button type="button" class="test-head" data-toggle="' + type + '" aria-expanded="' + on + '"' + (left === 0 ? " disabled" : "") + '>' +
      '<span class="box" aria-hidden="true">✓</span><span class="left"><div class="t-title">' + TYPE_LABEL[type] + '</div><div class="t-sub">' + esc(s.start) + "–" + esc(s.end) + " · " + esc(s.store) + "</div></span>" +
      '<span class="' + badgeCls + '">' + badgeTxt + "</span></button>" + body + "</div>";
  }
  function refreshBlock(type) {
    var el = $('[data-block="' + type + '"]');
    var tmp = document.createElement("div");
    tmp.innerHTML = testBlockHTML(type);
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
    ["nombre", "apellidos", "documento", "nacimiento", "telefono", "email", "emergenciaNombre", "emergenciaTelefono"].forEach(function (n) {
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
    bad.forEach(function (n) { f.elements[n].setAttribute("aria-invalid", "true"); });
    var box = $("#kyc-error");
    if (bad.length) { box.hidden = false; box.textContent = msgs.join(" "); f.elements[bad[0]].focus(); return null; }
    box.hidden = true; return v;
  }

  /* ---------- Paso 4: descargo ---------- */
  function waiverValid() {
    return state.waiverRead && $("#waiver-check").checked && $("#privacy-check").checked && signatureOk();
  }
  function signatureOk() {
    if (!state.person) return false;
    return norm($("#waiver-signature").value) === norm(state.person.nombre + " " + state.person.apellidos);
  }
  function onWaiverScroll() {
    var w = $("#waiver"), max = w.scrollHeight - w.clientHeight;
    var pct = max <= 0 ? 100 : Math.min(100, Math.round((w.scrollTop / max) * 100));
    $("#waiver-bar").style.width = pct + "%";
    if (!state.waiverRead && (max <= 0 || w.scrollTop >= max - 8)) { state.waiverRead = true; updateWaiverUI(); updateNext(); }
  }
  function updateWaiverUI() {
    var st = $("#waiver-status");
    $("#waiver-check").disabled = !state.waiverRead;
    $("#waiver-signature").disabled = !state.waiverRead;
    st.classList.toggle("ok", state.waiverRead);
    st.textContent = state.waiverRead ? "Has leído el documento completo. Ya puedes aceptarlo." : "Aún no has llegado al final del documento: desplázate hasta el final para poder aceptarlo.";
    if (state.person) $("#waiver-signature").placeholder = state.person.nombre + " " + state.person.apellidos;
    if (state.step === 4) setTimeout(onWaiverScroll, 0);
  }

  /* ---------- Paso 5: resumen ---------- */
  function bookingsList() {
    return ["mtb", "gravel"].filter(function (t) { return state.enabled[t] && state.picks[t]; }).map(function (t) {
      var s = sessionFor(state.dayDate, t), b = bikeById(state.picks[t].bikeId);
      return { sessionId: s.id, bikeId: b.id, size: state.picks[t].size, session: s, bike: b };
    });
  }
  function summaryHTML(person, withPerson) {
    var rows = bookingsList().map(function (bk) {
      var p = parseDate(bk.session.date);
      return '<dl class="sum-row sum-test"><dt>' + TYPE_SHORT[bk.session.type] + "</dt><dd><strong>" + esc(bk.session.weekday) + " " + p.d + " " + MONTHS[p.m - 1] + " · " + esc(bk.session.start) + "–" + esc(bk.session.end) + "</strong><br>" +
        esc(bk.session.store) + " (" + esc(bk.session.city) + ")<br>" + esc(bikeName(bk.bike)) + " · " + esc(bk.bike.color) + " · <strong>talla " + esc(bk.size) + "</strong></dd></dl>";
    }).join("");
    if (withPerson && person) {
      rows += '<dl class="sum-row"><dt>Participante</dt><dd>' + esc(person.nombre + " " + person.apellidos) + "<br>" + esc(person.documento) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Contacto</dt><dd>' + esc(person.email) + "<br>" + esc(person.telefono) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Emergencia</dt><dd>' + esc(person.emergenciaNombre) + " · " + esc(person.emergenciaTelefono) + "</dd></dl>" +
        '<dl class="sum-row"><dt>Descargo</dt><dd>Leído y aceptado · firmado como «' + esc($("#waiver-signature").value.trim()) + "»</dd></dl>";
    }
    return rows;
  }
  function renderSummary() { $("#summary").innerHTML = summaryHTML(state.person, true); $("#submit-error").hidden = true; }

  /* ---------- Envio ---------- */
  function newRef() { return "SCX-" + String(new Date().getMonth() + 1).padStart(2, "0") + String(new Date().getDate()).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(); }

  function submit() {
    if (state.submitting) return;
    var bookings = bookingsList().map(function (b) { return { sessionId: b.sessionId, bikeId: b.bikeId, size: b.size }; });
    var payload = {
      bookings: bookings, person: state.person, privacy: true,
      waiver: { accepted: true, version: C.WAIVER_VERSION, signature: $("#waiver-signature").value.trim(), acceptedAt: new Date().toISOString() }
    };
    state.submitting = true; $("#btn-next").textContent = "Enviando…"; updateNext();
    var done = DEMO ? demoSubmit(payload) : fetch(C.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
    done.then(function (res) {
      state.submitting = false; $("#btn-next").textContent = "Confirmar reserva";
      if (res && res.ok) return success(res.ref);
      handleError(res || { error: "SERVER" });
    }).catch(function () {
      state.submitting = false; $("#btn-next").textContent = "Confirmar reserva"; updateNext();
      showSubmitError("No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
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
      state.picks = { mtb: null, gravel: null };
      loadAvailability().then(function () { go(2); });
      return;
    }
    var map = {
      UNDERAGE: "Solo pueden participar personas mayores de 18 años.",
      DUPLICATE: "Ya existe una reserva con este correo para ese test.",
      WAIVER: "No se ha podido validar la aceptación del descargo. Revisa la firma (debe coincidir con tu nombre y apellidos).",
      INVALID: res.detail || "Algún dato no es válido. Revísalos e inténtalo de nuevo."
    };
    showSubmitError(map[res.error] || "Ha ocurrido un error al guardar la reserva. Inténtalo de nuevo en unos minutos.");
  }

  function success(ref) {
    $("#done-ref").textContent = ref;
    $("#done-summary").innerHTML = summaryHTML(null, false);
    $("#done-note").textContent = DEMO ? "Modo demostración: esta reserva solo existe en este navegador." :
      "Te hemos enviado la confirmación a " + state.person.email + ". Recuerda llevar casco (obligatorio) y tu documento de identidad.";
    $("#done-actions").innerHTML = '<button type="button" class="btn" id="dl-ics">Añadir al calendario</button>';
    $("#dl-ics").addEventListener("click", function () { downloadICS(ref); });
    state.lastRef = ref; state.submitting = false;
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
        "SUMMARY:Test SCOTT " + TYPE_SHORT[b.session.type] + " · " + bikeName(b.bike) + " (" + b.size + ")",
        "LOCATION:" + b.session.store + "\\, " + b.session.city,
        "DESCRIPTION:Referencia " + ref + ". Casco obligatorio. Lleva tu documento de identidad.", "END:VEVENT"].join("\r\n");
    }).join("\r\n");
    var ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SCOTT Experience 2027//ES\r\nCALSCALE:GREGORIAN\r\n" + ev + "\r\nEND:VCALENDAR\r\n";
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = "scott-experience-2027-" + ref + ".ics";
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function resetAll() {
    state.dayDate = null; state.enabled = { mtb: false, gravel: false }; state.picks = { mtb: null, gravel: null };
    state.person = null; state.waiverRead = false; state.notice = "";
    $("#kyc-form").reset(); $("#waiver-check").checked = false; $("#privacy-check").checked = false; $("#waiver-signature").value = "";
    $("#waiver").scrollTop = 0; $("#waiver-bar").style.width = "0";
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
      if (state.dayDate !== b.getAttribute("data-date")) { state.enabled = { mtb: false, gravel: false }; state.picks = { mtb: null, gravel: null }; }
      state.dayDate = b.getAttribute("data-date");
      $$(".day-card").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
      updateNext();
    });

    $("#tests-box").addEventListener("click", function (e) {
      var head = e.target.closest("[data-toggle]");
      if (head) {
        var t = head.getAttribute("data-toggle"); state.enabled[t] = !state.enabled[t]; if (!state.enabled[t]) state.picks[t] = null;
        refreshBlock(t); return;
      }
      var sz = e.target.closest(".size-btn");
      if (sz && !sz.disabled) {
        var type = sz.getAttribute("data-type");
        state.picks[type] = { bikeId: sz.getAttribute("data-bike"), size: sz.getAttribute("data-size") };
        refreshBlock(type);
      }
    });

    $("#btn-back").addEventListener("click", function () { if (state.step > 1) go(state.step - 1); });
    $("#btn-next").addEventListener("click", function () {
      var s = state.step;
      if (s === 1) { loadAvailability().then(function () { go(2); }); }
      else if (s === 2) { loadAvailability().then(function () {
        // por si el stock cambio mientras elegia
        var changed = false;
        ["mtb", "gravel"].forEach(function (t) {
          var p = state.picks[t]; if (!p) return;
          if (remaining(sessionFor(state.dayDate, t).id, bikeById(p.bikeId), p.size) === 0) { state.picks[t] = null; changed = true; }
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
    ["#waiver-check", "#privacy-check"].forEach(function (s) { $(s).addEventListener("change", updateNext); });
    $("#waiver-signature").addEventListener("input", updateNext);
    $("#open-privacy").addEventListener("click", function () { var d = $("#privacy-dialog"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); });
    $("#new-booking").addEventListener("click", resetAll);

    loadAvailability().then(function () { renderGallery(); go(1, { silent: true }); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
