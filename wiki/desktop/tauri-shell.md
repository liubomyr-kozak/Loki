---
type: Native Shell (Rust)
title: Tauri Native Shell (main.rs)
description: "Rust/Tauri process that hosts the window, tray icon, and spawns/monitors the packaged Node backend."
tags: [desktop, tauri, rust, tray, macos]
timestamp: "2026-07-20T21:36:40Z"
---

`app/src-tauri/src/main.rs` (1358 lines) is the whole native side — one binary,
no submodules. It is a macOS menu-bar app (Tauri 2, `ActivationPolicy::Accessory`)
built on `tauri-plugin-positioner` (tray-relative popover placement),
`tauri-plugin-autostart` (login-item registration via macOS LaunchAgent),
`tauri-plugin-dialog` (error dialogs), and, macOS-only, `tauri-nspanel`
(`objc2`/`objc2-app-kit`) to make the main window behave as a floating
NSPanel-style tray popover instead of a normal window.

## Window behavior

The main window (`tauri.conf.json`: 360x520, `decorations:false,
transparent:true, alwaysOnTop:true, visibleOnAllWorkspaces:true,
skipTaskbar:true, visible:false`) is user-resizable in width only
(`MIN_PANEL_WIDTH=360`, `MAX_PANEL_WIDTH=720`, fixed `PANEL_HEIGHT=520`); the
chosen width is persisted to `<app_config_dir>/panel-width.json` and reloaded on
startup. A `ResizeAnchor` debounce (`RESIZE_SETTLE_MS=250`) recenters the window
after a user drag settles, since resizing from one edge drifts it off-center
from the tray icon.

Two `#[tauri::command]`s (`enter_dashboard` / `exit_dashboard`, invoked from the
frontend) toggle the window between "floating tray popover" (NSPanel, always-on-top,
locked size) and "normal resizable window" (used for the `Dashboard` overlay seen
in `/desktop/frontend-app.md`) by swapping NSWindow style mask / collection
behavior at runtime. Other exposed commands: `quit_app`, `set_tray_count` (sets the
`main-tray` tray icon's title/badge to a running-app count), `open_config_in_editor`,
`open_in_terminal`, `open_url`, `set_dashboard_progress`, `hide_window`.

## Spawning the backend

In `setup()`, before showing anything, the shell spawns the Express backend as a
managed child process (`ServerProcess` state):

- **Dev build** (`cfg!(debug_assertions)`): `node dist/server.js` with
  `current_dir("../../")` (repo root) and `LOKI_PORT=9999` — assumes the repo's own
  `dist/server.js` already exists (`yarn server:build`).
- **Packaged build**: no repo checkout on disk, so paths come from Tauri's
  app-scoped dirs instead of cwd — `resource_dir()/resources/server.js` is run
  via a discovered Node binary (`discover_node()`: tries `node --version` on
  PATH, then `which node` under the user's login shell), with config/log dirs
  created under `app_config_dir()`/`app_log_dir()` first. Port is intentionally
  still hardcoded to 9999 (no dynamic allocation), matching the frontend's
  hardcoded `BASE` in `/desktop/api-client.md`.

After spawning, `spawn_health_poll()` polls `GET http://127.0.0.1:9999/api/config`
in a background thread until it responds (or times out), surfacing a dialog via
`tauri-plugin-dialog` if the backend never comes up. When the backend exits
before it is ready (the backend exits 1 on a listen error such as
`EADDRINUSE`), `early_exit_message()` names the process holding port 9999 —
`lsof -nP -iTCP:9999 -sTCP:LISTEN -Fpc` on Unix, a generic message on
Windows.

## Tray / native integrations

Tray icon id `main-tray` uses `icons/tray.png` (a black-on-transparent macOS
template image — see `/desktop/build-and-icons.md`). `open_in_terminal` shells
out via `osascript` (macOS), `sh -c` (Linux), or `cmd /C` (Windows);
`open_config_in_editor`/`open_url` similarly dispatch to `open`/`xdg-open`/`cmd`
per platform, though the tray/window logic itself is macOS-specific
(`#[cfg(target_os = "macos")]` blocks).

# Citations

[1] `app/src-tauri/src/main.rs`
[2] `app/src-tauri/Cargo.toml`
[3] `app/src-tauri/tauri.conf.json`
