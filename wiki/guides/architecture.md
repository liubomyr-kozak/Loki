---
type: concept
title: Architecture
description: "The map of Loki: the parts, key ideas, HTTP API and repository layout."
timestamp: "2026-10-24T00:00:00Z"
---

# Architecture

How Loki is put together, for people who want to change it. This page is the
map; the module-by-module pages with contracts and design decisions are the
rest of the [wiki](../index.md): [backend](../backend/), [desktop](../desktop/)
and [entities](../entities/).

## The parts

```text
 ┌──────────────── Tauri desktop shell (Rust, app/src-tauri) ───────────────┐
 │  tray / menu-bar icon · launcher window · Workspace window · autostart   │
 │                                                                          │
 │   ┌────────── React UI (app/src) ──────────┐                             │
 │   │ Redux Toolkit store, polling, pickers  │                             │
 │   └───────────────────┬────────────────────┘                             │
 └───────────────────────│──────────────── starts and watches ─────┐       │
                         │ HTTP, JSON                              │       │
                         ▼ http://127.0.0.1:9999                   ▼       │
 ┌──────────── Backend (Node.js + Express, app/backend) ───────────────────┐
 │ config · process lifecycle · git flows · ports · plugin host            │
 └──────┬──────────────────────┬───────────────────────┬───────────────────┘
        │ tmux / child process │ git CLI               │ require()
        ▼                      ▼                       ▼
   your apps' dev servers   your repositories     plugins (marketplace/,
                                                   your plugin folders)
```

- **Backend** (`app/backend/`): an Express 5 server in TypeScript on
  `127.0.0.1:9999`. It listens on the IPv4 loopback only, and the UI and the
  Tauri health check call that address, not `localhost`: on macOS
  `localhost` resolves to `[::1]` first, where another dev server could
  answer instead of Loki. It owns the config file and the sidecar state files, starts and
  stops apps through a *session provider*, runs Git, finds the ports apps
  listen on, and loads plugins. `app/backend/index.ts` is an interactive CLI
  over the same code (`yarn cli`).
- **UI** (`app/src/`): React 19 with Redux Toolkit, built by Vite. It holds no
  business logic of its own: everything goes through `app/src/api.ts` to the
  backend, and the UI polls for status.
- **Desktop shell** (`app/src-tauri/`): Tauri v2. It shows the tray icon and
  the two windows (`?window=launcher` and `?window=workspace` load the same UI
  in different roles), offers native dialogs, autostart and terminal opening,
  and starts the backend. In development it runs `node dist/backend/server.js`
  from the checkout; in an installed app it runs the bundled server with the
  bundled Node.js, watches its health and reports a crash.
- **Shared code** (`app/shared/`): types, zod schemas and pure logic used by
  both the backend and the UI. It must not import Node.js modules or backend
  code.

The UI and the backend talk only over HTTP. There is no IPC bridge between
the React code and the backend; Tauri commands are used only for native
things (windows, dialogs, opening terminals and URLs).

## Key ideas

**Config and state.** `loki-config.json` is the one file a person edits.
Everything Loki learns at runtime (which processes it started, chosen
environments, clones, stashes, plugin data) goes into separate JSON files
next to it, so the config stays clean. Writes go through a read-modify-write
of the raw file, so fields Loki does not know survive. Details:
[Configuration](configuration.md).

**Session providers.** Starting an app is delegated to a provider:
`tmux` (one window per app in a shared session) or `detached` (a background
process with output to a log file). Providers register themselves; the
config picks one, and an unavailable choice falls back to the first
available. Code: `app/backend/apps/providers/`.

**Effective config.** What actually runs is computed at start time from the
app's config, the chosen environment, the `package.json` on the current
branch and the environment filter (`app/backend/apps/effectiveConfig.ts`).
Clones reuse the original's process when their environment matches, and get
their own process when it differs.

**Git flows.** Branch switch, stash apply and stash drop run under a per-repo
lock so two requests cannot interleave. Stashes are recorded per app and
branch (`app/backend/git/`).

**Plugins.** The backend is the only code that reads manifests and runs
plugin code. The UI receives plain descriptors (`button`, `toggle`, `group`)
and sends clicks back to `invoke`. Contract: [Plugins](plugins.md).

## HTTP API

The backend serves JSON on `http://127.0.0.1:9999`. It is an internal API
for the UI and may change between versions, but it is handy for scripts and
debugging.

| Area | Endpoints |
|---|---|
| Apps | `GET /api/apps`, `GET /api/apps/:name`, `POST /api/apps/:name/start`, `/stop`, `/restart`, `/environment`, `GET /api/apps/:name/attach-command`, `GET /api/sessions` |
| Git | `GET /api/apps/:name/git/branches`, `GET /api/apps/:name/git/scripts`, `POST /api/apps/:name/git/checkout`, `/git/stash/apply`, `/git/stash/drop` |
| Config | `GET /api/config`, `GET /api/config/path`, `POST /api/config/reload`, `POST /api/config/apps`, `PATCH`/`DELETE /api/config/apps/:name`, `GET`/`PATCH /api/config/global`, `POST /api/config/global/detect`, `/global/reset`, `POST /api/config/import/inspect`, `/import/apply`, `POST /api/scan` |
| Plugins | `GET /api/plugins`, `/plugins/catalog`, `/plugins/descriptors`, `POST /api/plugins/preview`, `/plugins/install`, `/plugins/:id/activated`, `/plugins/:id/enabled`, `/plugins/:id/invoke[/:appName]`, `DELETE /api/plugins/:id` |
| Preferences | `GET`/`PUT /api/favorites`, `GET`/`PUT /api/order`, `PUT /api/group-order`, `/api/group-selections…`, `/api/instances…` |

Request and response shapes are in
[`wiki/entities/backend-route-api-reference.md`](../entities/backend-route-api-reference.md)
and in the route files under `app/backend/routes/`.

## Repository layout

```text
app/
  backend/        Node server and CLI: config/, apps/, git/, plugins/, routes/, …
  shared/         Types, schemas and pure logic shared by backend and UI
  src/            React UI: components/, store/, hooks/, lib/
  src-tauri/      Rust shell, icons, Tauri config
marketplace/      Built-in plugins and catalog.json
demo/             Three demo apps and their loki-config.json
e2e/              Playwright end-to-end tests
scripts/          Doctor, demo setup, packaging, smoke test, version bump
wiki/             All documentation: guides/ for users and contributors,
                  backend/, desktop/, entities/, plugins/ for design notes
```

Generated output goes to `dist/` (JavaScript) and `app/src-tauri/target/`
(Rust and installers); both are ignored by Git. Build details:
[Development](development.md#build-layout).
