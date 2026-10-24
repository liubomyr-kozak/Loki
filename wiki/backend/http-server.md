---
type: concept
title: HTTP server & route mounting
timestamp: "2026-07-24T00:00:00Z"
---

# HTTP server & route mounting

The orchestrator's backend HTTP layer is a small Express app
(`backend/server.ts`) that mounts five feature routers, plus a separate CLI
entry point (`backend/index.ts`) that talks to the same domain layer
(`appManager`, `configState`) without going through HTTP at all. See
[Backend route/API reference](../entities/backend-route-api-reference.md)
for the full endpoint-by-endpoint contract; this page is the file-level map
of what owns what.

## `backend/server.ts` — Express app bootstrap

Responsibility: wires up the process-wide singletons and mounts every route
module in one place.

- Resolves the config path through `configLocation.ts`
  (`state/loki-config.json`). There is deliberately **no** migration
  step: legacy layouts and filenames are not read at all, so boot does no
  renaming before anything else. Then `getGlobalConfigKeys()` (forces the
  provider-registration side-effect imports above it to have already run —
  see [Config read/write contract](../entities/config-read-write-contract.md)
  §`patchGlobalConfig` and the provider-key allowlist), then `initConfig()`
  to populate `configState`'s in-memory singleton before any request can
  arrive.
- Imports four provider modules purely for their registration side effects
  (`./apps/providers/tmuxProvider`, `detachedProvider`,
  `initServiceProvider`, `windowsServiceProvider`) — these must run before
  `getGlobalConfigKeys()`/`initConfig()` so the provider-settings allowlist
  and `primeProviders()` see a fully-populated provider registry.
- Installs `cors()` and `express.json()` globally, then a request-logging
  middleware that logs `METHOD path -> status (Nms)` on `res.on('finish')`
  for every request.
- Mounts, in order: `configRouter`, `appsRouter`, `gitRouter`, `prefsRouter`,
  `pluginsRouter` — each is a plain `express.Router()` default-exported from
  its own file under `backend/routes/`; mount order doesn't matter here
  since none of the routers' path patterns overlap.
- Listens on `127.0.0.1` only, port `process.env.LOKI_PORT || 9999` — the address
  the UI and the Tauri health check call, so a dev server on `[::1]:9999`
  cannot take their requests. A listen error (Express 5 passes it to the
  `listen` callback, e.g. `EADDRINUSE`) is logged as `Cannot listen on
  127.0.0.1:<port>` and the process exits 1, which lets the Tauri shell
  report the port owner instead of hanging on "Connecting…".
- The variable is `LOKI_PORT`, not `PORT`: dev servers read `PORT`, and apps
  Loki starts get the backend env minus Loki's own variables
  (`app/backend/process/appEnv.ts`).
- Key exports: none (this file is the app entry, not a library — it has no
  exports; running it is the side effect).
- Consumers: started directly as the backend process (desktop Tauri sidecar
  and dev `yarn` script both point at this file, not `index.ts`).

## `backend/index.ts` — standalone CLI entry point

Responsibility: a readline-driven interactive CLI for operating the
orchestrator without the HTTP server or any frontend — a separate, non-HTTP
entry point into the same domain layer `server.ts`'s routes wrap.

- Not part of the HTTP layer's request path at all — no Express, no
  `app.listen`. Included in this doc because it is one of the four files
  named in this zone's file list and it is the CLI-entry counterpart to
  `server.ts`'s HTTP-entry role.
- Takes the config file path as `process.argv[2]` (default
  `defaultConfigFile()` -> `state/loki-config.json`), calls `loadConfig()`
  directly (not `configState`'s `initConfig()`/`getConfig()` singleton —
  this process holds its own local `config` variable, since there's no
  concurrent-request reason to centralize it here).
- Commands (`list`, `status <app>`, `start <app>`, `stop <app>`,
  `restart <app>`, `logs <app> [lines]`, `help`, `exit`/`quit`) call the same
  domain functions the HTTP routes call — `getAppStatus`, `startApp`,
  `stopApp`, `restartApp` from `../apps/appManager`, `readRegistry` from
  `../process/registry` — directly, printing to stdout instead of returning
  JSON.
- `showLogs` reads the app's log file directly off disk
  (`config.global?.sessionsDir` +
  `${appName}.log'`) and tails the last N lines — there is no equivalent
  HTTP route for reading logs; this CLI-only capability has no `routes/`
  counterpart.
- Key exports: none — this is a `#!/usr/bin/env node` script entry, invoked
  directly (`node backend/index.ts` / a bin alias), not imported anywhere.
- Consumers: whoever runs the orchestrator as a terminal tool instead of
  through the desktop UI; no code in `backend/routes/` or the frontend
  depends on it.

## `backend/routes/config.ts` — config CRUD, global settings, scan

Responsibility: every route that reads or mutates the on-disk config file
(apps, global settings, group order) plus project scanning/detection.

- `GET /api/config` — returns `{ workspace, global, apps, groupOrder, ... }`
  from `getConfig()` (the `configState` singleton).
- `GET /api/config/path` — resolved absolute path to the active config file.
- `GET /api/config/global` — global settings + provider metadata + detected
  runtime, via the shared `globalConfigResponse()` helper (also reused by
  `/detect` and `/reset`); calls `primeProviders()` first so provider
  availability checks have run at least once.
- `POST /api/config/global/detect` — re-probes provider availability with
  `bypassCache: true` (see [Config read/write
  contract](../entities/config-read-write-contract.md) §`routes/config.ts`
  — detect/reset semantics).
- `PATCH /api/config/global` — validates+writes via `patchGlobalConfig`
  through `mutateGlobalConfigFile`, then `reloadConfig()`.
- `POST /api/config/global/reset` — drops every `getGlobalConfigKeys()` key
  except the `RESETTABLE` exclusion set (`sessionsDir`, `stateFile`,
  `pluginCatalogUrl`).
- `POST /api/config/reload` — forces `reloadConfig()` without any mutation.
- `POST /api/scan` — runs `scanProject`/`findAppByRepoPath` against a
  user-supplied directory path, returning any existing app match plus its
  known start commands.
- `POST /api/config/apps` — validates (`validateAppConfig`,
  `AppConfigWriteSchema`-backed) and appends a new app (`addApp`) via
  `mutateConfigFile`.
- There are **no** `/api/config/apps/:name/environments` CRUD endpoints: an
  app's environments are not stored in the config at all. They are derived
  from the repo's `package.json` scripts, filtered by
  `global.environmentFilterRegex` (optionally overridden per app by
  `app.environmentFilter`). What the user picks is a *selection*, written
  through `POST /api/apps/:name/environment` in `routes/apps.ts`.
- `PATCH /api/config/apps/:name` — hand-rolled partial patch (`patchApp`,
  not zod-validated — see config contract doc's "Known drift risk: patch
  paths are hand-rolled" section).
- Key exports: default-exports `router` only; all mutation logic itself
  lives in `../config/configStore` (`addApp`, `patchApp`,
  `patchGlobalConfig`, `mutateConfigFile`, `mutateGlobalConfigFile`,
  `mutateGroupOrderFile`, `validateAppConfig`, `sanitizeKey`,
  `getGlobalConfigKeys`) — this file is pure HTTP glue (parse request,
  call configStore function, `reloadConfig()`, respond).
- Consumers: the desktop Settings UI (Environment/global settings, app
  create/edit forms, group tagging) and the project-scan/add-app
  onboarding flow. Full request/response shapes: [Backend route/API
  reference](../entities/backend-route-api-reference.md).

## `backend/routes/apps.ts` — app lifecycle and status

Responsibility: every route for listing app status and controlling an
app's running process (start/stop/restart), plus session listing and
environment selection.

- `GET /api/apps` — status map for every configured app, built via
  `makeStatusContext(config)` (a shared per-request cache) + `getAppStatus`
  per app.
- `GET /api/apps/:name` — single app's status; 404 if unknown.
- `POST /api/apps/:name/start` — starts an app with an optional
  `{ environment }` selection and `force` flag, returns the fresh status.
- `POST /api/apps/:name/stop` — stops an app, optional `force` flag.
- `GET /api/sessions` — `listSessions(config)`, cross-app session listing
  for the active session provider (tmux/detached/etc).
- `GET /api/apps/:name/attach-command` — the shell command a user would run
  to attach to an app's session; `controlMode` toggled via
  `?mode=control`/`?control=1|true` query params.
- `POST /api/apps/:name/restart` — `restartApp` then fresh status.
- `POST /api/apps/:name/environment` — writes an environment selection via
  `writeSelection` into the selections sidecar (path derived from
  `config.global?.stateFile`'s directory, falling back to
  `state/selections.json`), then returns fresh status. This is the
  route that produces the legacy string-format entries `process/selections.ts`
  migrates on read (see [Config read/write
  contract](../entities/config-read-write-contract.md)).
- Key exports: default-exports `router` only; domain logic lives in
  `../apps/appManager` (`getAppStatus`, `makeStatusContext`, `startApp`,
  `stopApp`, `restartApp`, `getAttachCommand`, `listSessions`) and
  `../process/selections` (`writeSelection`).
- Consumers: the desktop app grid (status polling, start/stop/restart
  buttons), the environment/branch picker, and the sessions panel. Full
  contract: [Backend route/API
  reference](../entities/backend-route-api-reference.md).

## `backend/routes/git.ts` — per-app git operations

Responsibility: every git-flow route scoped to a single app's resolved repo
path (branch listing, checkout, stash apply/drop).

- `GET /api/apps/:name/git/branches` — resolves the app's effective
  `repoPath` via `resolveEffectiveForApp`, then `readBranchesInfo`.
- `POST /api/apps/:name/git/checkout` — requires `{ branch }`, runs
  `runCheckoutFlow` (the 2-step stash-then-checkout flow whose `ok: false`
  body the frontend's `gitSlice` treats as a checkout failure — see config
  contract doc, `gitSlice` section).
- `POST /api/apps/:name/git/stash/apply` — requires `{ stashRef }`, runs
  `runStashApply`.
- `POST /api/apps/:name/git/stash/drop` — requires `{ stashRef }`, runs
  `runStashDrop`. Explicit code comment: **this route does not gate on user
  confirmation itself** — the caller (frontend `dropStash` thunk contract)
  must have already confirmed via a modal before hitting this endpoint.
- All four routes resolve `repoPath` the same way and 500 with
  `'repoPath not resolved for app'` if `resolveEffectiveForApp` can't
  produce one (e.g. an app with no `repoPath`/`repoUrl` anywhere in its
  config chain).
- Key exports: default-exports `router` only; all git subprocess logic
  lives in `../git/gitFlowService` (`readBranchesInfo`, `runCheckoutFlow`,
  `runStashApply`, `runStashDrop`) and `../apps/appManager`
  (`resolveEffectiveForApp`).
- Consumers: the desktop branch picker (branch list, checkout) and the
  stash-conflict resolution modal (apply/drop). Full contract: [Backend
  route/API reference](../entities/backend-route-api-reference.md).

## `backend/routes/prefs.ts` — favorites and app order

Responsibility: the two small sidecar-file-backed user preferences —
favorited apps and app display order.

- `GET /api/favorites` / `PUT /api/favorites` — read/write the favorites
  array via `readFavorites`/`writeFavorites`; `PUT` 400s unless the body's
  `favorites` is an array.
- `GET /api/order` / `PUT /api/order` — same shape for `order`, via
  `readOrder`/`writeOrder`.
- Both sidecars are backed by the shared `jsonStore.ts` factory (see
  [Config read/write contract](../entities/config-read-write-contract.md)
  §`jsonStore.ts`) through `../config/favoritesStore`.
- Key exports: default-exports `router` only; storage logic lives in
  `../config/favoritesStore` (`readFavorites`, `writeFavorites`,
  `readOrder`, `writeOrder`).
- Consumers: the desktop app grid's favorites toggle and drag-to-reorder
  (frontend `favoritesSlice`/`orderSlice`, both using the
  optimistic-persist pattern described in the config contract doc).

## `backend/routes/plugins.ts` — plugin catalog, install, and invocation

Responsibility: everything plugin-related — listing installed plugins,
descriptor building for the frontend's dynamic control rendering,
install/remove/enable, invocation (both app-scoped and global-scoped), and
the remote catalog.

- `GET /api/plugins` — `listPlugins(getConfig())`.
- `GET /api/plugins/descriptors` — `buildDescriptors(getConfig())`, the
  endpoint the frontend polls to render plugin-contributed UI controls
  (surfaces: list/dock/menu/header — see config contract doc's
  `APP_SURFACES` note). A 500 here is a known failure mode that hides
  plugin controls entirely if `resolveEffective` throws on an unguarded
  the app's derived environment list (tracked as a prior bug class, not a routing issue in
  this file itself).
- `POST /api/plugins/:id/invoke/:appName` — app-scoped invocation: 400s if
  the app or plugin doesn't exist or the plugin is disabled; builds a
  `PluginContext` with `scope: 'app'`, the app's config, its live
  `AppStatus`, its `surface`, and a `host` from `makeHost(config)`; loads
  the plugin module fresh per request via `loadPluginModule` and calls
  `.invoke(ctx, input)`.
- `POST /api/plugins/:id/invoke` — global-scoped invocation: same
  enabled/exists checks, `PluginContext` with `scope: 'global'` only (no
  app/status/surface).
- `POST /api/plugins/install` — requires `{ source }` (string), calls
  `installPlugin`.
- `DELETE /api/plugins/:id` — `removePlugin`.
- `POST /api/plugins/:id/enabled` — requires `{ enabled }` boolean, calls
  `setPluginEnabled`.
- `POST /api/plugins/preview` — requires `{ source }`, calls
  `previewPlugin` to fetch/validate a plugin's manifest without installing
  it.
- `GET /api/plugins/catalog` — `fetchCatalog(getConfig())`, the remote
  plugin catalog list (backed by `CatalogEntrySchema`'s permissive
  `.catch(default)` parsing — see config contract doc §R1).
- Key exports: default-exports `router` only; domain logic lives in
  `../plugins/pluginStore` (`listPlugins`, `installPlugin`, `removePlugin`,
  `setPluginEnabled`, `previewPlugin`, `pluginsDir`), `../plugins/runtime`
  (`loadPluginModule`, `makeHost`), `../plugins/catalog` (`fetchCatalog`),
  and `../plugins/pluginDescriptorService` (`buildDescriptors`).
- Consumers: the desktop Plugins tab (install/remove/enable/catalog
  browsing) and every plugin-contributed control rendered anywhere in the
  app (list/dock/menu/header surfaces), which invoke through the
  `invoke`/`invoke/:appName` routes. Full contract: [Backend route/API
  reference](../entities/backend-route-api-reference.md).
