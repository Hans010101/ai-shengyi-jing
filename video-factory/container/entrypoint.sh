#!/bin/sh
set -eu

browser_path="${PUPPETEER_EXECUTABLE_PATH:-/work/chromium/chromium}"
if [ ! -x "$browser_path" ]; then
  mkdir -p "$(dirname "$browser_path")"
  cat /opt/chromium-parts/chromium.part.* > "$browser_path"
  chmod 755 "$browser_path"
fi

exec "$@"
