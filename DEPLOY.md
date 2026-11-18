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
