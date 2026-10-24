---
type: concept
title: restart-btn example plugin
timestamp: "2026-07-30T12:00:00Z"
---

# restart-btn example plugin

`restart-btn` is the minimal example plugin under `marketplace/restart-btn/`:
a single confirm-gated button that restarts one running app. It exists as the
simplest possible `describe`/`invoke` pair against the [backend plugin
system](../backend/plugins.md) — no config attachment, no persisted state, no
templating.

## Manifest

`manifest.json` declares `surfaces: ["list", "dock"]` and `requiresConfig: false`.
The latter opts the plugin out of the config-attachment gate in
`pluginDescriptorService.ts`'s `buildDescriptors` — it is called for every app
regardless of whether that app has a `config.apps[name].plugins['restart-btn']`
entry. Both declared surfaces (`list`, `dock`) resolve to app scope via
`lifecycle.ts`'s `surfaceScope` (only `header` is global), so this plugin only
ever runs with an `AppPluginContext`, never a `GlobalPluginContext`.

## `describe`

```ts
export function describe(ctx: PluginContext): ControlDescriptor {
  const { status, appSurface } = requireAppContext(ctx);
  const process = status.process;
  return {
    action: 'button',
    surface: appSurface ?? 'list',
    label: 'restart',
    icon: 'rotate-ccw',
    confirm: 'Restart?',
    visible: process === 'running' || process === 'port-conflict',
  };
}
```

`requireAppContext(ctx)` (from the shared `marketplace/_shared/pluginContext.ts`
helper) narrows the `PluginContext` union down to its app-scoped shape,
throwing if the host ever calls `describe` with a global-scope context — a
defensive check that never actually fires here since the manifest declares no
global surface. The descriptor rides `ctx.appSurface` rather than hardcoding a
surface, so it renders wherever the host currently asks (`list` or `dock` per
the manifest), falling back to `'list'` only if `appSurface` is unset.
`visible` is gated on `status.process` being `'running'` or `'port-conflict'` —
there is nothing to restart otherwise. `confirm: 'Restart?'` makes the host
render a confirmation step before `invoke` runs, since restarting is
disruptive to whatever is using the app.

## `invoke`

```ts
export function invoke(ctx: PluginContext): Promise<void> {
  return ctx.host.apps.restart(requireAppContext(ctx).status.name);
}
```

Delegates straight to `HostAPI.apps.restart(name)` (see `makeHost` in
[backend plugin system](../backend/plugins.md)), which itself dispatches
through `getAppOps()`. The plugin holds no state of its own and calls
`readState`/`writeState`/`template` from `HostAPI` — restart-btn needs none of
them.

## Cross-links

- [Backend plugin system](../backend/plugins.md) — the host
  (`pluginDescriptorService.ts`, `runtime.ts`, `lifecycle.ts`) that loads this
  plugin's module, calls `describe`/`invoke`, and derives `surfaceScope`.
- [Flag-toggle platform/app model](../entities/flag-toggle-platform-app-model.md)
  — a config-attached, stateful plugin for contrast; unlike restart-btn it
  requires config and splits behavior by app role.
- [Plugins](./index.md) — index of example plugins.
