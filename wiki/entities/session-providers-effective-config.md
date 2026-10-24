---
type: entity
title: "Session providers & effective config"
timestamp: "2026-07-23T19:27:47Z"
---

# Session providers & effective config

# Session providers & effective config

## What a session provider is

A `SessionProvider` (`backend/apps/sessionProvider.ts`) is the abstraction
over "how do we actually spawn and supervise an app's dev process" — tmux
window, OS-detached background process, a Windows service, an init-service
(e.g. systemd/launchd style), etc. Every concrete provider implements the
same interface:

- Required: `id`, `label`, `description`, `icon`, `platforms`, `recommended`,
  `benefits`, `availability()`, `start()`, `stop()`, `listSessions()`,
  `sessionAlive()`, `getAttachCommand()`.
- Optional "de-leak" hooks that not every provider can support, so callers
  must feature-detect rather than assume: `sessionState()` (richer liveness
  than the plain boolean), `setSessionLabel()` (e.g. renaming a tmux pane
  title), `runCommand()` (fire-and-forget command in a labeled
  window/session), and `settings` (provider-owned config fields rendered
  generically by the settings UI, with a `kind` rendering hint — text/path/
  select/boolean — and optional `advanced`/`copyable` flags).
- `availability()` is cheap and cacheable by design because it sits on the
  hot poll path (`resolveProvider()` → `getAppStatus()`); callers pass
  `{ bypassCache: true }` only for the explicit "Detect again" action.

Concrete implementations live in `backend/apps/providers/`:
`detachedProvider.ts`, `tmuxProvider.ts`, `initServiceProvider.ts`,
`windowsServiceProvider.ts`.

## Registration: side effect at import

There is no explicit provider list to edit. Each provider module calls
`registerProvider(theProvider)` at module top level — a plain side effect
that runs the moment the module is imported:

```ts
// end of detachedProvider.ts / tmuxProvider.ts / initServiceProvider.ts / windowsServiceProvider.ts
registerProvider(detachedProvider); // (or tmuxProvider / initServiceProvider / windowsServiceProvider)
```

`registerProvider()` is idempotent by id (`if (providers.some(p => p.id === newId)) return;`),
so importing a provider module twice is harmless. **The practical
consequence: a provider that is never imported anywhere is never
registered**, and `resolveProvider()`/`listProviderMeta()` simply won't know
it exists — there's no compile-time or runtime check that all four provider
files actually got imported by the app's entry point. `providerRegistry.ts`'s
`primeProviders()` is the concrete place two of them (tmux, detached) are
guaranteed to be imported (`import { configure as configureTmux } from
'./providers/tmuxProvider'`, ditto detached), which is also how their
registration is triggered in practice — importing for the `configure()` call
incidentally runs the `registerProvider()` side effect at the bottom of the
same file.

`resolveProvider(config)` picks the active provider: prefer
`config.global.sessionProvider` by id if it's registered and available,
otherwise fall back to the first registered-and-available provider in
registration order (which is import order). `computeRecommendedId()` does a
similar walk but filtered to providers whose `platforms` include the current
host and whose `recommended` flag is set, for the settings UI's "Recommended"
badge only — it never auto-selects.

## The `appOps` inversion: breaking the plugins ↔ apps cycle

`backend/core/appOps.ts` exists purely to let plugin infrastructure
(`backend/plugins/runtime.ts`, `backend/plugins/lifecycle.ts`) call into the
apps domain (`startApp`, `stopApp`, `restartApp`, `getAppStatus`,
`runProcessInTmux`) **without** `plugins/*` importing `apps/*` directly.
Without this indirection, `apps/lifecycleOps.ts` importing
`plugins/lifecycle.ts` (to fire `onStart`/`onStop` hooks) while
`plugins/lifecycle.ts` also needed to import `apps/*` to actually start/stop
things would be a straight import cycle.

The break:

1. `backend/core/appOps.ts` declares the `AppOps` interface (a neutral leaf —
   imports only shared types, no `apps/*`, `plugins/*`, `fs`, or `path` — so
   it can never itself participate in a cycle) plus a module-level
   `impl: AppOps | undefined`, `registerAppOps(ops)`, and `getAppOps()`.
2. `backend/apps/appManager.ts` implements `AppOps` with the real
   `apps/lifecycleOps.ts` functions and calls `registerAppOps({ getAppStatus,
   startApp, stopApp, restartApp, runProcessInTmux })` at module-eval time —
   another import-time side effect, same pattern as provider registration.
3. `plugins/runtime.ts` / `plugins/lifecycle.ts` call `getAppOps()` — but only
   lazily, inside request-time or lifecycle-time closures, **never at their
   own module-eval time**. This ordering matters: if a plugin module called
   `getAppOps()` at import time, it could run before `appManager.ts` had a
   chance to call `registerAppOps()`, and `getAppOps()` would throw
   (`"AppOps not registered: import backend/apps/appManager before using
   plugin runtime/lifecycle"`).

Net effect: `apps/*` still depends on `plugins/*` (to fire lifecycle hooks),
and `plugins/*` depends only on `core/appOps.ts` (not on `apps/*`), so the
dependency graph stays acyclic while both sides can still call each other's
behavior at runtime.

## How effective config resolves

`backend/apps/effectiveConfig.ts`'s `resolveEffective(app, selection)` is the
single place that merges an app's environment-scoped config with its
app-level fallback into one flat `Effective` object
(`environmentKey`, `startCommand`, `port`, `repoPath`, `repoUrl`, `appUrl`):

1. **Environment selection**: use the persisted/passed `selection.environment`
   if it names an environment that actually exists on this app; otherwise
   silently fall back to the app's *first* environment key
   (the first filter-matched script name) — this tolerates a persisted
   selection referencing an environment that was since renamed/deleted.
2. **Field-by-field override**: for each of `startCommand`, `repoPath`,
   `repoUrl`, `appUrl`, the selected environment's value wins if present,
   else the app-level value (`env?.startCommand ?? app.startCommand`, etc).
   `port` has no app-level fallback — it only ever comes from the
   environment (an app-level default port doesn't exist in the schema).

`startCommand` and `repoPath` are typed **optional** on `Effective` on
purpose — mirroring the read-path schema leniency documented for
`AppConfigSchema` (see the config-contract page) — because a selected
environment might supply neither and neither might the app. Callers that
merely display status (`getAppStatus`) never touch these fields and are fine
with `undefined`. **The guarded hard-fail** lives in
`backend/apps/lifecycleOps.ts`'s `startAppLocked()`, the one caller that
actually needs to spawn a process:

```ts
if (!eff.startCommand) {
  throw new Error(`App "${appName}" has no startCommand: set "startCommand" on the app or on environment "${eff.environmentKey ?? '(none)'}"`);
}
if (!eff.repoPath) {
  throw new Error(`App "${appName}" has no repoPath: set "repoPath" on the app or on environment "${eff.environmentKey ?? '(none)'}"`);
}
```

Failing loudly here — rather than letting `undefined` silently reach
`provider.start()` (whose `StartArgs.repoPath`/`startCommand` are required,
non-optional) — turns a would-be `undefined`-passed-as-string runtime bug
into a clear, actionable error naming the app and the environment that's
missing config.

`getSelectionsPath(config)` derives the per-app selections sidecar
(`selections.json`) from `path.dirname(config.global.stateFile)`, falling
back to `state/selections.json` only if `stateFile` is somehow unset
(shouldn't normally happen since `loadConfig` always fills it in — see the
config-contract page).

That sidecar holds the **global** selection for an app. A start may
deliberately bypass writing it: `startApp(config, appName, sel, force,
persistSelection = true)` skips the `writeSelection` call when
`persistSelection` is `false` (`lifecycleOps.ts:49`, driven by
`req.body.persistSelection !== false` in `routes/apps.ts:58`) while still
resolving the effective config from the merged selection. Group starts use
this so a group's environment never leaks into the app's global selection;
what the process actually launched with is then only recoverable from
`AppStatus.runningEnvironment` (see
[Per-(group, app) branch & environment intent](group-app-intent-contract.md)).

## Per-app start lock

`lifecycleOps.ts` keeps a module-level `startLocks: Map<string, Promise<unknown>>`
keyed by app name. `startApp(config, appName, sel, force, persistSelection)` is a thin wrapper
that routes the real work (`startAppLocked`) through `withStartLock`, which
chains onto whatever promise is currently in flight for that same app name
(`prev.then(fn, fn)` — runs `fn` whether the previous attempt resolved or
rejected) and stores the new tail back into the map, self-pruning once
drained. This serializes the check→spawn→register critical section **per
app**: two concurrent start requests for the same app run one after another,
so the second observes the first's now-`running` status via `getAppStatus`
and returns early instead of double-spawning (which would orphan the first
process and leak its port when the second `updateProcessState` call
overwrote the first's pid). Different apps still start fully in parallel
because each has its own map key, and dependency recursion
(`app.dependsOn` → recursive `startApp(config, dep)`) is deadlock-free
because each dependency locks under its own distinct app-name key rather
than reusing the parent's lock.

## `StatusContext`: hoisting shared reads for an N-app status sweep

`GET /api/apps` (`backend/routes/apps.ts`) calls `getAppStatus` once per
configured app in a loop. A few of the reads inside `getAppStatus` are
identical for every app in that loop — `primeProviders(config)`,
`selections.json`, and one provider-wide session snapshot (e.g. a single
`tmux list-windows` fork) — so redoing them per app would mean N provider
primes and N tmux forks for one HTTP request.

`makeStatusContext(config)` (`backend/apps/statusService.ts`) computes these
once, in a fixed order that matters: prime providers first (so
`resolveProvider()`/`snapshot()` see the configured tmux binary/socket/session),
*then* read selections, *then* take the active provider's liveness snapshot.
The route handler calls it once and threads the resulting `ctx` into every
`getAppStatus(config, name, registry, ctx)` call in the sweep. Every field on
`StatusContext` is optional and `getAppStatus` computes each one inline when
`ctx` (or the specific field) is absent — so a standalone call with no `ctx`
is byte-identical to the pre-hoist behavior, and `ctx?.primed` gates whether
`getAppStatus` re-primes providers itself.

`StatusContext` itself is defined in the leaf `runtime.types.ts` module (not
in `statusService.ts`) so `core/appOps.ts` can reference the type without an
`apps/*` import — see the module-boundary contracts page.

## Liveness semantics: "present" is not "running"

`getAppStatus`'s session-liveness check prefers `provider.sessionState()`
(when the active provider implements it) over the plain `sessionAlive()`
boolean. `sessionState()` reports `present`/`dead`/`pid` separately because a
session can exist without a live process behind it — e.g. tmux's
`remain-on-exit` option (see the git/session provider notes below) keeps a
crashed pane's window around so a user can still attach and read the crash
output. That state must surface as `unhealthy`, not silently collapse into
either "running" (what a bare `sessionAlive()` true would imply) or
"stopped" (what a caller might assume once the window is gone). Providers
without a richer notion of session state simply omit `sessionState()`, and
`getAppStatus` falls back to the boolean.

The `ctx?.sessionSnapshot` taken once by `makeStatusContext` is handed to
`sessionState()`/`sessionAlive()` on every call in a sweep so the provider
answers from the pre-taken snapshot instead of re-probing per app.

## Two-key session-name resolution in `listSessions()`

`backend/apps/sessionOps.ts`'s `listSessions()` maps each provider session
back to the app that owns it. tmux's window name is the *sanitized* app name
(dots/colons/whitespace stripped by `windowName()`), so a direct
`config.apps[sessionName]` lookup would miss any app whose name needed
sanitizing. The fix is a reverse map built from `windowName(appName) ->
appName` up front, checked first; only if that misses does the code fall
back to a direct `config.apps[name]` match — which covers providers (e.g.
`detachedProvider`) that use the raw app name as the session name verbatim,
with no sanitization step to reverse. Both lookups are needed because no
single key format is correct for every provider.

