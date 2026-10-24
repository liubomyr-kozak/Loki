---
type: Application Shell
title: Desktop Shell Overview
description: How the desktop/ Tauri menu-bar app relates to the root Loki Orchestrator Express backend it wraps.
tags: [desktop, tauri, overview]
timestamp: "2026-07-20T21:36:40Z"
---

`desktop/` is a Tauri v2 menu-bar shell for the "Loki Orchestrator" monorepo. The
repo root is an Express/TypeScript backend + CLI (`backend/server.ts`,
`backend/index.ts`) that manages a set of local micro-frontend apps (start/stop,
env switching, git branch/stash ops, plugins). `desktop/` does not reimplement
any of that — it is a thin native wrapper: a React UI (`app/src/`) that talks
to the backend over plain HTTP, packaged inside a Rust/Tauri process
(`app/src-tauri/`) that owns the window chrome, the macOS menu-bar tray icon, and
(in a packaged build) spawning the backend itself as a child Node process.

Product name shown to the user is "Loki" (`tauri.conf.json` → `productName`,
window title); the npm package name and bundle id are aligned to
`loki-orchestrator` / `com.liubomyr.loki-orchestrator`, while the repo folder
itself is still `mfe-orchestrator`.

## Two run modes

- **Dev** (`yarn desktop:dev` at repo root): builds the backend once
  (`server:build`), then `tauri dev` launches the Rust shell which loads the
  Vite dev server at `http://localhost:1421` (`tauri.conf.json` → `devUrl`) as
  its `devUrl`; the backend is expected to already be running separately on
  `127.0.0.1:9999`.
- **Packaged** (`yarn desktop:build`): `server:build:packaged`
  (`scripts/build-packaged-server.js`, repo root — not read in this pass) bundles
  the backend into `app/src-tauri/resources-build/resources/server.js`, which
  `tauri.conf.json` → `bundle.resources` copies into the `.app` bundle. At
  runtime the Rust shell spawns that resource with `node`, `LOKI_PORT=9999`
  (`app/src-tauri/src/main.rs`), polls `http://127.0.0.1:9999/api/config` for
  health, and only then loads the frontend.

In both modes the frontend's only backend contact point is
`http://127.0.0.1:9999` — see `/desktop/api-client.md`.

## Sub-concepts in this bundle

- `/desktop/frontend-app.md` — the React/Redux UI (`App.tsx`, `main.tsx`, styling)
- `/desktop/api-client.md` — `api.ts`, the typed fetch layer to the backend
- `/desktop/tauri-shell.md` — the Rust process: window/tray/backend-spawn/health-poll
- `/desktop/build-and-icons.md` — Cargo/tauri.conf.json bundling + icon generation scripts

# Citations

[1] `app/src-tauri/tauri.conf.json`
[2] `app/src-tauri/src/main.rs`
[3] `package.json` (repo root, `scripts.desktop:dev` / `scripts.desktop:build`)
