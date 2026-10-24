---
type: concept
title: Backend module boundary contracts
timestamp: "2026-07-24T08:16:18Z"
---

# Backend module boundary contracts

# Backend module boundary contracts

A handful of backend modules are deliberately kept as **leaf modules** —
importing nothing (or almost nothing) so they can sit underneath the rest of
the dependency graph without ever risking an import cycle. This page collects
the "why" for each one; the rule in every case is the same shape: *don't add
an import here, even one that looks harmless, without checking who depends on
this file staying leaf.*

## `backend/runtime.types.ts` — fs/path-free by design

`AppSelection` (the per-app persisted selection: version and/or environment
key) is defined here rather than in `process/selections.ts`, specifically so
this module stays free of runtime-bearing imports (`fs`/`path`). Desktop's
`tsc` compile graph pulls in `backend/types.ts` directly (see below) and must
not be forced to resolve Node-only modules along the way.

`StatusContext` — the per-request bundle of shared reads
(`selections`/`sessionSnapshot`/`primed`) threaded into every `getAppStatus`
call during a multi-app sweep (`GET /api/apps`, `buildDescriptors`) — is also
defined here rather than in `apps/statusService.ts` where it's built. Two
reasons: (1) it lets the neutral `core/appOps.ts` surface reference the type
without an `apps/*` import, and (2) `sessionSnapshot` is typed `unknown` (an
opaque provider-produced snapshot — see `SessionSnapshot` in
`apps/sessionProvider.ts`) precisely to keep this module import-free; only the
provider that produced a snapshot knows its concrete shape. Every field on
`StatusContext` is optional so a standalone (non-hoisted) call computes each
value inline and stays byte-identical to pre-hoist behavior.

## `backend/types.ts` — the barrel must stay import-free

`types.ts` is a barrel: it re-exports the cohesive type modules
(`config.types.ts`, `runtime.types.ts`, `plugin.types.ts`) so every existing
`from '.../types'` import keeps working unchanged. It is kept free of
runtime-bearing imports (`fs`/`path`) because **desktop's `tsc` compile graph
pulls in `backend/types.ts` directly** — the desktop side type-checks against
this file without running a Node runtime, so any Node-only import here would
break desktop's build, not just backend's.

## `backend/config/statePaths.ts` — standalone leaf to dodge a provider-registration cycle

`statePaths.ts` imports only `node:path` and the `Config` type. This is
deliberate: it needs to be importable by every store that currently imports
only `../types` — `favoritesStore`, `gitStashStore`, `pluginState`,
`registry`, etc. — **without dragging in `configStore.ts`**, which
side-effect-imports the session providers (see the provider-session-lifecycle
page for what that side effect does). If `statePaths.ts` imported
`configStore.ts`, every one of those currently-lightweight stores would
transitively register every session provider just by resolving a state-file
path — an import cycle risk and an unwanted side effect bundled into an
unrelated concern.

## `backend/core/appOps.ts` — the neutral leaf that breaks the plugins↔apps cycle

`AppOps` is the interface plugin infrastructure (`plugins/runtime.ts`,
`plugins/lifecycle.ts`) uses to call into the apps domain
(`getAppStatus`/`startApp`/`stopApp`/`restartApp`/`runProcessInTmux`) without
importing `apps/*` directly. It is a neutral leaf: it imports **types only** —
no `apps/*`, no `plugins/*`, no `fs`/`path` — so it can never itself
participate in an import cycle no matter what depends on it.

`backend/apps/appManager.ts` registers the concrete implementation at
module-eval time via `registerAppOps(...)`. Plugin runtime and lifecycle code
resolve it lazily via `getAppOps()`, and **only inside request-time or
lifecycle-time closures — never at their own module-eval time**. This
ordering matters: if a plugin module called `getAppOps()` at import time, it
could run before `appManager.ts` had a chance to call `registerAppOps()`, and
`getAppOps()` would throw ("AppOps not registered"). See the
session-providers-effective-config page for the full appOps-inversion
writeup (how this breaks the `apps/*` ↔ `plugins/*` cycle end to end).
