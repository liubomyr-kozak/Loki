---
type: concept
title: Plugin-agnostic architecture
timestamp: "2026-07-24T08:15:26Z"
---

# Plugin-agnostic architecture

# Plugin-agnostic architecture

The orchestrator's core (config, apps, UI shell) knows nothing about any
specific plugin's behavior. Plugins are third-party code, loaded and
sandboxed by a small host contract; the core only ever talks to them
through that contract. This page collects the rules that keep that
boundary real rather than aspirational.

## ADR §1 — surface implies scope, never declared

`backend/plugins/lifecycle.ts`'s `surfaceScope(surface)` is the single
source of truth mapping a `Surface` (`'list' | 'menu' | 'dock' | 'header'`)
to a `'app' | 'global'` scope: `'header'` is the only global-scope surface,
every other surface acts on a specific app. A plugin's manifest declares
*surfaces* it wants to render on; scope is always **derived** from that via
`surfaceScope`, never separately declared or configured — there is no
`scope` field anywhere in the manifest or descriptor shape. This keeps
scope from ever drifting out of sync with surface, since there's only one
value to keep consistent.

`ControlDescriptorBase.surface` (`backend/plugin.types.ts`) documents the
same rule at the type level: "`scope` is derived from this (`list|menu|dock`
→ app, `header` → global) and is never declared here."

## Descriptor host-contract: `assertValidDescriptor`

`backend/plugins/pluginDescriptorService.ts`'s `assertValidDescriptor`
enforces the host's contract on whatever a plugin's `describe()` call
returns (ADR §3a), in order:

1. **Shape** — `ControlDescriptorSchema.parse(descriptor)` (zod).
2. **Surface must be declared** — if the plugin's manifest lists
   `surfaces`, the returned `descriptor.surface` must be one of them.
3. **Scope must match the call** — `surfaceScope(descriptor.surface)` must
   equal the `scope` the host asked about (the ADR §1 map above). A plugin
   can't answer an app-scoped `describe()` call with a `header`-surface
   descriptor.
4. **Dock needs an icon** — a `surface: 'dock'` descriptor (icon-only
   placement) must carry a non-empty `icon`, otherwise it would render as
   nothing.

Any violation throws, which callers route through their existing
describe-catch — the same log-and-skip treatment as a plugin whose
`describe()` itself throws. This keeps a misbehaving plugin from silently
corrupting the descriptor map instead of just being skipped for that call.

## `declaresScope` — the host only asks what a plugin claims to answer

Under the 1-descriptor-per-call boundary, a plugin has no way to answer "I
don't apply here" except by throwing — so the host must not ask a question
the plugin never opted into. `buildDescriptors`' `declaresScope(scope)`
checks whether `plugin.surfaces` (if declared) includes any surface whose
`surfaceScope` matches the requested scope; a manifest with **no**
`surfaces` array makes no such claim at all and keeps the pre-`surfaces`
default behavior: app-scoped only. This is why adding a `surfaces` array to
an existing plugin's manifest is a meaningful behavior change, not just
metadata.

## `requiresConfig` — default is "config required to render"

For app-scoped plugins, `buildDescriptors` only calls a plugin's
`describe()` for an app if `config.apps[name].plugins?.[plugin.id]` is
present, **unless** the plugin sets `requiresConfig: false` in its
manifest (default is `true` — config-required). This is what backs the
"attach via the Apps tab, like `groups`" UX described in
`config-read-write-contract`: a plugin normally only shows up on apps the
user has explicitly opted it into, but a plugin can declare it wants to be
asked about every app regardless (e.g. a global-feeling control that
happens to be app-scoped).

## `__global` key collision-proofing

`buildDescriptors` returns
`{ [appName]: { [pluginId]: ControlDescriptor }, __global: {...} }` — a
`__global` bucket alongside real app-keyed entries in the same object.
There is no explicit collision guard for this in `buildDescriptors` itself
because none is needed: `sanitizeKey`'s `KEY_RE`
(`backend/config/configValidation.ts`) requires every real app key's first
character to be `[a-z0-9]`, so `__global` (leading underscore) can never be
a valid configured app key. The two namespaces are guaranteed disjoint by
construction, not by a runtime check.

## `manifestUrl` — install source, not a manifest.json URL

`CatalogEntry.manifestUrl` (`backend/plugins/catalog.ts`) is a misleading
name kept for compatibility: it is the **install source** fed directly to
`installPlugin`/`previewPlugin` as `source` — a package (folder/zip) URL or
local path — not a URL that resolves to a bare `manifest.json`. Anyone
extending the catalog format should not assume it points at raw manifest
JSON.

## Host-backed persisted state: `readState`/`writeState`

`backend/plugins/pluginState.ts`'s `readState`/`writeState` back
`HostAPI.readState`/`HostAPI.writeState` — the only way a plugin persists
its own data. Both take an optional `appName`; when omitted they use a
`GLOBAL_STATE_KEY` bucket instead. This is the plugin equivalent of
`AppConfig.plugins[pluginId]` (see `config-read-write-contract`): config is
user-edited attachment + per-app config namespace, plugin state is the
plugin's own runtime-persisted data, and the two are deliberately separate
concerns even though both are namespaced by plugin id and optionally by
app.

## No-execution safety: listing and previewing plugins

Two operations are deliberately execution-free, and both comments call
this out explicitly because it's a security property, not an incidental
detail:

- `listPlugins` (`backend/plugins/pluginStore.ts`) reads each installed
  plugin's static `manifest.json` only — **no code execution** — to build
  the installed-plugins list. `validatePluginMeta` is a pure shape check
  against `PluginMetaSchema` (`.strip()`, so extra manifest keys are
  dropped the same way the old hand-rolled version cherry-picked fields);
  it does not import or run anything from the plugin.
- `previewPlugin(source)` stages a plugin source (folder/zip/URL) far
  enough to read its `manifest.json`, for the install-preview flow in the
  UI, but **never installs it and never executes any plugin code**. A user
  can preview an untrusted catalog entry's metadata before deciding to
  install.

Supporting safety details:

- `readBodyCapped` streams a fetch response via its reader, aborting the
  moment the running total exceeds `maxBytes`, instead of buffering the
  whole response and checking length afterward — the former approach let a
  worst-case response balloon memory before the size check ever ran. Falls
  back to full buffering only if the runtime's `Response` has no
  streamable `body` (not expected on Node 18+/undici).
- `findManifestDir` handles the common "zip packaged with one top-level
  folder" case: if `manifest.json` isn't at the staged root, it looks one
  level into a single nested directory before giving up — so a plugin
  author's normal `zip -r plugin-name/` doesn't fail installation.

## Plugin module loading: dev vs packaged trade-offs

`backend/plugins/runtime.ts` needs a `.ts` require hook so plugin entries
(and their relative requires) can be loaded directly, whether the host
itself runs as compiled JS or under `ts-node`. Which hook gets installed is
chosen purely by an existence check (`require.resolve('ts-node/register')`
succeeding or not) — never a new env var or CLI flag:

- **Dev** (`ts-node/register` resolves): only registers a fresh hook if
  none is already active. If the host process is already running under the
  `ts-node` CLI, a `.ts` hook already exists backed by a Program that has
  absorbed the host's own dependency graph; calling `ts-node/register`
  again would create a second, independent, unwarmed Service and
  spuriously report implicit-any errors for otherwise correctly-typed
  plugin code.
- **Packaged** (no `node_modules` next to the bundle, so no `ts-node`):
  falls back to an inline hook using the `typescript` package, which is
  statically imported at the top of `runtime.ts` (not required lazily
  inside a function) specifically so esbuild inlines it into the
  single-file server bundle at build time — the packaged branch needs it
  available with zero `node_modules` on disk.
  - This packaged-mode hook only strips types syntactically via
    `ts.transpileModule` — it does **not** type-check. A syntactically
    valid but type-incorrect `.ts` plugin loads successfully and only
    fails later, at `invoke`/`describe` call time. This is a deliberate,
    accepted trade-off for packaged mode, not a bug.
  - `require.extensions['.ts']` is patched **process-wide**, for the
    lifetime of the process, not scoped to just the plugin's entry file —
    so nested relative requires within a plugin (e.g. `index.ts` requiring
    `./resolve` requiring `./flags`) also go through the same hook. Only
    plugin loading uses this today, but any other `.ts` require in the
    process would too, once installed.

## Templating: `substituteTemplate`

`backend/plugins/templating.ts`'s `substituteTemplate` replaces `{var}`
placeholders from an allowlist (`name`, `port`, `version`, `environment`,
`branch`, `appUrl`, `repoPath`, `toggleState`). Unknown placeholders are
left **literal** (not stripped or errored) so a typo or a not-yet-supported
variable is visibly wrong in the rendered output rather than silently
vanishing; `null`/`undefined` values become an empty string rather than the
literal text `"null"`/`"undefined"`.

## Desktop mount contract: `PluginSlot` and its host tiles

`components/common/PluginSlot.tsx` is the **only** primitive that renders a
plugin-authored control on the desktop: `action:'toggle'` as a
`<ToggleSwitch>`, `action:'button'` as an icon+label button with two-step
confirm. It is a plugin-controls-only primitive — it never renders the
row/tile shell itself. Core owns the app's render form (row or tile);
`<PluginSlot>` only owns what a plugin attaches onto that shell. It is
mounted from three places: `AppRow`'s row, `AppContextMenu`'s menu, and
`AppTile`'s dock badge.

`components/AppList/AppTile.tsx` is explicitly the `dock`-surface
counterpart to `AppRow`: a square, icon-first launcher tile for one app.
Core-UI owns and renders the tile shell; plugins only attach controls onto
it via `<PluginSlot>` badges rendering `surface: 'dock'` descriptors — a
plugin never gets to render the tile itself, only badges on top of it. This
mirrors the row/tile split at the surface level: `AppRow` hosts `list`
(and `menu`/`header`-adjacent) plugin controls, `AppTile` hosts `dock`
ones, and `PluginSlot` is the shared rendering primitive both delegate to.

