# Loki icon sources

- `loki-icon.svg`: macOS icon (824px tile on a 1024 canvas, with shadow). Used for `icon.icns`.
- `loki-icon-full.svg`: same art filling the canvas. Used for `icon.ico`, the PNGs and Android.
- `loki-tray.svg`: menu bar template icon (`tray.png`, 176px).

To regenerate: render each SVG to a 1024px PNG (iOS needs a copy with square corners), run
`npx @tauri-apps/cli@2 icon <png> -o <dir>` and copy the results into `app/src-tauri/icons`,
taking `icon.icns` from the macOS render.
