---
type: entity
title: Backend Route/API reference
timestamp: "2026-07-30T12:00:00Z"
---

# Backend Route/API reference

# Backend Route/API reference

All routers declare absolute `/api/...` paths and are mounted with no prefix
in `backend/server.ts` (`configRouter`, `appsRouter`, `gitRouter`,
`prefsRouter`, `pluginsRouter`) — cross-router path prefixes are disjoint, so
mount order doesn't matter. Every handler wraps its body in try/catch,
logging `${method} ${path}` plus the error and returning
`{ error: string }` (via the shared `errorMessage()` helper) on failure —
that boilerplate is omitted below in favor of the success-path response
shape. 39 routes total across 5 routers.

## `backend/routes/apps.ts` — 8 routes

App lifecycle (start/stop/restart), status, and tmux session utilities.

| Method | Path | Purpose | Response (success) |
|---|---|---|---|
| GET | `/api/apps` | Status for every configured app | `{ [appName]: AppStatus }` |
| GET | `/api/apps/:name` | Status for one app | `AppStatus` (404 if unknown app) |
| POST | `/api/apps/:name/start` | Start an app; body `{ environment?, force? }` selects/pins an environment and bypasses the already-running short-circuit. `environment` is only honored when it's a non-empty string (`typeof === 'string' && !== ''`) — an empty string is dropped rather than persisted, since it used to fall through to `effectiveConfig.ts`'s falsy-fallback and silently launch the first script | `AppStatus` after start |
| POST | `/api/apps/:name/stop` | Stop an app; body `{ force? }` | `AppStatus` after stop |
| GET | `/api/sessions` | List live sessions from the active session provider (tmux windows inside the parent session, etc.) | `SessionInfo[]` |
| GET | `/api/apps/:name/attach-command` | Paste-able (or, with `?mode=control`/`?control=1`, iTerm control-mode `-CC`) attach command for the app's session | `{ command: string \| null }` |
| POST | `/api/apps/:name/restart` | Stop then start | `AppStatus` after restart |
| POST | `/api/apps/:name/environment` | Persist an environment selection without starting the app; body `{ environment }` (required) | `AppStatus` reflecting the new selection |

## `backend/routes/git.ts` — 4 routes

Git operations scoped to an app's *effective* `repoPath` (resolved via
`resolveEffectiveForApp`, so environment overrides are honored). All four
first resolve the effective repo path and 500 with
`{ error: 'repoPath not resolved for app' }` if it's unset.

| Method | Path | Purpose | Response (success) |
|---|---|---|---|
| GET | `/api/apps/:name/git/branches` | Local branches, dirty-working-tree state, and any sidecar stash record for the current branch | branches/dirty/stash info object (`readBranchesInfo` shape) |
| POST | `/api/apps/:name/git/checkout` | Composite flow: auto-stash a dirty tree → checkout `branch` → auto-apply any stash recorded for that branch; body `{ branch }` (required) | status/body from `runCheckoutFlow` (variable HTTP status, not always 200); success body may carry `staleStash?`/`warning?` (recorded stash gone from `git stash list`, dropped and surfaced rather than silently lost) and the pre-checkout 409 conflict body carries `files?` (unmerged paths) alongside `error` |
| POST | `/api/apps/:name/git/stash/apply` | Apply a specific stash directly, no checkout; body `{ stashRef }` (required) | status/body from `runStashApply` |
| POST | `/api/apps/:name/git/stash/drop` | Physically drop a stash (`git stash drop`); caller must already have user confirmation — this route does not gate on it; body `{ stashRef }` (required) | status/body from `runStashDrop` |

## `backend/routes/config.ts` — 14 routes

Reading/mutating the config file: global settings, session-provider
metadata/detection, custom groups, apps, and per-app environments.

| Method | Path | Purpose | Response (success) |
|---|---|---|---|
| GET | `/api/config` | Full config snapshot | `{ workspace, global, apps, groupOrder, plugins, disabledPlugins }` |
| GET | `/api/config/path` | Resolved absolute path of the active config file | `{ path }` |
| GET | `/api/config/global` | Global config + provider metadata + detected runtime/components | `{ global, providers, activeProvider, recommendedId, detected }` |
| POST | `/api/config/global/detect` | Re-probe provider availability bypassing cache (optionally scoped via body `{ component }`, e.g. `'tmux'`) and re-detect components/runtime | same shape as GET `/api/config/global` |
| PATCH | `/api/config/global` | Partial update to global config, persisted to disk, config reloaded | `{ ok: true }` |
| POST | `/api/config/global/reset` | Delete every resettable global key (all registered keys except `sessionsDir`/`stateFile`/`pluginCatalogUrl`) so `loadConfig`'s absence-means-default kicks back in | same shape as GET `/api/config/global` |
| POST | `/api/config/reload` | Force-reload the config file from disk into memory | `{ ok: true, path }` |
| POST | `/api/scan` | Scan a project folder's `package.json` for run scripts; body `{ path }` (required) | `{ project, match, existingStartCommands }` |
| POST | `/api/config/apps` | Add a brand-new app; body `{ key, app }`, `key` sanitized and `app` validated against `AppConfigWriteSchema` | `{ ok: true, key }` |
| POST | `/api/config/apps/:name/environments` | Add environments (e.g. from a scan) to an existing app, skipping keys that already exist; body `{ environments }` | `{ ok: true }` |
| PATCH | `/api/config/apps/:name/environments/:envKey` | Toggle whether an environment shows in the popover picker; body `{ enabled: boolean }` (required) | `{ ok: true }` |
| DELETE | `/api/config/apps/:name/environments/:envKey` | Remove a single environment from an app | `{ ok: true }` |
| PATCH | `/api/config/apps/:name` | Edit fields on an existing app via the hand-rolled `patchApp` (see the config-contract page for its validation shape and drift risk) | `{ ok: true }` |

## `backend/routes/prefs.ts` — 4 routes

User-preference sidecars: favorited apps and manual ordering. Both persist
separately from the main config file (via `favoritesStore.ts`).

| Method | Path | Purpose | Response (success) |
|---|---|---|---|
| GET | `/api/favorites` | Read favorited app ids | `{ favorites: string[] }` |
| PUT | `/api/favorites` | Replace favorited app ids; body `{ favorites: string[] }` (must be an array) | `{ favorites }` |
| GET | `/api/order` | Read manual app ordering | `{ order: string[] }` |
| PUT | `/api/order` | Replace manual app ordering; body `{ order: string[] }` (must be an array) | `{ order }` |

## `backend/routes/plugins.ts` — 10 routes

Plugin listing/lifecycle, invocation (app-scoped and global-scoped), and
catalog browsing. Every plugin lives permanently under `marketplace/<id>/`
(marketplace-by-reference model); `activated` (config.plugins membership)
and `enabled` (config.disabledPlugins non-membership) are two independent
flags computed from the top-level config, never stored per-plugin on disk
— see [Backend plugin system](../backend/plugins.md).

| Method | Path | Purpose | Response (success) |
|---|---|---|---|
| GET | `/api/plugins` | List every marketplace plugin with its computed `activated`/`enabled` flags | `{ plugins: MarketplacePlugin[] }` |
| GET | `/api/plugins/descriptors` | Batched control descriptors for every `activated && enabled` plugin across every app, plus a `__global` bucket for `scope: 'global'` controls | `{ [appName]: { [pluginId]: ControlDescriptor }, __global: { [pluginId]: ControlDescriptor } }` |
| POST | `/api/plugins/:id/invoke/:appName` | Invoke a plugin's app-scoped action; body `{ input? }`; 400s if the app/plugin doesn't exist, the plugin isn't `activated`, or it isn't `enabled` | `{ result: unknown \| null }` |
| POST | `/api/plugins/:id/invoke` | Invoke a plugin's global-scope action (no target app), sibling route to the app-scoped one above, same body convention and `activated`/`enabled` checks, no app existence check | `{ result: unknown \| null }` |
| POST | `/api/plugins/install` | Stage + validate a plugin from a local path, local `.zip`, or URL, then activate it; body `{ source: string }` (required). Only copies into `marketplace/<id>/` if that id isn't already on disk (e.g. previously installed then deactivated) — otherwise it's a cheap activate-only | installed `MarketplacePlugin` object |
| DELETE | `/api/plugins/:id` | **Deactivate** the plugin (drop its id from `config.plugins`) — does not touch its on-disk `marketplace/<id>/` directory, so it reappears in the Marketplace/catalog list | `{ ok: true }` |
| POST | `/api/plugins/:id/activated` | Activate/deactivate a plugin directly; body `{ activated: boolean }` (required) — the config-membership flag; 400s "plugin not found" if the manifest is missing | updated `MarketplacePlugin` object |
| POST | `/api/plugins/:id/enabled` | Enable/disable an already-activated plugin; body `{ enabled: boolean }` (required) — an independent second flag, distinct from activation | updated `MarketplacePlugin` object |
| POST | `/api/plugins/preview` | Preview a plugin's static manifest metadata from a source (folder/zip/url) without installing or executing any of its code — risk is whatever the manifest self-declares | `{ manifest }` |
| GET | `/api/plugins/catalog` | Fetch the plugin catalog; each entry's `installed` field means "activated" (config.plugins membership), not disk presence | `{ entries: CatalogEntry[] }` |

## Boot-time wiring (`server.ts`)

Before the Express app is constructed: config resolution runs (no first-boot
migration of the legacy state-dir name; importing the four provider modules
(`tmuxProvider`, `detachedProvider`, `initServiceProvider`,
`windowsServiceProvider`) registers every session provider as an import side
effect (see the session-providers page); `getGlobalConfigKeys()` is called
once at boot specifically to fail fast on a provider settings-key collision
(e.g. two providers both declaring a `sessionsDir` setting) rather than
surfacing it lazily on the first `PATCH /api/config/global`; and
`initConfig()` does the fail-fast initial config load into the shared
`configState` module that every route handler reads via `getConfig()`.

## The apps-domain barrel (`backend/apps/appManager.ts`)

Nothing under `backend/routes/` imports `apps/lifecycleOps.ts`,
`apps/statusService.ts`, `apps/sessionOps.ts`, etc. directly — they all go
through `apps/appManager.ts`, a thin facade that re-exports the historical
public surface (`primeProviders`, `resolveEffective`, `getAppStatus`,
`makeStatusContext`, `startApp`/`stopApp`/`restartApp`,
`getAttachCommand`/`listSessions`/`runShellCommand`/`runProcessInTmux`,
`resolveEffectiveForApp`) from the focused modules that actually implement
them. The file exists so `from '.../apps/appManager'` keeps working
unchanged even as the implementation gets split across files.

The same file also does one piece of real work at import time: it calls
`registerAppOps({ getAppStatus, makeStatusContext, startApp, stopApp,
restartApp, runProcessInTmux })` at module-eval — registering the apps
domain's functions against the neutral `core/appOps.ts` leaf so plugin
infrastructure (`plugins/runtime.ts`, `plugins/lifecycle.ts`) can call into
apps behavior without importing `apps/*` and creating an import cycle. This
runs synchronously before any `getAppOps()` call, because ES module import
ordering guarantees `statusService`/`lifecycleOps`/`sessionOps` (which
`appManager.ts` imports the five functions from) are fully evaluated before
`appManager.ts`'s own module body runs. See the session-providers page for
the full plugins↔apps cycle-break writeup.

## CLI entry point (`backend/index.ts`)

`index.ts` is the executable entry point for the orchestrator run as a CLI
(`#!/usr/bin/env node`), separate from `server.ts` (the Express app used by
the desktop shell). It loads the config file, initializes the process
registry, and presents a `readline`-based command-line interface for
starting, stopping, and inspecting apps and groups — deliberately built on
native Node.js modules only, no external CLI-framework dependency.

