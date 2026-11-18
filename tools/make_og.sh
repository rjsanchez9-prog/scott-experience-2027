#!/usr/bin/env bash
# Regenera assets/img/og-scott-experience-2027.jpg (1200x630) desde tools/og-source.html con Chrome headless (macOS).
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files --hide-scrollbars \
  --screenshot="$TMP/og.png" --window-size=1200,630 "file://$PWD/tools/og-source.html" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 85 "$TMP/og.png" --out assets/img/og-scott-experience-2027.jpg >/dev/null
rm -rf "$TMP"
ls -la assets/img/og-scott-experience-2027.jpg
