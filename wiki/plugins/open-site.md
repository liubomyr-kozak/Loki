---
type: concept
title: open-site example plugin
timestamp: "2026-07-30T12:00:00Z"
---

# open-site example plugin

`open-site` is one of the example plugins under `marketplace/` — a
minimal, config-free control that opens an app's local dev server in the
browser. It ships only `manifest.json` and `index.ts`, and is loaded/hosted
by the same generic engine documented in
[Backend plugin system](../backend/plugins.md); nothing here is special-cased
by the host.

## Manifest

`marketplace/open-site/manifest.json` declares
`surfaces: ["list", "dock"]` and `requiresConfig: false` — it needs no
`AppConfig.plugins['open-site']` attachment to render, so
`pluginDescriptorService.ts`'s config-attachment gate never blocks it. Both
declared surfaces are app-scoped (per `surfaceScope`), so `describe()` is
only ever called with an app-scoped `PluginContext`.

## `describe(ctx)`

`marketplace/open-site/index.ts` narrows the incoming `ctx` via the
shared `requireAppContext(ctx)` helper (from
`marketplace/_shared/pluginContext.ts`), then returns an
`action: 'button'` descriptor:

- `surface: ctx.appSurface ?? 'list'` — the descriptor rides whichever
  surface the host is currently asking about (`ctx.appSurface`) rather than
  hardcoding one of its two declared surfaces. This is the placement
  adaptation covered in
  [Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md):
  the same plugin renders as a `list`-row button or a `dock`-tile badge
  depending purely on which shell (`AppRow` vs `AppTile`) mounted the
  `PluginSlot` that triggered this `describe()` call — the plugin carries no
  per-surface branching logic of its own.
- `icon: 'external-link'`, `label: 'site'`.
- `visible: status.process === 'running' || status.process === 'port-conflict'`
  — the control only appears once the app actually has something reachable
  at a port (a stopped or starting app has no URL to open).

## `invoke(ctx)`

Builds a URL via `ctx.host.template('http://localhost:{port}', buildTemplateContext(ctx))`
and hands it to `ctx.host.openUrl`. `buildTemplateContext` (also from the
shared `_shared/pluginContext.ts` module) itself calls `requireAppContext`
and maps the app-scoped `status`/`app` pair onto the `TemplateContext`
shape (`name`, `port`, `environment`, `branch`, `appUrl`, `repoPath`) that
`templating.ts`'s `substituteTemplate` allowlist accepts — `{port}` resolves
to `status.port ?? app.port`.

## Shared plugin-context home

Both `describe` and `invoke` route through
`marketplace/_shared/pluginContext.ts` rather than re-deriving
app-scope narrowing inline:

- `requireAppContext(ctx)` — throws if `ctx.scope !== 'app'`, otherwise
  narrows the `PluginContext` union down to `{ app, status, appSurface }`.
  Since `open-site` only declares app-scoped surfaces, this throw path is
  never actually reachable in practice, but keeps the plugin's own code
  free of manual scope checks.
- `buildTemplateContext(ctx)` — the reusable status/app → `TemplateContext`
  mapping described above.

Other example plugins that need app-scoped data or templating are expected
to reuse this same shared module rather than duplicating the narrowing
logic per plugin.

## Cross-links

- [Backend plugin system](../backend/plugins.md) — the engine that loads
  this plugin's module, calls `describe`/`invoke`, and enforces the
  descriptor contract (`assertValidDescriptor`) this plugin's output must
  satisfy.
- [Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md)
  — surface→scope derivation, `requiresConfig`, and the `PluginSlot`/`AppTile`
  mount contract that makes this plugin's single `ctx.appSurface`-driven
  `describe()` work across both `list` and `dock` placements.
- [Example plugins index](./index.md)
