# Publicar la landing · Test SCOTT Experience 2027

La carpeta `landing-scott-experience-2027/` es una web estática (sin instalación ni build).
Se publica en 3 pasos: **(1)** crear la hoja y el backend de reservas, **(2)** publicar la carpeta en un hosting con enlace público, **(3)** fijar el dominio para la vista previa de WhatsApp.

## Publicado en GitHub Pages

- Repositorio: https://github.com/rjsanchez9-prog/scott-experience-2027
- Enlace público: https://rjsanchez9-prog.github.io/scott-experience-2027/
- El dominio ya está fijado en las etiquetas de WhatsApp. Para actualizar la web: edita los archivos, `git commit` y `git push` (Pages se republica solo en ~1 minuto).
- Lo único que falta para recibir reservas reales es el **paso 1** (Apps Script + `API_URL` en `js/config.js`). Los pasos 2 y 3 de abajo son la alternativa Netlify y ya no son necesarios.

## 1 · Backend de reservas (Google Sheets + email)

1. Crea una hoja de cálculo nueva en Google Sheets, por ejemplo «Reservas SCOTT Experience 2027». Solo debe tener acceso quien gestione el test (contiene DNI y datos de emergencia).
2. Menú **Extensiones → Apps Script**. Borra el contenido y pega todo `apps-script/Code.gs`.
3. Cambia `ORGANIZER_EMAIL` (arriba del archivo) por el correo que recibirá copia de cada reserva.
4. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Autoriza los permisos (hoja + envío de correo) y copia la **URL de la aplicación web** (termina en `/exec`).
5. Pega esa URL en `js/config.js`:
   ```js
   API_URL: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```
   Con `API_URL` vacío la web funciona en **modo demostración** (aviso amarillo, reservas solo en el navegador).

Qué hace el backend: guarda una fila por test reservado (con firma y fecha de aceptación del descargo), **comprueba el stock en el servidor** (no hay sobreventa aunque dos personas reserven a la vez), evita duplicados por email y envía la confirmación al participante y a la organización. Para cancelar una reserva y liberar la bici, escribe `CANCELADA` en la columna «Estado».

> Si cambias el Excel de bicis: ejecuta `python3 -I tools/build_data.py` (regenera `js/data.js` y el stock de `Code.gs`), vuelve a pegar `Code.gs` y crea una **nueva versión** de la implementación.

## 2 · Publicar con enlace abierto

Opción más rápida (sin cuenta de desarrollador): **Netlify Drop**
1. Entra en <https://app.netlify.com/drop>.
2. Arrastra la carpeta `landing-scott-experience-2027` completa.
3. Netlify te da un enlace público `https://xxxx.netlify.app` (puedes cambiar el nombre en *Site settings → Change site name*, o conectar un dominio propio).

Alternativas equivalentes: Vercel, Cloudflare Pages o GitHub Pages (subir la carpeta tal cual).

## 3 · Vista previa de WhatsApp (imagen de cabecera)

WhatsApp necesita URLs absolutas. Con el enlace ya conocido:
```bash
tools/set_domain.sh https://xxxx.netlify.app
```
Vuelve a publicar la carpeta. La imagen es `assets/img/og-scott-experience-2027.jpg` (1200×630). Si quieres rehacerla: edita `tools/og-source.html` y ejecuta `tools/make_og.sh`.

Notas WhatsApp: guarda en caché la vista previa de cada enlace; para forzar la actualización comparte el enlace con un parámetro nuevo (`…/?v=2`). Pruébalo enviándote el enlace a ti mismo antes de difundirlo.

## Checklist antes de difundir
- [ ] `API_URL` rellena y una reserva de prueba aparece en la hoja (bórrala después) y llega el email.
- [ ] `tools/set_domain.sh` ejecutado y carpeta republicada.
- [ ] Revisado el texto de «tratamiento de datos» (`index.html`, diálogo `#privacy-dialog`) con quien lleve la protección de datos.
- [ ] Enlace probado en WhatsApp (vista previa con imagen).

## Confirmación por email, cancelación y anti-abuso (v6)

**Flujo de una reserva:** la web la guarda como `PENDIENTE` y retiene las bicis 30 min → el participante recibe un email con un enlace a `reserva.html` → pulsa «Confirmar mi reserva» (`CONFIRMADA`) o «Cancelar» (`CANCELADA`). Si no confirma a tiempo caduca (`EXPIRADA`) y la bici se libera sola. Cada confirmación o cancelación te llega por email (si queda cuota diaria).

**Estados en la columna «Estado» de la hoja:** `PENDIENTE`, `CONFIRMADA`, `CANCELADA`, `EXPIRADA`. Las columnas «Token», «Caduca (ms)» y «Último cambio de estado» las gestiona el script; no las edites. Para cancelar a mano una reserva, escribe `CANCELADA` en «Estado» (libera el stock).

**Ajustes** (arriba de `apps-script/Code.gs`): `HOLD_MINUTES` (30), `MAX_PENDING_PER_EMAIL` (3 pendientes a la vez por email), `MAX_NEW_HOLDS_PER_10MIN` (40 reservas nuevas cada 10 min, freno a oleadas), `MIN_FILL_SECONDS` (8), `MANAGE_URL` (si cambias de dominio, cámbialo aquí).

**Anti-abuso incluido:** email verificado antes de confirmar; retención temporal; límite por email y global; campo trampa (honeypot) y tiempo mínimo; duplicados por documento; token secreto en cada enlace; confirmar/cancelar exige pulsar un botón (los analizadores de enlaces del correo no actúan solos).
**No incluido todavía:** captcha (p. ej. Cloudflare Turnstile). Un atacante decidido aún podría retener bicis 30 min repetidamente; el captcha lo evita. Requiere una cuenta de Cloudflare y volver a autorizar el script (acceso a servicios externos).

> Al cambiar `Code.gs`: pega el código en el editor de Apps Script (con tu email en `ORGANIZER_EMAIL` y el ID de la hoja en `SPREADSHEET_ID`) y publica una **versión nueva** de la implementación para mantener la URL.

## Guía de tallas
Los rangos de altura salen de las guías oficiales (`guia tallas spark rc.tiff` y `guia tallas addict gravel.tiff`), medidos sobre los gráficos; están en `tools/build_data.py` (`size_guide`). Si SCOTT actualiza la guía, cambia ahí los rangos y las imágenes de `assets/img/guides/` y ejecuta `python3 -I tools/build_data.py`.

## Cambios de la v7/v8 (confirmación directa, peso/sillín, coordinadores)

- **Confirmación directa:** `REQUIRE_EMAIL_CONFIRMATION = false` (en `Code.gs`). La reserva queda `CONFIRMADA` al enviarla y el participante recibe **un solo email** con los datos y un enlace para cancelar (`reserva.html`). El modo anterior (validar por email en 30 min) sigue en el código: pon `true` para reactivarlo.
- **Formulario:** «Peso (kg)» obligatorio y «Altura de sillín (cm)» opcional; se guardan en las columnas «Peso (kg)» y «Altura sillin (cm)» (al final de la hoja).
- **Descargo:** ya no se firma con el nombre; se marcan las casillas «he leído y comprendido» y «acepto». En la hoja, la columna «Firma (nombre)» queda como «Casillas de lectura y aceptacion (sin firma)».
- **Avisos al equipo:** cada reserva nueva o cancelada se envía al organizador (`ORGANIZER_EMAIL`) y, si `NOTIFY_COORDINATORS = true`, al coordinador de la tienda correspondiente (`STORE_COORDINATORS`). **Activado desde la v10 (versión definitiva)**; para apagarlo: poner `false` en la copia de Google y publicar una versión nueva. El coordinador recibe nombre, teléfono, email, peso, altura de sillín, bici y talla; **no** el DNI, la fecha de nacimiento ni el contacto de emergencia.
- **Datos que solo viven en la copia de Google:** `ORGANIZER_EMAIL`, `SPREADSHEET_ID` y `STORE_COORDINATORS` se rellenan únicamente en el editor de Apps Script (los correos de terceros no se publican en este repositorio). Al pegar `Code.gs` de nuevo, vuelve a rellenarlos.
- **Cuota de emails:** cada reserva envía hasta 3 correos (participante, organizador y coordinador). Con una cuenta Gmail gratuita (~100 destinatarios al día) caben unas 30–35 reservas diarias; el participante tiene prioridad y las copias se omiten si queda poca cuota.

## Hojas de solo lectura por tienda
La hoja principal («Reservas SCOTT Experience 2027») solo la ve el propietario. Cada coordinador ve una hoja aparte que se alimenta de la principal en directo con `IMPORTRANGE` + `QUERY`, filtrada por su tienda (`Col6 = 'Bike Philosophy'`) y **sin** DNI, fecha de nacimiento, contacto de emergencia ni token. Columnas visibles: fecha del test, hora, test, modelo, talla, nombre, apellidos, teléfono, email, peso, altura de sillín, estado, referencia y fecha de registro.
Hoy existen las cuatro («Reservas <tienda> (solo lectura)»): las cuatro están compartidas como Lector con su coordinador. La de Special Bikes se compartió con un correo sin cuenta de Google, por decisión expresa: esa invitación abre la hoja sin iniciar sesión (quien tenga el enlace puede entrar). Si se prefiere más control, compartirla con una cuenta de Google y retirar ese acceso. Para otra tienda: duplicar esa hoja, cambiar el nombre de la tienda en la fórmula de A1 y compartirla como Lector. En una cuenta con idioma español, la fórmula lleva `;` como separador de argumentos.

## Recordatorio 72 h antes (v9)
- Un activador horario (Activadores → `sendReminders`, basado en tiempo, cada hora) envía **un email por reserva** 72 h antes del inicio de su primer test (`REMINDER_HOURS`). Incluye los datos, la hora de llegada, el casco, el documento de identidad y el enlace para cancelar.
- **Sin plazo y sin cancelaciones automáticas:** si el participante no responde, la reserva sigue en pie; solo se cancela si el propio participante lo hace desde su enlace.
- Se marca en la columna 29 «Recordatorio 72h» (`ENVIADO fecha hora`), así que no se repite. Las reservas hechas dentro de las 72 h previas, o si el activador se retrasa hasta menos de 2 h del test, se marcan `NO APLICA` (el email de confirmación ya cumple esa función).
- Máx. 30 por ejecución y se detiene si queda poca cuota de correo (reintenta en la hora siguiente). Solo escribe a los participantes: nunca a organizador ni coordinadores.
- Autoprueba: ejecutar `pruebaRecordatorio` en el editor (crea una reserva ficticia a nombre de `ORGANIZER_EMAIL`, envía un recordatorio solo a esa dirección, comprueba que no repite y borra la fila). Después, borrar ese correo de la bandeja.
- Los activadores ejecutan el código guardado en el editor (no una versión numerada): al cambiar `Code.gs`, guarda en el editor además de publicar la versión nueva.

## Reservas de prueba (v10)
Los avisos a organizador y coordinadores marcan una reserva como **PRUEBA** cuando el nombre o los apellidos contienen la palabra «prueba» o «test», o cuando el email es el del organizador: el asunto empieza por `[PRUEBA - NO ES UNA RESERVA REAL]` y el cuerpo por «PRUEBA - NO ES UNA RESERVA REAL. IGNORAR…». Aplica también a su cancelación. Criterio de trabajo: no hacer pruebas salvo necesidad; si se hacen, con nombre «PRUEBA», y borrar la fila de la hoja después.
