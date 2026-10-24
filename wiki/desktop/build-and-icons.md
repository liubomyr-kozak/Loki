---
type: Build Config
title: "Desktop Build Config & Icon Generation"
description: Cargo/tauri.conf.json bundling setup plus the Python/Swift scripts that generate the app and tray icons.
tags: [desktop, build, icons, tauri]
timestamp: "2026-07-20T21:36:40Z"
---

## Cargo (`app/src-tauri/Cargo.toml`)

Binary crate `loki-orchestrator-desktop` v1.0.0, edition 2021. Key deps:
`tauri` v2 (`macos-private-api, tray-icon, image-png` features),
`tauri-plugin-positioner`, `tauri-plugin-autostart`, `tauri-plugin-dialog`,
`serde`/`serde_json`, `ureq` (used for the backend health poll in
`/desktop/tauri-shell.md`). macOS-only deps: `objc2`, `objc2-app-kit`,
`objc2-foundation`, and `tauri-nspanel` (pulled from
`https://github.com/ahkohd/tauri-nspanel`, branch `v2` — not a crates.io
release). Release profile is tuned for a small/fast binary: `panic = "abort"`,
`codegen-units = 1`, `lto = true`, `opt-level = "s"`, `strip = true`.
`build.rs` just calls `tauri_build::build()` (no custom codegen).

## tauri.conf.json

- `productName: "Loki"`, `identifier: "com.liubomyr.loki-orchestrator"`, window
  `title: "Loki"` — the user-facing brand is aligned with the npm package name
  (`loki-orchestrator-desktop`) and the Rust binary crate name
  (`loki-orchestrator-desktop`), but still differs from the repo folder name.
- `build.frontendDist: "../dist"` (desktop/dist, the Vite build output),
  `devUrl: "http://localhost:1421"`, `beforeDevCommand: "npm run dev"`,
  `beforeBuildCommand: "npm run build"` — these run `desktop/package.json`'s
  `vite`/`vite build` scripts.
- `app.security.csp: null` (no CSP enforced) and `macOSPrivateApi: true`.
- `bundle.icon` lists `icons/32x32.png`, `128x128.png`, `128x128@2x.png`,
  `icon.icns`, `icon.ico` (standard multi-resolution set `tauri icon` produces
  from `app-icon.png`).
- `bundle.resources` maps three files from `resources-build/resources/` into
  the packaged app's `resources/` dir: `server.js` (the bundled backend, built
  by the repo-root `server:build:packaged` script — not read in this pass),
  `catalog.json`, and `package.json`. This is the exact path contract
  `/desktop/tauri-shell.md`'s packaged spawn branch reads back via
  `resource_dir().join("resources").join(...)`.

## Build prerequisite: `resources-build/` must exist before any tauri build

`bundle.resources` (above) reads from `app/src-tauri/resources-build/resources/`
— `server.js` (~11 MB bundled backend), `catalog.json`, `package.json`. That
directory is **gitignored** (`.gitignore:9`, `/app/src-tauri/resources-build/`),
so a fresh clone or **fresh git worktree does not have it** — a raw
cargo/tauri/IDE build then fails in the cargo build script with
"resource path ... doesn't exist".

The files are produced by `yarn server:build:packaged`
(root `package.json:15` → `scripts/build-packaged-server.js`). The correct
entrypoints already chain this prebuild:

- `yarn desktop:dev` (`package.json:16`) — `server:build` + `tauri dev`
- `yarn desktop:build` (`package.json:17`) — `server:build:packaged` + `tauri build`

Always build through these root scripts, never by invoking cargo/tauri
directly in a fresh checkout.

## Lint / test wiring — known gaps

- The repo has **no ESLint config and no `lint` script** anywhere (root or
  `desktop/package.json`) — `yarn lint` does not exist. Use `tsc --noEmit`
  for type-checking.
- The root `package.json` `scripts` block (lines 10-20) has **no `test`
  script**, and `vitest.config.ts:6` `include` covers only
  `backend/**/*.test.ts` + `state/plugins/**/*.test.ts` —
  `app/src/**` is not covered by any test runner.

## Icon generation scripts

Four standalone scripts, run manually (not wired into `npm`/`cargo` build
hooks as far as these files show):

- `gen-icon.py` — writes a flat 1024x1024 solid-color (`#2563eb`) PNG to
  `app-icon.png` via raw zlib/PNG chunk construction (no Pillow dependency).
  Appears to be a placeholder/fallback icon generator.
- `gen-appicon.swift` (macOS, `swift gen-appicon.swift`) — renders the real
  app glyph: Unicode `U+1F703` (🜃, alchemical symbol for Earth) from the
  system "Apple Symbols" font, emerald `#10b981` on transparent, into
  `app-icon.png` at 1024x1024 — the actual source `tauri icon` consumes to
  produce `bundle.icon`'s multi-resolution set.
- `gen-tray.py` — draws the same 🜃 shape as a hand-rasterized black-on-transparent
  44x44 line drawing (Bresenham line algorithm, no font) into `icons/tray.png`.
- `gen-tray.swift` (macOS, `swift gen-tray.swift`) — the higher-fidelity
  counterpart to `gen-tray.py`: renders the real 🜃 glyph from "Apple Symbols"
  at 44pt @2x (88px) black-on-transparent into `icons/tray.png` — a macOS
  template image so the OS auto-tints it for light/dark menu bars.

The `.py` scripts are dependency-free fallbacks; the `.swift` scripts (macOS
only, need `swift` on PATH) produce the real glyph-based icons and are the ones
that matter for the actual "Loki" branding (🜃 + emerald, matching
`/desktop/tauri-shell.md`'s tray icon).

# Citations

[1] `app/src-tauri/Cargo.toml`
[2] `app/src-tauri/tauri.conf.json`
[3] `app/src-tauri/build.rs`
[4] `app/src-tauri/gen-icon.py`, `gen-tray.py`, `gen-tray.swift`, `gen-appicon.swift`
[5] root `package.json:10-20`, `scripts/build-packaged-server.js`, `.gitignore:9`
[6] `vitest.config.ts:6`
