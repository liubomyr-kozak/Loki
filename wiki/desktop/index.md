# Concepts

* [Desktop UI Design System](DESIGN.md) - Design-token and style reference for the desktop launcher/popover — dark-first, flat-elevation, green-accent — extracted verbatim from styles.css and the Settings/Dashboard components.
* [Desktop API Client (api.ts)](api-client.md) - Typed fetch wrapper the desktop UI uses to talk to the orchestrator backend on 127.0.0.1:9999.
* [AppList surface — rows, tiles, dock, per-row state](applist.md)
* [Desktop Build Config & Icon Generation](build-and-icons.md) - Cargo/tauri.conf.json bundling setup plus the Python/Swift scripts that generate the app and tray icons.
* [Dashboard components (desktop)](dashboard.md)
* [Desktop Frontend App](frontend-app.md) - The React 19 + Redux Toolkit UI (App.tsx/main.tsx) that renders inside the Tauri window.
* [Desktop hooks, lib, and app entry (DZ6)](hooks-lib.md)
* [Desktop Shell Overview](overview.md) - How the desktop/ Tauri menu-bar app relates to the root Loki Orchestrator Express backend it wraps.
* [Desktop portals, pickers, common controls, Groups, Header](portals-pickers.md)
* [Desktop Settings components](settings.md)
* [Desktop Redux store](store.md)
* [Tauri Native Shell (main.rs)](tauri-shell.md) - Rust/Tauri process that hosts the window, tray icon, and spawns/monitors the packaged Node backend.
