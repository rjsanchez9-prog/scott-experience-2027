/**
 * SCOTT Experience 2027 - backend de reservas (Google Apps Script)
 *
 * Flujo:
 *   1. La web envia la reserva  -> se guarda como PENDIENTE y retiene las bicis HOLD_MINUTES minutos.
 *   2. El participante recibe un email con un enlace a la pagina de gestion (reserva.html).
 *   3. Alli pulsa "Confirmar" -> CONFIRMADA. Si no confirma a tiempo, la reserva caduca y la bici se libera.
 *   4. Desde el mismo enlace puede cancelar (CANCELADA) y la bici queda libre.
 * Controla el stock por sesion/modelo/talla en el servidor (sin sobreventa).
 * Instrucciones paso a paso: ../DEPLOY.md
 *
 * Nota: el runtime del proyecto es el antiguo (Rhino): codigo ES5 (var, function), sin flechas ni plantillas.
 */

// ===== CONFIGURACION (editar) =====
var ORGANIZER_EMAIL = 'CAMBIAR@tu-dominio.com';   // recibe aviso de cada reserva confirmada o cancelada
var SENDER_NAME     = 'SCOTT Experience 2027';
var SHEET_NAME      = 'Reservas';
var SPREADSHEET_ID  = '';   // vacio = script creado desde Extensiones > Apps Script de la propia hoja; si el script es independiente, pon aqui el ID de la hoja
var MANAGE_URL      = 'https://rjsanchez9-prog.github.io/scott-experience-2027/reserva.html';   // pagina de confirmar / cancelar
var WAIVER_URL      = 'https://rjsanchez9-prog.github.io/scott-experience-2027/assets/docs/descargo-v2-2027.docx';   // copia del texto aceptado (se envia en el email)
var WAIVER_VERSION  = 'v2-2027';   // v2: duracion 1 h - 1 h 30 min (cambiar tambien en js/config.js)

var HOLD_MINUTES            = 30;   // tiempo que se retiene la bici hasta confirmar por email
var MIN_FILL_SECONDS        = 8;    // una persona tarda mas que esto en rellenar el formulario (anti-bots)
var MAX_PENDING_PER_EMAIL   = 3;    // reservas pendientes de confirmar a la vez por email
var MAX_NEW_HOLDS_PER_10MIN = 40;   // tope global de reservas nuevas cada 10 min (freno a oleadas de bots)
// ==================================

// <STOCK-BEGIN> generado por tools/build_data.py
var STOCK = {"mtb-team-issue-carbon-black": {"S": 1, "M": 6, "XL": 1}, "mtb-world-cup-evo-rush-white-carbon-black": {"S": 1, "M": 1}, "mtb-world-cup-cumulus-white-carbon-black": {"L": 2}, "gravel-20-watery-black": {"S": 1, "M": 3, "L": 1, "XL": 1}, "gravel-20-mojito-green": {"M": 1}, "gravel-10-lupine-grey": {"M": 1}};
var BIKES = {"mtb-team-issue-carbon-black": {"type": "mtb", "label": "Spark RC Team Issue · Carbon Black"}, "mtb-world-cup-evo-rush-white-carbon-black": {"type": "mtb", "label": "Spark RC World Cup EVO · Rush White / Carbon Black"}, "mtb-world-cup-cumulus-white-carbon-black": {"type": "mtb", "label": "Spark RC World Cup · Cumulus White / Carbon Black"}, "gravel-20-watery-black": {"type": "gravel", "label": "Addict Gravel 20 · Watery Black"}, "gravel-20-mojito-green": {"type": "gravel", "label": "Addict Gravel 20 · Mojito Green"}, "gravel-10-lupine-grey": {"type": "gravel", "label": "Addict Gravel 10 · Lupine Grey"}};
var SESSIONS = {"2026-12-11_algeciras_mtb_0930": {"type": "mtb", "date": "2026-12-11", "city": "Algeciras", "store": "Special Bikes", "start": "09:30", "end": "11:00", "arrive": "09:00", "map": "https://maps.app.goo.gl/Sm2qDsy3iYJcYGqA6"}, "2026-12-11_algeciras_gravel_1130": {"type": "gravel", "date": "2026-12-11", "city": "Algeciras", "store": "Special Bikes", "start": "11:30", "end": "13:00", "arrive": "11:00", "map": "https://maps.app.goo.gl/Sm2qDsy3iYJcYGqA6"}, "2026-12-12_malaga_mtb_0930": {"type": "mtb", "date": "2026-12-12", "city": "Málaga", "store": "Bike Philosophy", "start": "09:30", "end": "11:00", "arrive": "09:00", "map": "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9"}, "2026-12-12_malaga_gravel_1130": {"type": "gravel", "date": "2026-12-12", "city": "Málaga", "store": "Bike Philosophy", "start": "11:30", "end": "13:00", "arrive": "11:00", "map": "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9"}, "2026-12-12_malaga_mtb_1500": {"type": "mtb", "date": "2026-12-12", "city": "Málaga", "store": "Bike Philosophy", "start": "15:00", "end": "16:30", "arrive": "14:30", "map": "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9"}, "2026-12-13_malaga_mtb_0930": {"type": "mtb", "date": "2026-12-13", "city": "Málaga", "store": "Bike Philosophy", "start": "09:30", "end": "11:00", "arrive": "09:00", "map": "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9"}, "2026-12-13_malaga_gravel_1130": {"type": "gravel", "date": "2026-12-13", "city": "Málaga", "store": "Bike Philosophy", "start": "11:30", "end": "13:00", "arrive": "11:00", "map": "https://maps.app.goo.gl/jEWQp1VuHFSCoQHi9"}, "2026-12-14_cordoba_mtb_0930": {"type": "mtb", "date": "2026-12-14", "city": "Córdoba", "store": "Córdoba Bike", "start": "09:30", "end": "11:00", "arrive": "09:00", "map": "https://maps.app.goo.gl/A6LpH7HkqhRABzZA7"}, "2026-12-14_cordoba_gravel_1130": {"type": "gravel", "date": "2026-12-14", "city": "Córdoba", "store": "Córdoba Bike", "start": "11:30", "end": "13:00", "arrive": "11:00", "map": "https://maps.app.goo.gl/A6LpH7HkqhRABzZA7"}, "2026-12-15_andujar_mtb_0930": {"type": "mtb", "date": "2026-12-15", "city": "Andújar", "store": "Kanina Bikes Andújar", "start": "09:30", "end": "11:00", "arrive": "09:00", "map": "https://maps.app.goo.gl/7miXMEmDyBrKGWtb8"}, "2026-12-15_andujar_gravel_1130": {"type": "gravel", "date": "2026-12-15", "city": "Andújar", "store": "Kanina Bikes Andújar", "start": "11:30", "end": "13:00", "arrive": "11:00", "map": "https://maps.app.goo.gl/7miXMEmDyBrKGWtb8"}};
// <STOCK-END>

var HEADERS = ['Fecha registro', 'Referencia', 'Fecha test', 'Hora', 'Ciudad', 'Tienda', 'Test', 'Modelo',
  'Talla', 'Nombre', 'Apellidos', 'DNI/NIE/Pasaporte', 'Fecha nacimiento', 'Telefono', 'Email',
  'Contacto emergencia', 'Telefono emergencia', 'Descargo aceptado', 'Version descargo', 'Firma (nombre)',
  'Fecha/hora aceptacion', 'Tratamiento datos aceptado', 'Estado', 'Token', 'Caduca (ms)', 'Ultimo cambio de estado'];
var COL_REF = 1, COL_EMAIL = 14, COL_DOC = 11, COL_ESTADO = 22, COL_TOKEN = 23, COL_CADUCA = 24;   // indices 0-based en la fila

var _sheet = null;
function getSheet_() {
  if (_sheet) return _sheet;
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    // Todo como texto: evita que Sheets convierta "2026-12-11" en fecha y rompa el control de stock
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  } else {
    // Hoja creada con una version anterior: anade las columnas nuevas (Token, Caduca, Ultimo cambio)
    var hdr = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
    if (String(hdr[HEADERS.length - 1]) !== HEADERS[HEADERS.length - 1]) {
      sh.getRange(1, 24, sh.getMaxRows(), HEADERS.length - 23).setNumberFormat('@');
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
  }
  _sheet = sh;
  return sh;
}

// Todas las filas de datos con su numero de fila en la hoja
function allRows_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) out.push({ n: i + 2, r: vals[i] });
  return out;
}

function expMs_(r) { return Number(r[COL_CADUCA]) || 0; }

// Una fila ocupa stock si esta CONFIRMADA o si es PENDIENTE y aun no ha caducado
function rowActive_(r, nowMs) {
  var st = String(r[COL_ESTADO]);
  if (st === 'CONFIRMADA') return true;
  if (st === 'PENDIENTE') return expMs_(r) > nowMs;
  return false;
}

// Cuenta bicis ocupadas por clave "sesion|bici|talla" (opcionalmente ignorando una referencia)
function countBooked_(rows, nowMs, excludeRef) {
  var booked = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i].r;
    if (!rowActive_(r, nowMs)) continue;
    if (excludeRef && String(r[COL_REF]) === excludeRef) continue;
    var key = sid_(r[2], r[4], r[6], r[3]) + '|' + findBikeId_(r[7]) + '|' + r[8];
    booked[key] = (booked[key] || 0) + 1;
  }
  return booked;
}

// Id de sesion a partir de una fila de la hoja: fecha_ciudad_tipo_HHMM  (p. ej. 2026-12-12_malaga_mtb_1500)
function sid_(date, city, type, hora) {
  var hhmm = String(hora).slice(0, 5).replace(':', '');
  return txt_(date) + '_' + slug_(city) + '_' + type + '_' + hhmm;
}

// Sheets puede devolver "2026-12-15" como objeto Date: lo normalizamos siempre a texto yyyy-MM-dd
function txt_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd');
  return String(v);
}

// Minusculas, sin tildes y sin espacios repetidos: para comparar nombres y documentos
function fold_(s) {
  return String(s).toLowerCase().replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e').replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n').replace(/ç/g, 'c').replace(/\s+/g, ' ').trim();
}
function docKey_(s) { return fold_(s).replace(/[^a-z0-9]/g, ''); }

function slug_(s) {
  return String(s).toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function findBikeId_(label) {
  for (var id in BIKES) { if (BIKES[id].label === label) return id; }
  return label;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function nowText_() { return Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss'); }

function setState_(sh, n, estado, caducaMs) {
  sh.getRange(n, COL_ESTADO + 1).setValue(estado);
  sh.getRange(n, COL_CADUCA + 1).setValue(caducaMs == null ? '' : String(caducaMs));
  sh.getRange(n, 26).setValue(nowText_());
}

// Filas de una referencia (todas las pruebas de una misma reserva)
function rowsOfRef_(rows, ref) {
  var mine = [];
  for (var i = 0; i < rows.length; i++) if (String(rows[i].r[COL_REF]) === ref) mine.push(rows[i]);
  return mine;
}

// CANCELADA > CONFIRMADA > EXPIRADA > PENDIENTE
function refState_(mine, nowMs) {
  var allConf = true, anyExp = false;
  for (var i = 0; i < mine.length; i++) {
    var st = String(mine[i].r[COL_ESTADO]);
    if (st === 'CANCELADA') return 'CANCELADA';
    if (st !== 'CONFIRMADA') allConf = false;
    if (st === 'EXPIRADA' || (st === 'PENDIENTE' && expMs_(mine[i].r) <= nowMs)) anyExp = true;
  }
  if (allConf) return 'CONFIRMADA';
  return anyExp ? 'EXPIRADA' : 'PENDIENTE';
}

function itemsOf_(mine) {
  var out = [];
  for (var i = 0; i < mine.length; i++) {
    var r = mine[i].r, sid = sid_(r[2], r[4], r[6], r[3]), s = SESSIONS[sid] || {};
    out.push({ type: r[6], date: txt_(r[2]), start: s.start || String(r[3]).slice(0, 5), end: s.end || String(r[3]).slice(6, 11),
      arrive: s.arrive || '', store: r[5], city: r[4], map: s.map || '', bike: r[7], size: r[8] });
  }
  return out;
}

function linesOf_(items) {
  var lines = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    lines.push((it.type === 'mtb' ? 'MTB' : 'Gravel') + ' · ' + it.date + ' ' + it.start + '-' + it.end + ' · ' + it.store + ' (' + it.city + ')\n   Ubicacion: ' + it.map +
      '\n   Presentate a las ' + it.arrive + ' (30 minutos antes del inicio)\n   ' + it.bike + ' · talla ' + it.size);
  }
  return lines.join('\n\n');
}

function manageLink_(ref, token) { return MANAGE_URL + '?ref=' + encodeURIComponent(ref) + '&t=' + encodeURIComponent(token); }

function sendVerification_(email, nombre, ref, token, expMs, items) {
  var until = Utilities.formatDate(new Date(expMs), 'Europe/Madrid', 'HH:mm');
  var body = 'Hola ' + nombre + ',\n\nUn ultimo paso: confirma tu reserva del SCOTT Experience 2027 (ref. ' + ref + ').\n\n' + linesOf_(items) +
    '\n\nPULSA AQUI PARA CONFIRMAR (tienes hasta las ' + until + ', hora de Espana):\n' + manageLink_(ref, token) +
    '\n\nSi no confirmas a tiempo, la bicicleta se libera automaticamente para otras personas. Si no has hecho tu esta reserva, ignora este mensaje: no se confirmara.' +
    '\n\nDescargo de responsabilidad aceptado (' + WAIVER_VERSION + '): ' + WAIVER_URL +
    '\n\nRecuerda: llega 30 minutos antes del inicio de tu test. El test dura entre 1 h y 1 h 30 min. El casco es obligatorio y sin el no podras participar. Lleva tu DNI/NIE/pasaporte.' +
    '\nPara cancelar mas adelante, usa este mismo enlace.\n\nNos vemos en la ruta,\n' + SENDER_NAME;
  MailApp.sendEmail({ to: email, subject: 'Confirma tu reserva · SCOTT Experience 2027 · ' + ref, body: body, name: SENDER_NAME, replyTo: ORGANIZER_EMAIL });
}

// Aviso al organizador: solo si queda cuota diaria de sobra (la confirmacion al participante tiene prioridad)
function notifyOrganizer_(subject, text) {
  try {
    if (ORGANIZER_EMAIL && ORGANIZER_EMAIL.indexOf('CAMBIAR') === -1 && MailApp.getRemainingDailyQuota() >= 10) {
      MailApp.sendEmail({ to: ORGANIZER_EMAIL, subject: subject, body: text, name: SENDER_NAME });
    }
  } catch (x) { /* el aviso es secundario */ }
}

function personText_(r) {
  return String(r[9]) + ' ' + String(r[10]) + '\nTel: ' + r[13] + '\nEmail: ' + r[COL_EMAIL] + '\nEmergencia: ' + r[15] + ' ' + r[16];
}

// GET
//   ?action=availability                 -> { ok, booked: { "sesion|bici|talla": n } }
//   ?action=status&ref=...&t=...         -> estado y detalle de una reserva (requiere el token del email)
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || 'availability';
  if (action === 'availability') {
    return json_({ ok: true, booked: countBooked_(allRows_(getSheet_()), new Date().getTime(), '') });
  }
  if (action === 'status') {
    var rows = allRows_(getSheet_());
    var mine = rowsOfRef_(rows, String(p.ref || ''));
    var t = String(p.t || '');
    if (!mine.length || !t || String(mine[0].r[COL_TOKEN]) !== t) return json_({ ok: false, error: 'NOT_FOUND' });
    var nowMs = new Date().getTime();
    var r0 = mine[0].r;
    return json_({ ok: true, ref: String(p.ref), state: refState_(mine, nowMs), name: String(r0[9]) + ' ' + String(r0[10]).charAt(0) + '.',
      expiresAt: expMs_(r0), items: itemsOf_(mine) });
  }
  return json_({ ok: false, error: 'BAD_ACTION' });
}

function isAdult_(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return false;
  var now = new Date();
  var age = now.getFullYear() - d.getFullYear();
  var m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 18 && age < 100;
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 120); }

// Evita inyeccion de formulas en la hoja
function safe_(v) { var s = String(v); return /^[=+\-@]/.test(s) ? "'" + s : s; }

// POST (text/plain con JSON): create (por defecto) | confirm | cancel | resend
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var action = String(body.action || 'create');
    if (action === 'create') return create_(body);
    if (action === 'confirm') return confirm_(body);
    if (action === 'cancel') return cancel_(body);
    if (action === 'resend') return resend_(body);
    return json_({ ok: false, error: 'BAD_ACTION' });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function create_(body) {
  var p = body.person || {};
  var w = body.waiver || {};
  var bookings = body.bookings || [];
  var nowMs = new Date().getTime();
  var requestId = /^[A-Z0-9]{6,12}$/.test(String(body.requestId || '')) ? String(body.requestId) : '';
  var sh = getSheet_();
  var rows = allRows_(sh);

  // Reintento de una reserva ya guardada (p. ej. se perdio la respuesta): devolver la misma referencia sin duplicar
  if (requestId) {
    for (var q = 0; q < rows.length; q++) {
      var rr = String(rows[q].r[COL_REF]);
      if (rr.length > requestId.length && rr.slice(-(requestId.length + 1)) === '-' + requestId) {
        var same = rowsOfRef_(rows, rr);
        var stt = refState_(same, nowMs);
        if (stt === 'PENDIENTE' || stt === 'CONFIRMADA') return json_({ ok: true, ref: rr, retry: true, pending: stt === 'PENDIENTE', expiresAt: expMs_(same[0].r) });
        return json_({ ok: false, error: 'EXPIRED', detail: 'Tu reserva anterior caduco o se cancelo. Empieza de nuevo.' });
      }
    }
  }

  // --- Anti-abuso basico ---
  if (String(body.hp || '') !== '') return json_({ ok: false, error: 'INVALID', detail: 'Solicitud no valida.' });
  if (typeof body.elapsedMs !== 'number' || body.elapsedMs < MIN_FILL_SECONDS * 1000) return json_({ ok: false, error: 'TOO_FAST', detail: 'Has tardado demasiado poco en rellenar el formulario. Revisa los datos e intentalo de nuevo.' });
  var cache = CacheService.getScriptCache();
  var holdKey = 'holds_' + Math.floor(nowMs / 600000);
  if (Number(cache.get(holdKey) || 0) >= MAX_NEW_HOLDS_PER_10MIN) return json_({ ok: false, error: 'BUSY', detail: 'Hay mucha demanda ahora mismo. Vuelve a intentarlo en unos minutos.' });

  // --- Validacion ---
  if (!bookings.length || bookings.length > 2) return json_({ ok: false, error: 'INVALID', detail: 'Reserva vacia o con demasiados tests.' });
  var required = ['nombre', 'apellidos', 'documento', 'nacimiento', 'telefono', 'email', 'emergenciaNombre', 'emergenciaTelefono'];
  for (var i = 0; i < required.length; i++) {
    if (!clean_(p[required[i]])) return json_({ ok: false, error: 'INVALID', detail: 'Falta el campo ' + required[i] });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean_(p.email))) return json_({ ok: false, error: 'INVALID', detail: 'Email no valido.' });
  if (!isAdult_(clean_(p.nacimiento))) return json_({ ok: false, error: 'UNDERAGE', detail: 'Solo mayores de 18 anos.' });
  if (w.accepted !== true || w.version !== WAIVER_VERSION) return json_({ ok: false, error: 'WAIVER', detail: 'Debes aceptar el descargo de responsabilidad.' });
  var fullName = fold_(clean_(p.nombre) + ' ' + clean_(p.apellidos));
  if (fold_(clean_(w.signature)) !== fullName) return json_({ ok: false, error: 'WAIVER', detail: 'La firma debe coincidir con tu nombre y apellidos.' });
  if (body.privacy !== true) return json_({ ok: false, error: 'INVALID', detail: 'Debes aceptar el tratamiento de datos.' });

  var booked = countBooked_(rows, nowMs, '');
  var email = clean_(p.email).toLowerCase();

  // Un mismo documento no puede repetir sesion; mismo dia: maximo un test de cada tipo (el email puede compartirse)
  var docK = docKey_(clean_(p.documento, 30));
  var existing = {};
  var pendingRefs = {}, pendingCount = 0;
  for (var k = 0; k < rows.length; k++) {
    var r = rows[k].r;
    if (!rowActive_(r, nowMs)) continue;
    var dk = docKey_(r[COL_DOC]);
    existing[dk + '|' + sid_(r[2], r[4], r[6], r[3])] = true;
    existing[dk + '|day|' + txt_(r[2]) + '|' + r[6]] = true;   // mismo dia y tipo
    if (String(r[COL_ESTADO]) === 'PENDIENTE' && String(r[COL_EMAIL]).toLowerCase() === email && !pendingRefs[r[COL_REF]]) { pendingRefs[r[COL_REF]] = true; pendingCount++; }
  }
  if (pendingCount >= MAX_PENDING_PER_EMAIL) return json_({ ok: false, error: 'TOO_MANY', detail: 'Ya tienes reservas pendientes de confirmar con este email. Revisa tu correo o espera unos minutos a que caduquen.' });

  var seen = {};
  for (var j = 0; j < bookings.length; j++) {
    var b = bookings[j];
    var s = SESSIONS[b.sessionId];
    var bike = BIKES[b.bikeId];
    if (!s || !bike || bike.type !== s.type) return json_({ ok: false, error: 'INVALID', detail: 'Sesion o bicicleta no valida.' });
    if (!STOCK[b.bikeId] || !(b.size in STOCK[b.bikeId])) return json_({ ok: false, error: 'INVALID', detail: 'Talla no valida.' });
    if (seen[b.sessionId]) return json_({ ok: false, error: 'INVALID', detail: 'Sesion repetida.' });
    seen[b.sessionId] = true;
    var dayType = s.date + '|' + s.type;
    if (seen[dayType]) return json_({ ok: false, error: 'INVALID', detail: 'Solo un test de cada tipo por dia.' });
    seen[dayType] = true;
    if (existing[docK + '|day|' + s.date + '|' + s.type]) return json_({ ok: false, error: 'DUPLICATE', detail: 'Ya existe una reserva (confirmada o pendiente de confirmar) de este tipo de test ese dia con este documento.' });
    if (existing[docK + '|' + b.sessionId]) return json_({ ok: false, error: 'DUPLICATE', detail: 'Ya existe una reserva (confirmada o pendiente de confirmar) para este test con este documento.' });
    var key = b.sessionId + '|' + b.bikeId + '|' + b.size;
    if ((booked[key] || 0) >= STOCK[b.bikeId][b.size]) {
      return json_({ ok: false, error: 'SOLD_OUT', detail: 'Esa bicicleta/talla se acaba de agotar para este test.', key: key });
    }
  }

  if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'MAIL', detail: 'Ahora mismo no podemos enviar el email de confirmacion. Intentalo mas tarde.' });

  // --- Guardar como PENDIENTE (retiene el stock HOLD_MINUTES minutos) ---
  var ref = 'SCX-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'MMdd') + '-' + (requestId || Math.random().toString(36).slice(2, 8).toUpperCase());
  var token = Utilities.getUuid().replace(/-/g, '');
  var expMs = nowMs + HOLD_MINUTES * 60000;
  var now = nowText_();
  var acceptedAt = clean_(w.acceptedAt, 40) || now;
  var firstRow = sh.getLastRow() + 1;
  bookings.forEach(function (bk) {
    var se = SESSIONS[bk.sessionId];
    var bi = BIKES[bk.bikeId];
    sh.getRange(sh.getLastRow() + 1, 1, 1, HEADERS.length).setNumberFormat('@');
    sh.appendRow([now, ref, se.date, se.start + '-' + se.end, se.city, se.store, se.type, bi.label, bk.size,
      safe_(clean_(p.nombre)), safe_(clean_(p.apellidos)), safe_(clean_(p.documento, 30)), clean_(p.nacimiento, 10),
      safe_(clean_(p.telefono, 30)), email, safe_(clean_(p.emergenciaNombre)), safe_(clean_(p.emergenciaTelefono, 30)),
      'SI', WAIVER_VERSION, safe_(clean_(w.signature)), acceptedAt, 'SI', 'PENDIENTE', token, String(expMs), now]);
  });
  SpreadsheetApp.flush();

  // --- Email de confirmacion: si no se puede enviar, se deshace la reserva ---
  var mine = rowsOfRef_(allRows_(sh), ref);
  try {
    sendVerification_(email, clean_(p.nombre), ref, token, expMs, itemsOf_(mine));
  } catch (mailErr) {
    for (var m = 0; m < mine.length; m++) setState_(sh, mine[m].n, 'EXPIRADA', null);
    return json_({ ok: false, error: 'MAIL', detail: 'No hemos podido enviar el email de confirmacion. Comprueba la direccion o intentalo mas tarde.' });
  }
  cache.put(holdKey, String(Number(cache.get(holdKey) || 0) + 1), 700);
  return json_({ ok: true, ref: ref, pending: true, expiresAt: expMs });
}

// Localiza la reserva y valida el token del email
function findByToken_(body) {
  var sh = getSheet_();
  var rows = allRows_(sh);
  var ref = String(body.ref || ''), t = String(body.t || '');
  var mine = rowsOfRef_(rows, ref);
  if (!mine.length || !t || String(mine[0].r[COL_TOKEN]) !== t) return null;
  return { sh: sh, rows: rows, mine: mine, ref: ref };
}

function confirm_(body) {
  var f = findByToken_(body);
  if (!f) return json_({ ok: false, error: 'NOT_FOUND' });
  var nowMs = new Date().getTime();
  var st = refState_(f.mine, nowMs);
  if (st === 'CONFIRMADA') return json_({ ok: true, state: 'CONFIRMADA', ref: f.ref, items: itemsOf_(f.mine) });
  if (st === 'CANCELADA') return json_({ ok: false, error: 'CANCELLED', detail: 'Esta reserva fue cancelada.' });

  // PENDIENTE (o caducada): se puede confirmar si la bici sigue libre
  var booked = countBooked_(f.rows, nowMs, f.ref);
  var docK = docKey_(f.mine[0].r[COL_DOC]);
  for (var i = 0; i < f.mine.length; i++) {
    var r = f.mine[i].r, sid = sid_(r[2], r[4], r[6], r[3]), bikeId = findBikeId_(r[7]);
    var key = sid + '|' + bikeId + '|' + r[8];
    if (STOCK[bikeId] && (booked[key] || 0) >= STOCK[bikeId][r[8]]) return json_({ ok: false, error: 'SOLD_OUT', detail: 'Esa bicicleta ya no esta disponible.' });
  }
  for (var d = 0; d < f.rows.length; d++) {   // que no haya otra reserva activa del mismo documento para lo mismo
    var o = f.rows[d].r;
    if (String(o[COL_REF]) === f.ref || !rowActive_(o, nowMs) || docKey_(o[COL_DOC]) !== docK) continue;
    for (var c = 0; c < f.mine.length; c++) {
      var m = f.mine[c].r;
      if (sid_(o[2], o[4], o[6], o[3]) === sid_(m[2], m[4], m[6], m[3]) || (txt_(o[2]) === txt_(m[2]) && o[6] === m[6])) return json_({ ok: false, error: 'DUPLICATE', detail: 'Ya tienes otra reserva activa para ese test.' });
    }
  }
  for (var n = 0; n < f.mine.length; n++) setState_(f.sh, f.mine[n].n, 'CONFIRMADA', null);
  SpreadsheetApp.flush();
  var items = itemsOf_(f.mine);
  notifyOrganizer_('Reserva confirmada ' + f.ref + ' · ' + f.mine[0].r[9] + ' ' + f.mine[0].r[10], 'Reserva CONFIRMADA (ref. ' + f.ref + ')\n\n' + linesOf_(items) + '\n\n' + personText_(f.mine[0].r));
  return json_({ ok: true, state: 'CONFIRMADA', ref: f.ref, items: items });
}

function cancel_(body) {
  var f = findByToken_(body);
  if (!f) return json_({ ok: false, error: 'NOT_FOUND' });
  var nowMs = new Date().getTime();
  var st = refState_(f.mine, nowMs);
  if (st === 'CANCELADA') return json_({ ok: true, state: 'CANCELADA', ref: f.ref });
  for (var i = 0; i < f.mine.length; i++) {
    var cur = String(f.mine[i].r[COL_ESTADO]);
    if (cur === 'CONFIRMADA' || cur === 'PENDIENTE') setState_(f.sh, f.mine[i].n, 'CANCELADA', null);
  }
  SpreadsheetApp.flush();
  if (st === 'CONFIRMADA') {
    notifyOrganizer_('Reserva CANCELADA ' + f.ref + ' · ' + f.mine[0].r[9] + ' ' + f.mine[0].r[10], 'El participante ha cancelado su reserva (ref. ' + f.ref + '). Las bicis quedan libres.\n\n' + linesOf_(itemsOf_(f.mine)) + '\n\n' + personText_(f.mine[0].r));
  }
  return json_({ ok: true, state: 'CANCELADA', ref: f.ref });
}

// Reenviar el email de confirmacion (maximo 2 veces por reserva)
function resend_(body) {
  var ref = String(body.ref || '');
  var sh = getSheet_();
  var rows = allRows_(sh);
  var mine = rowsOfRef_(rows, ref);
  var nowMs = new Date().getTime();
  if (!mine.length || refState_(mine, nowMs) !== 'PENDIENTE') return json_({ ok: false, error: 'NOT_FOUND' });
  var cache = CacheService.getScriptCache();
  var key = 'resend_' + ref;
  var n = Number(cache.get(key) || 0);
  if (n >= 2) return json_({ ok: false, error: 'RATE', detail: 'Ya hemos reenviado el email dos veces. Revisa tambien la carpeta de spam.' });
  if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: 'MAIL', detail: 'No podemos enviar emails ahora mismo. Intentalo mas tarde.' });
  var r0 = mine[0].r;
  try {
    sendVerification_(String(r0[COL_EMAIL]), String(r0[9]), ref, String(r0[COL_TOKEN]), expMs_(r0), itemsOf_(mine));
  } catch (x) {
    return json_({ ok: false, error: 'MAIL', detail: 'No hemos podido enviar el email.' });
  }
  cache.put(key, String(n + 1), 1800);
  return json_({ ok: true });
}
