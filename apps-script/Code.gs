/**
 * SCOTT Experience 2027 - backend de reservas (Google Apps Script)
 *
 * Guarda cada reserva en una hoja de Google Sheets, controla el stock por
 * sesion/modelo/talla (sin sobreventa) y envia el email de confirmacion.
 * Instrucciones paso a paso: ../DEPLOY.md
 */

// ===== CONFIGURACION (editar) =====
var ORGANIZER_EMAIL = 'CAMBIAR@tu-dominio.com';   // recibe copia de cada reserva
var SENDER_NAME     = 'SCOTT Experience 2027';
var SHEET_NAME      = 'Reservas';
var SPREADSHEET_ID  = '';   // vacio = script creado desde Extensiones > Apps Script de la propia hoja; si el script es independiente, pon aqui el ID de la hoja
var WAIVER_VERSION  = 'v1-2027';
// ==================================

// <STOCK-BEGIN> generado por tools/build_data.py
var STOCK = {"mtb-team-issue-carbon-black": {"S": 1, "M": 6, "XL": 1}, "mtb-world-cup-evo-rush-white-carbon-black": {"S": 1, "M": 1}, "mtb-world-cup-cumulus-white-carbon-black": {"L": 2}, "gravel-20-watery-black": {"S": 1, "M": 3, "L": 1, "XL": 1}, "gravel-20-mojito-green": {"M": 1}, "gravel-10-lupine-grey": {"M": 1}};
var BIKES = {"mtb-team-issue-carbon-black": {"type": "mtb", "label": "Spark RC Team Issue · Carbon Black"}, "mtb-world-cup-evo-rush-white-carbon-black": {"type": "mtb", "label": "Spark RC World Cup EVO · Rush White / Carbon Black"}, "mtb-world-cup-cumulus-white-carbon-black": {"type": "mtb", "label": "Spark RC World Cup · Cumulus White / Carbon Black"}, "gravel-20-watery-black": {"type": "gravel", "label": "Addict Gravel 20 · Watery Black"}, "gravel-20-mojito-green": {"type": "gravel", "label": "Addict Gravel 20 · Mojito Green"}, "gravel-10-lupine-grey": {"type": "gravel", "label": "Addict Gravel 10 · Lupine Grey"}};
var SESSIONS = {"2026-12-11_algeciras_mtb": {"type": "mtb", "date": "2026-12-11", "city": "Algeciras", "store": "Special Bikes", "start": "09:30", "end": "11:00"}, "2026-12-11_algeciras_gravel": {"type": "gravel", "date": "2026-12-11", "city": "Algeciras", "store": "Special Bikes", "start": "11:30", "end": "13:00"}, "2026-12-12_malaga_mtb": {"type": "mtb", "date": "2026-12-12", "city": "Málaga", "store": "Bike Philosophy", "start": "09:30", "end": "11:00"}, "2026-12-12_malaga_gravel": {"type": "gravel", "date": "2026-12-12", "city": "Málaga", "store": "Bike Philosophy", "start": "11:30", "end": "13:00"}, "2026-12-13_malaga_mtb": {"type": "mtb", "date": "2026-12-13", "city": "Málaga", "store": "Bike Philosophy", "start": "09:30", "end": "11:00"}, "2026-12-13_malaga_gravel": {"type": "gravel", "date": "2026-12-13", "city": "Málaga", "store": "Bike Philosophy", "start": "11:30", "end": "13:00"}, "2026-12-14_cordoba_mtb": {"type": "mtb", "date": "2026-12-14", "city": "Córdoba", "store": "Córdoba Bike", "start": "09:30", "end": "11:00"}, "2026-12-14_cordoba_gravel": {"type": "gravel", "date": "2026-12-14", "city": "Córdoba", "store": "Córdoba Bike", "start": "11:30", "end": "13:00"}, "2026-12-15_andujar_mtb": {"type": "mtb", "date": "2026-12-15", "city": "Andújar", "store": "Kanina Bikes Andújar", "start": "09:30", "end": "11:00"}, "2026-12-15_andujar_gravel": {"type": "gravel", "date": "2026-12-15", "city": "Andújar", "store": "Kanina Bikes Andújar", "start": "11:30", "end": "13:00"}};
// <STOCK-END>

var HEADERS = ['Fecha registro', 'Referencia', 'Fecha test', 'Hora', 'Ciudad', 'Tienda', 'Test', 'Modelo',
  'Talla', 'Nombre', 'Apellidos', 'DNI/NIE/Pasaporte', 'Fecha nacimiento', 'Telefono', 'Email',
  'Contacto emergencia', 'Telefono emergencia', 'Descargo aceptado', 'Version descargo', 'Firma (nombre)',
  'Fecha/hora aceptacion', 'Tratamiento datos aceptado', 'Estado'];

function getSheet_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    // Todo como texto: evita que Sheets convierta "2026-12-11" en fecha y rompa el control de stock
    sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

// Cuenta reservas activas por clave "sesion|bici|talla"
function countBooked_(sh) {
  var booked = {};
  var last = sh.getLastRow();
  if (last < 2) return booked;
  var rows = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  rows.forEach(function (r) {
    if (String(r[22]) === 'CANCELADA') return;
    var sessionId = r[2] + '_' + slug_(r[4]) + '_' + r[6];
    var key = sessionId + '|' + findBikeId_(r[7]) + '|' + r[8];
    booked[key] = (booked[key] || 0) + 1;
  });
  return booked;
}

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

// GET ?action=availability  ->  { ok: true, booked: { "sesion|bici|talla": n } }
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'availability';
  if (action !== 'availability') return json_({ ok: false, error: 'BAD_ACTION' });
  return json_({ ok: true, booked: countBooked_(getSheet_()) });
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

// POST (text/plain con JSON)
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    var p = body.person || {};
    var w = body.waiver || {};
    var bookings = body.bookings || [];

    // --- Validacion ---
    if (!bookings.length || bookings.length > 2) return json_({ ok: false, error: 'INVALID', detail: 'Reserva vacia o con demasiados tests.' });
    var required = ['nombre', 'apellidos', 'documento', 'nacimiento', 'telefono', 'email', 'emergenciaNombre', 'emergenciaTelefono'];
    for (var i = 0; i < required.length; i++) {
      if (!clean_(p[required[i]])) return json_({ ok: false, error: 'INVALID', detail: 'Falta el campo ' + required[i] });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean_(p.email))) return json_({ ok: false, error: 'INVALID', detail: 'Email no valido.' });
    if (!isAdult_(clean_(p.nacimiento))) return json_({ ok: false, error: 'UNDERAGE', detail: 'Solo mayores de 18 anos.' });
    if (w.accepted !== true || w.version !== WAIVER_VERSION) return json_({ ok: false, error: 'WAIVER', detail: 'Debes aceptar el descargo de responsabilidad.' });
    var fullName = (clean_(p.nombre) + ' ' + clean_(p.apellidos)).toLowerCase().replace(/\s+/g, ' ');
    if (clean_(w.signature).toLowerCase().replace(/\s+/g, ' ') !== fullName) return json_({ ok: false, error: 'WAIVER', detail: 'La firma debe coincidir con tu nombre y apellidos.' });
    if (body.privacy !== true) return json_({ ok: false, error: 'INVALID', detail: 'Debes aceptar el tratamiento de datos.' });

    var sh = getSheet_();
    var booked = countBooked_(sh);
    var email = clean_(p.email).toLowerCase();

    // Un mismo email no puede repetir sesion; mismo dia: maximo un test de cada tipo
    var existing = {};
    var last = sh.getLastRow();
    if (last > 1) {
      sh.getRange(2, 1, last - 1, HEADERS.length).getValues().forEach(function (r) {
        if (String(r[22]) !== 'CANCELADA') existing[String(r[14]).toLowerCase() + '|' + r[2] + '_' + slug_(r[4]) + '_' + r[6]] = true;
      });
    }

    var seen = {};
    for (var j = 0; j < bookings.length; j++) {
      var b = bookings[j];
      var s = SESSIONS[b.sessionId];
      var bike = BIKES[b.bikeId];
      if (!s || !bike || bike.type !== s.type) return json_({ ok: false, error: 'INVALID', detail: 'Sesion o bicicleta no valida.' });
      if (!STOCK[b.bikeId] || !(b.size in STOCK[b.bikeId])) return json_({ ok: false, error: 'INVALID', detail: 'Talla no valida.' });
      if (seen[b.sessionId]) return json_({ ok: false, error: 'INVALID', detail: 'Sesion repetida.' });
      seen[b.sessionId] = true;
      if (existing[email + '|' + b.sessionId]) return json_({ ok: false, error: 'DUPLICATE', detail: 'Ya tienes una reserva para este test con este email.' });
      var key = b.sessionId + '|' + b.bikeId + '|' + b.size;
      if ((booked[key] || 0) >= STOCK[b.bikeId][b.size]) {
        return json_({ ok: false, error: 'SOLD_OUT', detail: 'Esa bicicleta/talla se acaba de agotar para este test.', key: key });
      }
    }

    // --- Guardar ---
    var ref = 'SCX-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'MMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    var now = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss');
    var acceptedAt = clean_(w.acceptedAt, 40) || now;
    var lines = [];
    bookings.forEach(function (b) {
      var s = SESSIONS[b.sessionId];
      var bike = BIKES[b.bikeId];
      sh.appendRow([now, ref, s.date, s.start + '-' + s.end, s.city, s.store, s.type, bike.label, b.size,
        safe_(clean_(p.nombre)), safe_(clean_(p.apellidos)), safe_(clean_(p.documento, 30)), clean_(p.nacimiento, 10),
        safe_(clean_(p.telefono, 30)), email, safe_(clean_(p.emergenciaNombre)), safe_(clean_(p.emergenciaTelefono, 30)),
        'SI', WAIVER_VERSION, safe_(clean_(w.signature)), acceptedAt, 'SI', 'CONFIRMADA']);
      lines.push((s.type === 'mtb' ? 'MTB' : 'Gravel') + ' · ' + s.date + ' ' + s.start + '-' + s.end + ' · ' + s.store + ' (' + s.city + ')\n   ' + bike.label + ' · talla ' + b.size);
    });
    SpreadsheetApp.flush();

    // --- Emails ---
    var text = 'Hola ' + clean_(p.nombre) + ',\n\nTu reserva para el SCOTT Experience 2027 esta confirmada (ref. ' + ref + ').\n\n' +
      lines.join('\n\n') + '\n\nRecuerda: el casco es obligatorio y sin el no podras participar. Lleva tu DNI/NIE/pasaporte.\n' +
      'Si no puedes asistir, responde a este correo para liberar la bicicleta.\n\nNos vemos en la ruta,\n' + SENDER_NAME;
    try {
      MailApp.sendEmail({ to: email, subject: 'Reserva confirmada · SCOTT Experience 2027 · ' + ref, body: text, name: SENDER_NAME, replyTo: ORGANIZER_EMAIL });
      if (ORGANIZER_EMAIL && ORGANIZER_EMAIL.indexOf('CAMBIAR') === -1) {
        MailApp.sendEmail({ to: ORGANIZER_EMAIL, subject: 'Nueva reserva ' + ref + ' · ' + clean_(p.nombre) + ' ' + clean_(p.apellidos), body: text + '\n\nTel: ' + clean_(p.telefono) + '\nEmail: ' + email, name: SENDER_NAME });
      }
    } catch (mailErr) { /* la reserva ya esta guardada; no se bloquea al usuario */ }

    return json_({ ok: true, ref: ref });
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', detail: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
