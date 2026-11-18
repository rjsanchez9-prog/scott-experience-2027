#!/usr/bin/env bash
# Fija el dominio publico en las etiquetas de compartir (og:url / og:image) de index.html.
# Uso:  tools/set_domain.sh https://mi-sitio.netlify.app
# (sin barra final). WhatsApp exige URLs absolutas para mostrar la imagen de cabecera.
set -euo pipefail
[ $# -eq 1 ] || { echo "Uso: $0 https://tu-dominio"; exit 1; }
URL="${1%/}"
case "$URL" in https://*) ;; *) echo "La URL debe empezar por https://"; exit 1;; esac
cd "$(dirname "$0")/.."
sed -i '' "s#https://TU-DOMINIO#${URL}#g" index.html
echo "OK -> $(grep -c "$URL" index.html) referencias actualizadas a $URL"
