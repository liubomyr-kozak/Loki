---
type: API Client
title: Desktop API Client (api.ts)
description: "Typed fetch wrapper the desktop UI uses to talk to the orchestrator backend on 127.0.0.1:9999."
tags: [desktop, api, http]
timestamp: "2026-07-30T12:00:00Z"
---

`app/src/api.ts` is the only place the frontend talks HTTP. `BASE =
'http://127.0.0.1:9999'` is hardcoded — the IPv4 loopback, not `localhost`,
because `localhost` resolves to `[::1]` first and another dev server bound to
`[::1]:9999` would answer instead of Loki. It matches the port the packaged backend is
spawned on with `LOKI_PORT=9999` in `/desktop/tauri-shell.md`. It re-exports backend
domain types from `../../backend/types` and `../../backend/config/scan` (repo
root, not read in this pass) so the frontend and backend share one type
definition, and exports a single `api` object of methods, each a thin
`fetch(...).then(j<T>)` — `j()` unwraps a JSON body or throws `Error(msg)` using
the response's `error` field (or raw text) when `!r.ok`.

# Schema — endpoints called (method, path)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/config` | full config (`getConfig`) — gates `configLoaded` in the store |
| GET | `/api/apps` | app statuses map (`getApps`) |
| POST | `/api/apps/:name/start` | start an app, body `{environment?, force?}` |
| POST | `/api/apps/:name/stop` | stop an app, body `{force?}` |
| POST | `/api/apps/:name/restart` | restart an app |
| POST | `/api/apps/:name/environment` | switch an app's active environment |
| GET | `/api/apps/:name/attach-command` | terminal attach command; `?mode=control` variant |
| GET | `/api/sessions` | list tmux/session info (`SessionInfo[]`) |
| GET/PUT | `/api/favorites` | starred apps list |
| GET/PUT | `/api/order` | app ordering |
| GET | `/api/config/path` | on-disk path of the active config file |
| GET | `/api/config/global` | global config + provider metadata + detected runtime |
| POST | `/api/config/global/detect` | re-run detection, optionally scoped to `tmux\|node\|shell` |
| POST | `/api/config/global/reset` | reset global config to defaults |
| PATCH | `/api/config/global` | partial-update global config |
| POST | `/api/config/reload` | reload config from disk |
| POST | `/api/scan` | scan a filesystem path for a project (`ScanResult`) |
| POST | `/api/config/apps` | add a new app entry, body `{key, app}` |
| POST/PATCH/DELETE | `/api/config/apps/:name/environments[/:envKey]` | add/enable-disable/delete an app's environments |
| PATCH | `/api/config/apps/:name` | patch app fields (label, repoPath, repoUrl, appUrl, port, dependsOn, surface, icon, groups) |
| GET | `/api/plugins` | every marketplace plugin, each with computed `activated`/`enabled` flags (`getPlugins`) |
| GET | `/api/plugins/descriptors` | per-plugin control descriptors (only `activated && enabled` plugins) |
| POST | `/api/plugins/:id/invoke/:appName` | invoke a plugin action against an app (400s if not `activated`/`enabled`) |
| POST | `/api/plugins/:id/invoke` | invoke a plugin action globally (app-less; same `activated`/`enabled` gate) |
| POST | `/api/plugins/install` | stage + install a plugin from a source string; skips the copy (just activates) if the id already exists under `marketplace/` |
| POST | `/api/plugins/preview` | preview a plugin manifest before install (execution-free) |
| DELETE | `/api/plugins/:id` | **deactivates** the plugin (`removePlugin` in `api.ts`/`pluginsSlice.ts`, despite the name) — drops it from `config.plugins`; does not touch its on-disk `marketplace/<id>/` directory |
| POST | `/api/plugins/:id/activated` | activate/deactivate a plugin (`setPluginActivated`) — the config-membership flag |
| POST | `/api/plugins/:id/enabled` | enable/disable an already-activated plugin (`setPluginEnabled`) — an independent second flag, not the same as activation |
| GET | `/api/plugins/catalog` | plugin catalog entries, `installed` == activated |
| GET | `/api/apps/:name/git/branches` | branch list + dirty/stash state |
| POST | `/api/apps/:name/git/checkout` | checkout a branch (may auto-stash) |
| POST | `/api/apps/:name/git/stash/apply` | apply a stash |
| POST | `/api/apps/:name/git/stash/drop` | drop a stash |

All mutating calls send `Content-Type: application/json` with a JSON body except
plain-GET and the no-body `/api/config/reload` and plugin-delete/enabled calls
noted above.

# Citations

[1] `app/src/api.ts`
