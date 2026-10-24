---
type: concept
title: Backend plugin system
timestamp: "2026-07-30T12:00:00Z"
---

# Backend plugin system

> **Note:** plugins are no longer only in `marketplace/`. They are
> discovered from the user's plugin folders (`global.pluginFolders`, default
> `plugins/` next to the config) and then the built-in `marketplace/`, first
> match per id wins (`pluginRoots()` in `pluginStore.ts`). Installing from a
> path, `.zip` or URL copies the plugin into the first user folder. The
> "never copies" statements below describe built-in plugins only. Current
> contract for plugin authors: [guides/plugins](../guides/plugins.md).

The backend hosts third-party plugin code behind a small, deliberately
narrow contract: a plugin ships a `manifest.json` (static metadata) plus an
`index.ts`/`index.js` entry exporting `describe(ctx)` and `invoke(...)`. The
host (`backend/plugins/*.ts`) is the only code that reads manifests, loads
plugin modules, calls into them, and persists their state; core config/app
code never talks to a plugin directly. Every file below lives in
`backend/plugins/` and is documented in full — see
[Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md)
for the cross-cutting rules (surface→scope derivation, descriptor contract,
`declaresScope`, `requiresConfig`, templating allowlist, dev/packaged module
loading trade-offs) that this page's file-by-file pass builds on.

## Runtime/descriptor/state model, in one pass

This is the **marketplace-by-reference** model (superseded the old
install-copy-into-`state/plugins` design in commit `690ff73`):
`marketplace/<id>/` (repo-root, or an env/config-resolved equivalent — see
`marketplaceDir()` below) is the **single, permanent home** of every
plugin's code on disk. Installing/activating/deactivating a plugin never
copies, moves, or deletes that directory — it only flips membership in two
small string-array fields on the top-level config object, `plugins` and
`disabledPlugins` (`backend/config.types.ts` `Config`, `backend/config/schema.ts`
`ConfigSchema`). A plugin is only actually loaded/invoked/described when
**both** are true: `activated` (its id is in `config.plugins`) **and**
`enabled` (its id is *not* in `config.disabledPlugins`) —
`backend/plugin.types.ts:87`'s `MarketplacePlugin = PluginMeta & { activated: boolean; enabled: boolean }`
is the computed shape every list/catalog/descriptor consumer works with.
There is no more separate "install" step that mutates disk — see
`pluginStore.ts` below for what `installPlugin`/`setPluginActivated` do
instead.

1. **Store** (`pluginStore.ts`) — every plugin directory under
   `marketplaceDir(config)` (id-named, `_`-prefixed dirs skipped) is listed
   by reading only its `manifest.json` (no code execution); `activated`/
   `enabled` are derived per-call from `config.plugins`/`config.disabledPlugins`,
   never stored per-plugin on disk. `installPlugin`/`setPluginActivated`/
   `setPluginEnabled` all go through this file; there is **no `removePlugin`
   export any more** — deactivating (`setPluginActivated(config, id, false)`)
   is the closest equivalent, and it never touches the on-disk directory.
2. **State** (`pluginState.ts`) — a single JSON sidecar (`plugin-state.json`)
   now holds **only** each plugin's own `custom` persisted data (keyed by
   plugin id, then by app name or a `__global__` bucket). It no longer
   tracks an `enabled` flag at all — that moved to `config.disabledPlugins`
   (see Store above); `pluginState.ts` has no `isPluginEnabled`/
   `setPluginEnabledState` exports any more.
3. **Runtime** (`runtime.ts`) — loads a plugin's `index.ts`/`.js` as a real
   Node module (with a `.ts` require hook for dev/packaged) and builds the
   `HostAPI` object (`makeHost`) a plugin's `describe`/`invoke` receive as
   `ctx.host`.
4. **Descriptors** (`pluginDescriptorService.ts`) — calls
   `describe(ctx)` for every plugin that is both `activated` **and**
   `enabled` (`listPlugins(config).filter(p => p.activated && p.enabled)`,
   `pluginDescriptorService.ts:47`) once per relevant app (and once
   globally) to build the UI's render tree, validating each returned
   descriptor against the host contract.
5. **Lifecycle** (`lifecycle.ts`) — same `activated && enabled` filter
   (`lifecycle.ts:37`) — calls a plugin's named lifecycle export (e.g.
   `onStart`/`onStop`) as a side effect of an app event; also owns the
   single `surfaceScope` mapping used everywhere scope is needed.
6. **Catalog** (`catalog.ts`) — fetches a remote/local list of installable
   plugins for the install-browsing UI, marking each entry `installed` from
   the same `config.plugins` membership `activated` uses (not disk
   presence, not `enabled` — see that file's own section below).
7. **Templating** (`templating.ts`) — the shared `{var}` placeholder
   substitution helper plugins and the host both use for renderable text.

## `backend/plugins/pluginStore.ts`

**Responsibility**: resolves the marketplace directory, lists every plugin
that physically exists there from its manifest (no execution), and drives
install/preview/activate/enable-toggle — all as **config-array membership
edits**, never disk mutation of an already-present plugin.

**Key exports**:
- `marketplaceDir(config): string` (`pluginStore.ts:16-18`) — resolution
  precedence: `process.env.MARKETPLACE_DIR` (set by the packaged Tauri
  shell, see `main.rs` below) → `config.global?.marketplaceDir` → the
  `'marketplace'` cwd-relative default for dev. `catalog.ts` imports and
  reuses this exact function (see that file's section) so the catalog and
  the actual on-disk plugin trees can never resolve against different
  directories.
- `listPlugins(config): MarketplacePlugin[]` — reads every non-`_`-prefixed
  directory's `manifest.json` under `marketplaceDir(config)`, validates it
  (`PluginMetaSchema.parse`, `.strip()`), cross-checks the directory name
  matches `meta.id` (skips + warns otherwise, since the on-disk path is
  derived from `id` elsewhere and a mismatch would silently resolve to the
  wrong path later), and returns each with `activated` (`config.plugins`
  membership) and `enabled` (**not** in `config.disabledPlugins`) computed
  fresh from the current config — neither flag is stored on disk anywhere.
- `previewPlugin(source): Promise<PluginMeta>` — stages a plugin source
  (URL/zip/folder) far enough to read its manifest, **never installs or
  executes** it. Used by the install-preview UI flow.
- `installPlugin(config, { source }): Promise<MarketplacePlugin>`
  (`pluginStore.ts:183-222`) — stages the source, validates the manifest,
  then only copies into `resolveDestDir(config, meta.id)` if that
  destination **doesn't already exist** (`fs.existsSync(dest)`) — a
  previously-installed-then-deactivated plugin, or a mismatched
  source-dir/manifest-id pair whose *id* isn't on disk yet, both correctly
  fall through the right branch of that one check. When it does copy, it
  stamps the destination manifest's `source` field with the original
  install source. Either way it finishes by calling the internal
  `activatePlugin(id)` (adds the id to `config.plugins` via
  `mutatePluginsFile`) and returns the resulting `MarketplacePlugin`.
- `setPluginActivated(config, id, activated): Promise<MarketplacePlugin>` —
  the closest equivalent to an old "remove": flips `id`'s membership in
  `config.plugins` via `mutatePluginsFile`. Throws `plugin not found` if the
  manifest at `resolveDestDir` is missing. **Never touches the on-disk
  directory** — deactivating just moves the id out of `config.plugins`;
  the marketplace copy stays put so reactivating is instant. Deactivating
  also drops any stale `config.disabledPlugins` entry for the same id (via
  `mutateDisabledPluginsFile`), so a later reinstall doesn't silently come
  back switched off. There is **no `removePlugin` export any more** — the
  route that used to be named that way now calls this instead (see
  `routes/plugins.ts` below).
- `setPluginEnabled(config, id, enabled): Promise<MarketplacePlugin>` — the
  second, independent on/off flag: flips `id`'s membership in
  `config.disabledPlugins` via `mutateDisabledPluginsFile`. A plugin can be
  `activated: true, enabled: false` (installed but toggled off) without
  ever leaving `config.plugins`.
- `fetchTextCapped(url, maxBytes, timeoutMs)` — exported for reuse by
  `catalog.ts`; fetches with `redirect: 'error'` and a hard timeout, then
  delegates to the capped-body reader below.
- Internal helpers: `validatePluginMeta` (pure `PluginMetaSchema.parse`,
  no I/O), `resolveDestDir` (id allowlist regex `ID_RE` +
  path-traversal guard), `readBodyCapped`/`fetchBytesCapped` (streaming
  size-capped fetch — aborts mid-stream rather than buffering-then-checking,
  falls back to full-buffer only if `Response.body` isn't streamable),
  `extractZip` (shells out to `unzip`), `findManifestDir` (handles the
  "one nested top-level folder" zip-packaging case), `stagePluginSource`
  (dispatches URL vs `.zip` vs plain directory sources, returns a dir +
  optional cleanup callback), `activatePlugin(id)` (the `mutatePluginsFile`
  add-if-absent helper `installPlugin` calls internally).

**Contract**: listing/previewing are execution-free by design (security
property, not incidental) — only `runtime.ts`'s `loadPluginModule` ever
`require()`s a plugin's code. Manifest validation always uses the `.strip()`
`PluginMetaSchema`, dropping unknown keys, mirroring the old hand-rolled
`validatePluginMeta`'s permissiveness (see
[Config read/write contract](../entities/config-read-write-contract.md)).
`PluginMeta.enabled?: boolean` (the manifest-declared field,
`plugin.types.ts:29`) is a dead field left over from before the
config-array `enabled`/`disabledPlugins` model existed — `listPlugins`
never reads it when computing a plugin's effective `enabled` value.

**Consumers**: `lifecycle.ts` and `pluginDescriptorService.ts` (both call
`listPlugins`/`marketplaceDir` to enumerate `activated && enabled` plugins
and resolve their directory for `loadPluginModule`), `catalog.ts`
(`marketplaceDir`/`fetchTextCapped`), and the plugin HTTP routes
(install/activated/enabled/preview endpoints in `routes/plugins.ts`,
outside this zone).

## `backend/plugins/pluginState.ts`

**Responsibility**: the single JSON-sidecar-backed store
(`plugin-state.json`, via `jsonSidecarStore`) for a plugin's own persisted
custom data. It no longer tracks activation/enablement at all — that state
moved to `config.plugins`/`config.disabledPlugins` (see `pluginStore.ts`
above); `PluginState` is now just `{ custom }`, and this file has no
`isPluginEnabled`/`setPluginEnabledState` exports.

**Key exports**:
- `readPluginState(config): PluginState` / `writePluginState(config, patch)`
  — read/merge-write the `{ custom }` shape. The store's `coerce` callback
  narrows an untyped raw JSON blob back into the expected shape defensively
  (checks `typeof === 'object'` before assigning `custom`).
- `readState(config, pluginId, appName?)` / `writeState(config, pluginId, value, appName?)`
  — the `HostAPI.readState`/`writeState` backing implementation. Keys by
  `appName` when given, otherwise by the module-local `GLOBAL_STATE_KEY`
  (`'__global__'`) constant.

**Contract**: this is the *only* way a plugin persists its own runtime data
— deliberately separate from `AppConfig.plugins[pluginId]` (the user-edited
config-attachment namespace covered in
[Config read/write contract](../entities/config-read-write-contract.md))
and from the `config.plugins`/`config.disabledPlugins` activation/enablement
arrays. All three are namespaced by plugin id (and this one optionally by
app too), but state is runtime-owned while config is user-owned.

**Consumers**: `runtime.ts` (`makeHost` wires `readState`/`writeState` from
here into `HostAPI`).

## `backend/plugins/runtime.ts`

**Responsibility**: loads a plugin's entry module off disk as executable
code, and builds the `HostAPI` object every `describe`/`invoke`/lifecycle
call receives as `ctx.host`.

**Key exports**:
- `loadPluginModule(dir, id): PluginModule` — registers a `.ts` require hook
  on first use (`ensureTsRequireHookRegistered`, dev-vs-packaged branch, see
  below), resolves `index.ts` over `index.js`, always evicts
  `require.cache` first so enable/disable/reinstall cycles pick up on-disk
  changes, validates the loaded module exports both `describe` and `invoke`
  functions (throws listing exactly which are missing otherwise).
- `makeHost(config): HostAPI` — assembles the object a plugin calls into:
  `config.read()`, `apps.{start,stop,restart,status}` (delegating to
  `getAppOps()`), `runProcess` (via `runProcessInTmux`), `openUrl` (spawns
  the OS opener per-platform), `readFile`/`writeFile` (plain fs, `writeFile`
  auto-`mkdirSync`s the parent dir), `readState`/`writeState` (delegating to
  `pluginState.ts`), `template` (delegating to `templating.ts`).

**Internal-only**: `ensureTsRequireHookRegistered`/`ensurePackagedTsHook`/
`openUrlInBrowser` are not exported. The dev-vs-packaged hook choice is a
pure existence check (`require.resolve('ts-node/register')` succeeding or
not) — dev reuses an already-active `ts-node` register instance rather than
creating a second Service; packaged mode falls back to an inline
`ts.transpileModule`-based hook (types-strip only, no type-check — a
type-incorrect `.ts` plugin loads fine and only fails later at call time).
The `typescript` package is imported statically at module top so esbuild
inlines it into the single-file server bundle. The packaged `.ts` hook is
installed process-wide (`require.extensions['.ts']`), not scoped to just the
plugin entry, so nested relative requires within a plugin's own files go
through it too.

**Contract**: `loadPluginModule`'s "no describe/invoke → throw" check is the
structural half of the host contract; the shape/scope/icon checks on what
`describe()` *returns* live in `pluginDescriptorService.ts`'s
`assertValidDescriptor`.

**Consumers**: `lifecycle.ts` (`loadPluginModule` + `makeHost` per
lifecycle-event run), `pluginDescriptorService.ts` (same pair, per
`buildDescriptors` call).

## `backend/plugins/pluginDescriptorService.ts`

**Responsibility**: builds the full UI-facing descriptor map by calling
every enabled plugin's `describe(ctx)` once per app it applies to, plus once
globally, enforcing the host's structural contract on each result.

**Key exports**:
- `buildDescriptors(config): Promise<Record<string, Record<string, ControlDescriptor>>>`
  — for every configured app, computes its `AppStatus` (via `getAppOps()`),
  builds one shared `HostAPI` (`makeHost`), then for each enabled plugin:
  checks `declaresScope('app')`/`declaresScope('global')` (local closure —
  whether the plugin's manifest `surfaces`, if any, includes a surface
  whose `surfaceScope` is `'app'`/`'global'`; no declared `surfaces` array
  defaults to app-scoped-only), and if app-scoped, calls `describe()` per
  app **unless** `requiresConfig !== false` and the app has no
  `config.apps[name].plugins?.[plugin.id]` entry (config-attachment gate,
  default on). Each returned descriptor goes through
  `assertValidDescriptor`. Result shape:
  `{ [appName]: { [pluginId]: ControlDescriptor }, __global: {...} }` — the
  `__global` key can never collide with a real app key because
  `sanitizeKey`'s `KEY_RE` requires app keys to start `[a-z0-9]`.

**Internal-only**: `assertValidDescriptor(descriptor, plugin, scope)` — the
host-contract gate, checked in order: (1) `ControlDescriptorSchema.parse`
shape check; (2) if the plugin declared `surfaces`, the returned
`descriptor.surface` must be one of them; (3) `surfaceScope(descriptor.surface)`
must equal the `scope` the host asked about; (4) `surface: 'dock'` requires
a non-empty `icon`. Any violation throws, caught by the same
log-and-skip `describe`-catch as a plugin whose `describe()` itself throws.

**Contract**: one descriptor per `describe()` call, no "N/A" signal other
than throwing — which is why `declaresScope` exists (the host must not ask
a question a plugin never opted into). Full rationale in
[Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md)
(ADR §3a, `declaresScope`, `requiresConfig`, `__global` collision-proofing
sections).

**Consumers**: the plugin descriptors HTTP route
(`/api/plugins/descriptors`, outside this zone) that feeds the desktop's
`PluginSlot` rendering.

## `backend/plugins/lifecycle.ts`

**Responsibility**: runs a named lifecycle hook (e.g. on app start/stop)
across every enabled plugin for one app, and owns the single
surface→scope derivation used across the whole plugin system.

**Key exports**:
- `surfaceScope(surface: Surface): 'app' | 'global'` — `'header'` is the
  only global-scope surface; everything else (`'list' | 'menu' | 'dock'`)
  is app-scoped. This is the single source of truth other files
  (`pluginDescriptorService.ts`) import rather than re-deriving.
- `runPluginLifecycle(config, appName, event): Promise<void>` — resolves
  the app's current `AppStatus` (via registry + `getAppOps()`), builds one
  `HostAPI`, then for every enabled plugin loads its module and, if it
  exports a function named `event`, invokes it with an app-scoped
  `PluginContext`. Both the per-plugin call and the outer function are
  wrapped in try/catch that log-and-continue (`console.warn`) — a failing
  plugin or a failing lookup never aborts the caller's app-lifecycle flow.

**Contract**: lifecycle hooks are optional exports (`typeof fn !== 'function'`
is silently skipped, not an error) — unlike `describe`/`invoke`, which
`loadPluginModule` requires every plugin to export.

**Consumers**: `pluginDescriptorService.ts` imports `surfaceScope` from
here (not duplicated). App start/stop/restart flows in `core/appOps.ts`
(outside this zone) call `runPluginLifecycle` at the relevant transition
points.

## `backend/plugins/catalog.ts`

**Responsibility**: fetches the list of installable plugins (remote URL,
local `CATALOG_FILE` env override, or `marketplace/catalog.json`) for the
install-browsing UI, marking which are already `installed` (== activated).

**Key exports**:
- `CatalogEntry` interface — `{ id, name, description, manifestUrl,
  installed, example? }`.
- `fetchCatalog(config): Promise<CatalogEntry[]>` — source precedence:
  `config.global.pluginCatalogUrl` (if it matches `^https?://`) via
  `fetchTextCapped` (imported from `pluginStore.ts`), else
  `process.env.CATALOG_FILE` (warns + returns `[]` if the path doesn't
  exist), else `path.join(marketplaceDir(config), 'catalog.json')`
  (`catalog.ts:38`, silently returns `[]` if absent) — imported from and
  identical to `pluginStore.ts`'s `marketplaceDir()`, so the catalog and the
  actual on-disk plugin trees can never resolve against different
  directories (this used to be an independent hardcoded
  `path.resolve('marketplace/catalog.json')` that ignored
  `MARKETPLACE_DIR`/`config.global.marketplaceDir`; fixed alongside the
  packaged-marketplace-resolution fix described in "Packaged mode: shipping
  and resolving `marketplace/`" below). Parses the result as a JSON array,
  validates each entry against `CatalogEntrySchema.safeParse` (skipping and
  warning on malformed entries individually rather than failing the whole
  fetch), and marks `installed` by cross-referencing `config.plugins`
  membership directly (`installedIds = new Set(config.plugins ?? [])`,
  `catalog.ts:56`) — the same "activated" fact `MarketplacePlugin.activated`
  encodes, just under a different field name; neither means "present on
  disk" (`marketplace/` is never mutated by install/activate/deactivate, so
  every catalog-listed plugin that ships in `marketplace/` is always
  present on disk regardless of this flag).

**Contract**: `CatalogEntry.manifestUrl` is a **misleading name kept for
compatibility** — it's actually the raw install `source` string fed
directly to `installPlugin`/`previewPlugin` (a package folder/zip
URL/path), not a URL that resolves to bare `manifest.json`. See
[Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md#manifesturl--install-source-not-a-manifestjson-url).

**Consumers**: the plugin catalog HTTP route (`GET /api/plugins/catalog`,
outside this zone) that backs the desktop's plugin-install browser.

## `backend/plugins/templating.ts`

**Responsibility**: the single `{var}` placeholder substitution helper
used by `HostAPI.template` and anywhere plugin-facing renderable text needs
variable interpolation.

**Key exports**:
- `substituteTemplate(template: string, ctx: TemplateContext): string` —
  replaces `{name}`-style placeholders drawn from a fixed allowlist
  (`ALLOWED_VARS`: `name`, `port`, `version`, `environment`, `branch`,
  `appUrl`, `repoPath`, `toggleState`). A placeholder not in the allowlist
  is left **literal** in the output (not stripped, not an error) so a typo
  or unsupported variable is visibly wrong rather than silently vanishing.
  `null`/`undefined` context values render as `''`, not the literal string
  `"null"`/`"undefined"`.

**Contract**: allowlist-only substitution — adding a new interpolatable
variable requires adding it to `ALLOWED_VARS`, there is no dynamic/open
key lookup.

**Consumers**: `runtime.ts`'s `makeHost` wires this in as `HostAPI.template`,
the only path plugins use to interpolate these variables into strings.

## Packaged mode: shipping and resolving `marketplace/`

Dev mode resolves `marketplaceDir()` against the repo-root `marketplace/`
directory with no extra wiring. Packaged mode needs two things the dev path
doesn't, both fixed together (previously the packaged build was a
guaranteed `ENOENT`/empty-plugins-list, since the old code still pointed at
the `examples/` directory the marketplace-by-reference refactor had already
deleted):

- `scripts/build-packaged-server.js` copies `marketplace/catalog.json` *and*
  the whole `marketplace/` tree (every plugin's `manifest.json` + code,
  excluding any `_archive` entry) into
  `app/src-tauri/resources-build/resources/marketplace/` at build time —
  not just the catalog file, which is all it used to stage.
- `app/src-tauri/src/main.rs`'s packaged spawn branch computes
  `marketplace_dir = resource_dir.join("resources").join("marketplace")`
  and passes it to the spawned backend as a `MARKETPLACE_DIR` env var,
  alongside the existing `CONFIG_FILE`/`CATALOG_FILE`/`APP_SESSIONS_DIR`. This is
  what `pluginStore.ts`'s `marketplaceDir()` reads first (env takes
  priority over `config.global.marketplaceDir`, which in turn beats the
  dev-only `'marketplace'` cwd-relative fallback) — so the packaged app's
  plugin loading, descriptor building, and catalog all resolve against the
  exact directory the packaged build actually shipped plugins into.

## DELETE `/api/plugins/:id` deactivates, it does not delete or archive

`routes/plugins.ts`'s `DELETE /api/plugins/:id` handler calls
`setPluginActivated(getConfig(), id, false)` — it deactivates the plugin
(drops its id from `config.plugins`) and returns `{ ok: true }`. Nothing on
disk is renamed, archived, or removed; the plugin's directory under
`marketplace/` stays exactly where it was, so reactivating later is instant
(see `installPlugin`'s `fs.existsSync(dest)` skip-copy check above). The
desktop's Redux thunk and API-client method for this endpoint are both
still named `removePlugin` (`app/src/store/slices/pluginsSlice.ts`,
`app/src/api.ts`) — a naming holdover from an earlier "remove" framing
that predates the current deactivate-only semantics; the UI itself labels
the button "Remove — moves back to the marketplace list", which is
accurate. This is a known, open code-identifier/behavior naming mismatch,
not tracked as a bug — see
[Dashboard components (desktop)](../desktop/dashboard.md)'s `PluginsPanel.tsx`
section.

## Cross-links

- [Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md)
  — the ADR-level rules (surface/scope derivation, descriptor contract,
  `declaresScope`, `requiresConfig`, `__global` collision-proofing,
  `manifestUrl` naming, host-backed state, no-execution safety, dev/packaged
  module loading, templating allowlist, and the desktop-side `PluginSlot`
  mount contract) that this page's per-file documentation implements.
- [Config read/write contract](../entities/config-read-write-contract.md)
  — `AppConfig.plugins[pluginId]` (the config-attachment namespace
  `requiresConfig` gates against) and `PluginMetaSchema`/`ControlDescriptorSchema`
  (the `.strip()` internal-only schemas used throughout this zone).
