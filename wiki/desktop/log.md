# Directory Update Log

## 2026-07-24
* **Update**: Added build prerequisite (`resources-build/` gitignored → fresh worktree fails raw cargo build; use `yarn desktop:dev`/`desktop:build`) and lint/test wiring gaps. [build-and-icons](/desktop/build-and-icons.md).

## 2026-07-21
* **Creation**: Documented Cargo/tauri.conf.json bundling and the icon-generation scripts. [build-and-icons](/desktop/build-and-icons.md).
* **Creation**: Documented the Rust/Tauri native shell: window/tray behavior and backend spawn+health-poll logic. [tauri-shell](/desktop/tauri-shell.md).
* **Creation**: Documented api.ts's full endpoint surface against the localhost:9999 backend. [api-client](/desktop/api-client.md).
* **Creation**: Documented the desktop React/Redux frontend (App.tsx, main.tsx, styles.css). [frontend-app](/desktop/frontend-app.md).
* **Creation**: Documented desktop shell overview: relationship between the Tauri desktop/ app and the root Express orchestrator backend. [overview](/desktop/overview.md).
