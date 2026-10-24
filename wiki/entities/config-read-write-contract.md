---
type: entity
title: Config read/write contract
timestamp: "2026-07-30T12:00:00Z"
---

# Config read/write contract

The orchestrator's config lives at a single JSON (or limited-YAML) file and is
governed by two deliberately different validation strictness levels — one for
reading it off disk, one for writing changes back through the API. Getting
this asymmetry wrong (using the strict schema to read, or the lenient schema
to write) is the most common source of config-handling bugs, so it's worth
stating the rule explicitly.

## R1 — READ-path is LENIENT, WRITE-path is STRICT

**Read path** (`backend/config/loadConfig.ts` → `ConfigSchema.parse`,
`backend/config/schema.ts`):

- `ConfigSchema.parse` must never crash on a real, already-on-disk config.
  Users' configs accumulate legacy/hand-edited quirks, so every schema in the
  read path uses `.passthrough()` (unknown keys survive untouched) and marks
  fields optional wherever real configs are known to omit them.
- `AppConfigSchema.startCommand` is **optional** on read, even though a
  runnable app conceptually needs one — an app whose commands all come from
  its repo's `package.json` scripts (see "environments are derived, not
  declared" below) needs no top-level command of its own.
- `AppConfigSchema.repoPath` is likewise optional on read: apps that only run
  via `appUrl` don't need it.
- `.passthrough()` is applied at every object level (`EnvFilterConfigSchema`,
  `AppConfigSchema`, `WorkspaceConfigSchema`, `GlobalConfigSchema`,
  `ConfigSchema`) specifically so that **provider-specific keys survive**.
  Plugins and session providers stash their own config under known objects
  (e.g. `global.*`, `apps.*.plugins.*`); a schema that stripped unknown keys
  would silently delete third-party/provider config on every load-then-save
  round-trip. `PluginMetaSchema`/`ControlDescriptorSchema` are the only
  schemas that `.strip()` — those are internal-only shapes, never user config.
- `PluginMetaSchema`'s optional fields use `.catch(undefined)` rather than
  plain `.optional()`, so a wrong-typed optional value (e.g. a non-string
  `description`) is silently dropped instead of rejecting the whole plugin —
  reproducing the old hand-rolled `validatePluginMeta`'s permissiveness.
  `CatalogEntrySchema` goes further with `.catch(default)` (empty string /
  `false`) so a malformed catalog entry is *kept*, not skipped.

**Write path** (`backend/config/configValidation.ts` → `AppConfigWriteSchema`
in `schema.ts`, used by `POST /api/config/apps`):

- `AppConfigWriteSchema` requires `label` (non-empty) and `startCommand`
  (non-empty) — creating a new app through the API must supply both; there's
  no per-environment escape hatch at creation time the way there is for
  configs that already exist on disk.
- `repoPath` stays optional on write too — not every new app needs a repo.
- This is a **different schema object** from the read-path `AppConfigSchema`,
  not the same schema with a stricter mode toggled — the two are allowed to
  diverge because they answer different questions ("is this on-disk data
  well-formed enough to load" vs "is this new app payload complete enough to
  create").

## Compile-time type-vs-schema assertions

Every schema in `schema.ts` is followed by a `_assert<...>()` call using one
of two helper types:

```ts
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type AssignableTo<A, B> = A extends B ? true : false;
const _assert = <_T extends true>() => {};
```

- `Exact<z.infer<typeof Schema>, InterfaceType>` is used where the zod schema
  is meant to describe the type precisely in both directions (e.g.
  `AppSurfaceSchema` vs `AppSurface`,
  `PluginMetaSchema` vs `PluginMeta`, `SurfaceSchema` vs `Surface`,
  `ControlDescriptorSchema` vs `ControlDescriptor`).
- `AssignableTo<z.infer<typeof Schema>, InterfaceType>` is used wherever the
  schema's *inferred* type is intentionally narrower/looser than the
  hand-written interface — e.g. `EnvFilterConfigSchema`, `AppConfigSchema`,
  `WorkspaceConfigSchema`, `GlobalConfigSchema`, and `ConfigSchema` all use
  `.passthrough()`, which changes the inferred TS shape (extra unknown keys)
  in a way that isn't literally identical to the interface but must still be
  assignable to it.
- These assertions run at compile time only — `_assert` is never called with
  a `false` type argument in passing code, so a schema/type drift becomes a
  TypeScript build error rather than a runtime surprise. There is no runtime
  cost; the calls compile away.
## config folder is the anchor

`backend/config/loadConfig.ts` handles the case where the configured
`CONFIG_FILE` path doesn't exist yet — this is the normal first-run state for
a packaged desktop app (no config was ever shipped or hand-created). Instead
of throwing (which used to crash the packaged server before it could even
serve `/api/config`), it:

1. Synthesizes a minimal default (`{ apps: {}, global: { sessionsDir, stateFile } }`)
   with `sessionsDir` from `APP_SESSIONS_DIR` (set by the Rust shell in packaged
   mode) and `stateFile` as the bare relative `state.json`.
2. Writes it to disk via a temp-file-then-atomic-rename (`fs.writeFileSync`
   with `flag: 'wx'` + `fs.renameSync`), so a crash mid-write leaves only an
   orphaned `.tmp` file rather than a truncated/corrupt config that would
   crash-loop every subsequent boot.
3. Only auto-creates `.json` paths — a `.yaml`/`.yml` `CONFIG_FILE` that
   doesn't exist throws a clear error instead, because the auto-create logic
   only knows how to serialize JSON; writing JSON text under a `.yaml` name
   would make the *next* load dispatch to the YAML parser and fail
   confusingly on JSON syntax.

The invariant is **`stateDir := dirname(configFile)`**: the config file,
`state.json`, every sidecar, and the session-output dir all live in one folder.
In a dev checkout that folder is `<repo>/state/`; in a packaged app it is
Tauri's already-private `app_config_dir()`, with no `state` nesting added.

Paths are stored **relative** in the file and resolved to absolute **in memory**
against the config's own directory (`path.resolve(configDir, value)`, a no-op for
values that are already absolute). Resolving against `process.cwd()` was a real
bug: the packaged shell spawns the backend with no `.current_dir()`, so cwd is `/`
and a relative `state.json` resolved there became unwritable — every state write
failed. Baking an absolute path into the file was the opposite failure: the config
stopped being portable the moment it moved. Storing relative + resolving from the
config's folder satisfies both.

`configLocation.ts` is the single source for the folder and file names
(`STATE_DIR_NAME`, `CONFIG_FILE_NAME` = `loki-config.json`). There is deliberately
**no migration path** from the older layout — no legacy filenames are read.

## environments are derived, not declared

An app's environments are **not** stored in the config. They are the scripts
of the app's own `package.json`, filtered down to the ones worth launching:

1. `backend/apps/effectiveConfig.ts` / `envScripts.ts` read the repo's script
   names (at the working tree, or at a git ref for a preview).
2. `resolveEnvFilter(config.global?.environmentFilterRegex, app.environmentFilter)`
   picks the regex — a global default with an optional per-app override
   (`EnvFilterConfigSchema` = `{ useGlobal, filterRegex? }`).
3. `filterScriptNames(scriptNames, regex)` yields `matched`. An **invalid**
   persisted regex must never block a launch: the code falls through to all
   discovered script names instead of erroring.
4. The user's persisted `selection.environment` wins only if it is present in
   `matched`; otherwise `matched[0]` is used. The result surfaces as
   `status.selectedEnvironment`.

An environment therefore has no stored `enabled` flag, no label and no
per-entry `startCommand` — it *is* a script name. There are no CRUD routes for
environments, because there is nothing to create or delete.

What lives config-side is only the filter: `global.environmentFilterRegex`
and `app.environmentFilter`. What the user picks is a *selection*, written via
`POST /api/apps/:name/environment` and stored in the selections sidecar, not in
the config.

## Known drift risk: patch paths are hand-rolled

`backend/config/appConfigOps.ts`'s `patchApp()` (used for `PATCH` updates to
an existing app: `label`, `repoPath`, `repoUrl`, `appUrl`, `dependsOn`,
`surface`, `icon`, `groups`, `plugins`) does **not** go through zod. Each
field is validated by hand with an `if ('field' in patch) { ... }` block and
ad-hoc type/shape checks (e.g. `typeof patch.label !== 'string'`,
`APP_SURFACES.includes(patch.surface)`).

There is a `AppConfigPatchSchema` mentioned in the project's refactor
backlog as a dead/unused export — the intent was presumably to replace this
hand-rolled validation with a zod schema mirroring `AppConfigWriteSchema` but
with all fields optional. That wiring was never done. This is a known,
currently-accepted drift risk: `patchApp`'s hand-rolled checks and the
write-path zod schemas can silently diverge over time (e.g. a new field
added to `AppConfigWriteSchema` without a matching case in `patchApp`, or
vice versa). See the repo's `REFACTOR_BACKLOG.md`, item F3 ("zod
write-boundary create-only; patch paths hand-rolled;
`AppConfigPatchSchema` dead → drift"), status: deferred — decision needed on
whether to wire the patch schema in or explicitly document the divergence as
permanent.

## App fields: `dependsOn`, `groups`, `plugins`, `surface`, `icon`

- `AppConfig.plugins` is `Record<pluginId, Record<string, unknown>>`. A
  plugin's app-scoped control renders on an app **only if its id is present
  as a key** in this map (edited in the Apps tab, same UX as `groups`); the
  value is a per-app config namespace for that plugin, and an empty object
  still counts as "attached with no config."
- `AppConfig.surface` (`'list' | 'dock'`) is optional in the type because the
  config file may legitimately omit it; `loadConfig` normalizes a missing
  value to `'list'` in memory, so every downstream consumer can treat
  `surface` as guaranteed present without an extra fallback.
- `AppConfig.icon` is an opaque non-empty string to the backend — it is
  never validated against any icon-name list (the backend has no
  `lucide-react` dependency; that check is a frontend concern). It is a
  **distinct concept** from `ControlDescriptor.icon` (an allowlisted
  kebab-case lucide icon name for plugin controls) — different interface,
  different shape, and deliberately not unified behind a shared "resolve
  icon" helper.
- `AppConfig.groups` is a freeform per-app tag list with no controlled
  vocabulary (e.g. `"LinguaReef"`/`"LR Extention"`); membership is expressed
  on the app, not in a separate group registry. `Config.groupOrder` (a
  root-level array of tag names) is the only group-level state the config
  carries, and it only fixes display order. A group is nothing but the set of
  apps carrying its tag.
- `APP_SURFACES = ['list', 'dock'] as const satisfies readonly Surface[]`
  is the single source of truth for `AppSurface`, deliberately derived from
  the broader `Surface` union (`'list' | 'menu' | 'dock' | 'header'`, where
  `'menu'`/`'header'` are plugin-only placements an app can never use) via
  `satisfies` rather than hand-duplicated — so `AppSurface` can never drift
  out of sync with `Surface`.

## Staleness caveat: `hasStashForBranch`

`RuntimeStatus.hasStashForBranch` (`backend/runtime.types.ts`) is a raw JSON
read against the sidecar stash map (`gitStashStore.ts`) — no git spawn. It
can go stale if the stash was dropped outside the orchestrator (e.g. a
manual `git stash drop` in a terminal); see FR-14/FR-44 for the known
tracked limitation. Callers must not treat it as a live git-truth check.

## `configState.ts` — sole synchronous owner of in-memory config

`configState.ts` replaced a scattered `let config` with 9 reassignments
across `server.ts` with a single writer (`reloadConfig`) and a single
guarded reader (`getConfig`). Route handlers run `mutate…File();
reloadConfig()` with no `await` in between.

**Update**: `backend/config/configMutation.ts`'s mutators (`mutateConfigFile`,
`mutateGlobalConfigFile`, `mutateGroupOrderFile`, `mutatePluginsFile`,
`mutateDisabledPluginsFile`) are no longer bare synchronous
`readFileSync`/`writeFileSync` calls with no lock — they're now `async`
and serialized per resolved absolute config-file path through an
in-process `withFileLock`/`fileLocks` promise-chain (`configMutation.ts:19-39`).
This closes a real race that plain read→mutate→write left open: two
overlapping mutations against the *same* file (e.g. installing a plugin
racing a separate activate-toggle call) could both read the same
pre-mutation JSON and have one silently clobber the other's change on
write. The lock is single-process, in-memory only (no cross-process/file
locking) — sufficient because a single Node process is the only writer to
begin with — and swallows a failed turn's rejection in the tracked tail so
one bad mutation never wedges the queue for later callers. Every write
still lands via a shared `writeJsonAtomic` (unique tmp path + `renameSync`)
helper, so an individual write is also non-torn on top of being
race-free; see [Backend config & core module map](../backend/config-core.md)'s
`configMutation.ts` row for the file-by-file detail.

## `patchGlobalConfig` and the provider-key allowlist

- `getGlobalConfigKeys()` (`backend/config/globalConfigOps.ts`) is the
  allowlist for `global.*` patch keys: `BASE_GLOBAL_CONFIG_KEYS` (core
  config not owned by any session provider — `packageManager`,
  `defaultShell`, `stateFile`, `pluginCatalogUrl`, `sessionProvider`,
  `nodePath`) plus every registered provider's own settings keys (e.g.
  `tmuxBin`, `socketPath`, `sessionPrefix` from the tmux provider,
  `sessionsDir` from the detached provider). It is computed as a **function called per request, not a
  module-load `const`** — providers self-register via side-effecting
  imports (`import '../apps/providers/tmuxProvider'` etc.), and a
  module-load const could evaluate before those imports run, silently
  dropping provider keys from the allowlist. It throws if a provider
  declares a settings key that collides with a base key, since that would
  let a provider's free-text setting shadow/bypass a core key's own
  validation (e.g. `sessionProvider`'s id check).
- `patchGlobalConfig`'s clear convention: an empty string or `null` value
  for a key **deletes that key from the file** (falls back to
  `loadConfig`'s default), matching `patchApp`'s convention for optional
  string fields — this is the general "clear = null/empty" rule for the
  whole config-patch surface, not special-cased per key.
- Within `patchGlobalConfig`, a key that matches a field in
  `GlobalConfigSchema.shape` (a known base key) is validated against that
  field's real zod schema (e.g. `attachBehavior` is checked as its actual
  enum). Provider-registered keys aren't in `.shape` — a static schema
  can't know a dynamically-registered provider's setting types — so they
  keep looser string/boolean acceptance instead.

## `jsonStore.ts` — shared sidecar/path store factory

Collapses a repeated path-derive + guarded-read + mkdirp-write triad into
one factory, covering two flavors: config-derived sidecar files that
swallow read errors and return a default (`favoritesStore`, `gitStashStore`,
`pluginState`), and explicit-path files that throw on parse error
(`registry`, `selections`, `groupSelections`). Before this factory existed, each of those
callers hand-rolled its own version of the same read/write dance.

## `loadConfig.ts` — remaining read-path notes

- YAML support is **intentionally limited**: a `.yaml`/`.yml` config is run
  through a rudimentary custom transform (`parseSimpleYaml`, see below),
  not a real YAML library. Production configs should stay JSON to avoid
  ambiguity; YAML is a convenience, not a fully-specified format.
- `global.sessionsDir`'s default source order: an explicit `global.sessionsDir`
  in the file wins, otherwise `process.env.APP_SESSIONS_DIR` (set by the Rust
  desktop shell in packaged mode) wins, otherwise the relative default
  `sessions` — a **sibling of the config file**, not a nested `state/`,
  since the config already lives in that folder. In dev, `APP_SESSIONS_DIR` is
  unset, so the relative default applies unchanged.

## `parseSimpleYaml` — grammar subset, not a real parser

`backend/config/yamlParser.ts` handles only nested objects/lists via
indentation. It does **not** support anchors, references, multi-line
strings, or complex scalar types, and any value containing a colon must be
quoted. This is a known, accepted scope limitation stated up front rather
than a bug — callers relying on richer YAML features will get silently
wrong parses, which is why JSON is the recommended format (see above).

## `resolveSessionsDir` — one resolver shared by detection and runtime

`backend/config/scan.ts`'s `resolveSessionsDir(configFilePath, sessionsDir)` is
the single shared formula (`sessionsDir` if set, else `sessions`, always resolved
against the **config file's folder**) used by **both** `detectRuntime()` (what the
Settings UI displays as `detected.sessionsDir`) and `appManager.primeProviders()`
(where the detached provider actually writes session output). Keeping one function
guarantees the displayed path and the real write path can never silently disagree.

The concept is named **sessions**, not logs: these files are the stdout/stderr of
the apps the orchestrator launches, and for a detached spawn they are that
process's only output channel. The tmux provider writes none of them — its output
lives in the tmux session. `detachedProvider` keeps its own module-local
`resolveSessionsDir()` (same name, different module) which falls back to
`os.tmpdir()` when priming hasn't run.

`detectComponents()`'s tmux check reuses `tmuxProvider`'s own cached
`availability()` result and resolved binary path instead of forking a fresh
`tmux -V` — every caller of `detectComponents()` reaches it via a route
that already touched `listProviderMeta`/`resolveProvider`, which call
`availability()` themselves, so the cache is already warm.

## `process/selections.ts` — legacy string migration on read

`selections.json` is the **global** per-app selection store, keyed by app
name only. It is no longer the only environment-selection store: a second
sidecar keyed by `(group tag, app name)` takes precedence for rows rendered
inside a group section, and group starts deliberately do not write back into
`selections.json` — see
[Per-(group, app) branch & environment intent](group-app-intent-contract.md).

Reading the selections sidecar coerces old variant-only string values (the
legacy pre-environments format) into `{ environment: <string> }` on the
fly, so old selection files keep working without a one-time migration
script. Any other invalid JSON in the file is still a hard error — this
coercion is narrowly scoped to the one known legacy shape.

## `routes/config.ts` — detect/reset semantics

- `POST /api/config/global/detect` re-probes provider availability with
  `bypassCache: true` and re-detects components, returning the same
  response shape as the cheap cached `GET`. This lets a user recover from a
  mid-session install (e.g. installing tmux while the app is running) via
  an explicit "Detect again" click, while the polled `GET` path stays cheap
  by trusting the cache.
- `POST /api/config/global/reset` drops every key in `getGlobalConfigKeys()`
  **except** `sessionsDir`, `stateFile`, and `pluginCatalogUrl` (the
  `RESETTABLE` set) — those three are excluded because they aren't
  user-facing "settings" a reset should touch; dropping them would fall
  back to `loadConfig`'s absence-means-default logic in ways that could
  move the state/log location out from under a running app. `RESETTABLE`
  is computed at request time (not a module const) since providers
  self-register, same rationale as `getGlobalConfigKeys()` above.

## Desktop: `jv` — validating fetch variant (Phase A)

`app/src/api.ts`'s `jv<S>(r, schema)` is a validating sibling of the
plain `j<T>(r)` cast-only helper: same error handling, but parses the JSON
body against a zod schema instead of trusting the cast. It's reserved for
the highest-risk, structurally-rich responses — `getConfig`, plugin
descriptors/list, catalog — rather than rolled out to all ~35 call sites at
once. This is Phase A of a larger zod-validation migration (see the
project's `zod.md` §6); everywhere else keeps the unchecked `j<T>` for now.

## Desktop: `useEnvironmentSettings` — `loadSeqRef` load-ordering guard

`components/Settings/useEnvironmentSettings.ts` stamps each `load()` call
with a sequence number in `loadSeqRef` and only lets the still-latest
request commit its result into state. This guards against a `patch()`'s
trailing `load()` racing the initial mount `load()` (or two quick patches
in a row), where a stale response arriving after a newer one would
otherwise silently overwrite fresher state.

## Desktop: `GroupMenu` — `allSettled` patch across derived-group members

`components/portals/GroupMenu.tsx`'s `applyToDerivedMembers` patches every
member of a derived group's `groups[]` field, issuing every `patchApp` call
(never aborting on first failure) and collecting results via
`Promise.allSettled`. This avoids leaving disk half-applied mid-loop (e.g.
a group split into old+new name, or a delete only partially taking effect)
— the code always reloads from disk truth afterward regardless of outcome,
and surfaces any failure through the existing `cfgMsg` channel instead of
swallowing it.

## Desktop: `selectors.ts` — `effectiveRepoPath` mirrors backend resolution

`store/selectors.ts`'s `effectiveRepoPath` client-side reimplements the
backend's `resolveEffective` precedence from `appManager.ts`
(`env.repoPath -> version.repoPath -> app.repoPath`), using the app's
persisted selection the same way `AppRow` derives `selVersion`/`selEnv`.
This recomputation exists because `AppStatus` doesn't carry a resolved
`repoPath` field the way it does for `repoUrl`/`appUrl` — the frontend has
to derive it itself from the already-loaded config, and must keep the
precedence order in sync with the backend by hand.

## Desktop: `store/groupOps.ts` — `startApps` re-reads state between steps

`startApps(names, groupId?)` starts each app sequentially through
`applyGroupIntentAndStart`, calling `getState()` fresh before each step
rather than working off a snapshot taken once at the start of the loop — so
state changes from an earlier app's start (or from other concurrent
activity) are visible to later steps. When `groupId` is passed, each step
first checks out that group's intent branch and then starts with
`persistSelection: false`; with `groupId` undefined it collapses to a plain
start on the app's own persisted selection. There is deliberately no "stop
other groups" pre-step here.

## Desktop: optimistic-persist pattern and its one exception

Several Redux slices use the same optimistic pattern — update local state
immediately, then persist to the server fire-and-forget:

- `favoritesSlice.toggleFavorite` — update local state, persist
  fire-and-forget, no special failure handling.
- `orderSlice.reorder` — reads `order` and `config` fresh from
  `getState()` (not a stale render snapshot) so the reorder matches
  whatever `effectiveOrder` currently computes to, then persists
  optimistically the same way.
Group membership rides `AppConfig.groups` and is persisted through the
ordinary `patchApp` path, so it needs no slice or listener of its own.

Because `fetchConfig` only fires once at mount (see `usePolling`) there is no
periodic re-fetch to reconcile Redux with disk, so `appsSlice`'s
`fetchConfig.rejected` handler is the only one of the config/apps-family
thunks that surfaces its rejection via `cfgMsg` — `refreshAll`/`fetchApps`
poll on an interval, so surfacing every rejected poll would produce a
recurring noisy banner instead of a one-time actionable message.

## Desktop: `gitSlice` — per-app error state and edge cases

- `branchesError` and `checkoutError` are both keyed **per-app**
  (`Record<string, string | undefined>`), not a single global string —
  a shared string would leak one app's fetch/checkout error onto every
  other app's branch picker row.
- `fetchBranches` is dispatched **lazily**, only when a branch picker is
  opened — never from `refreshAll()`/`usePolling`, since branch lists
  aren't part of the regular status poll. Consequently
  `git.branchesByApp[name].current` is picker-only state; the **live**
  branch signal is `apps.apps[name].branch` — see
  [Branch signal & refresh scope](branch-signal-and-refresh-scope.md).
- `dropStash`'s thunk contract requires the consumer to gate the dispatch
  behind an explicit confirm modal — the thunk itself performs no
  confirmation, so any new call site must add one.
- `switchBranch.fulfilled` treats a `200` response body with `ok: false`
  (a step-1/2 failure inside a 2-step checkout, e.g. stash-push or the
  checkout itself failing) the same as the `409` "unresolved conflict"
  path: both set `checkoutError[appName]` and surface as the same blocking
  banner, rather than the `ok: false` case being silently swallowed as if
  it were a success (see FR-37).

