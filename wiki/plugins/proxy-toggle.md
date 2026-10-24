---
type: concept
title: proxy-toggle example plugin
timestamp: "2026-07-30T12:00:00Z"
---

# proxy-toggle example plugin

`proxy-toggle` (`marketplace/proxy-toggle/`) is a minimal example
plugin demonstrating an independent per-app toggle: unlike
[flag-toggle](../entities/flag-toggle-platform-app-model.md), it has no
platform/non-platform split — every app it's attached to gets its own
toggle with its own persisted state, and flipping it just runs a shell
command. It's loaded and dispatched by the same host described in
[Backend plugin system](../backend/plugins.md).

## Manifest

`manifest.json` declares `id: 'proxy-toggle'`, `surfaces: ['list', 'dock']`,
and a `risk` string (`"runs a shell command"`) shown to the user before
install. No `requiresConfig: false`, so the default config-attachment gate
applies: `describe()` is only called for an app once it has a
`config.apps[name].plugins['proxy-toggle']` entry (see
`pluginDescriptorService.ts` in [Backend plugin system](../backend/plugins.md)).

## `describe(ctx)`

Narrows `ctx` via the shared `requireAppContext(ctx)` helper (from
`marketplace/_shared/pluginContext.ts` — throws if called with a
global-scope context, since this plugin only makes sense per-app), then
reads its own persisted checked state with
`ctx.host.readState(PLUGIN_ID, status.name)` and returns a `toggle`
`ControlDescriptor`:

- `surface: appSurface` — renders on whichever app-scoped surface the host
  is asking about (`list` or `dock`, per the manifest's `surfaces`).
- `icon: 'zap'` — must be a name `app/src/lib/pluginIcons.ts`'s
  `ICON_MAP` resolves (it does, to `lucide-react`'s `Zap`). An unmapped icon
  name silently falls back to the generic `Puzzle` glyph
  (`FALLBACK_ICON`) instead of erroring — this matters more here than for
  most plugins because on the `dock` surface a tile is icon-only, so a typo
  degrades to an unlabeled generic glyph with no text to fall back on.
- `checked` reflects the per-app, per-plugin state read above.

## `invoke(ctx, input)`

Also narrows via `requireAppContext`, then:

1. Writes the new checked state with
   `ctx.host.writeState(PLUGIN_ID, checked, status.name)` — persisted in
   `plugin-state.json`'s `custom['proxy-toggle'][status.name]` bucket (see
   `pluginState.ts` in [Backend plugin system](../backend/plugins.md)),
   keyed independently per app name.
2. Builds the command string via `ctx.host.template(...)`, passing
   `buildTemplateContext(ctx)` (the shared per-app template context — name,
   port, environment, branch, appUrl, repoPath) plus an extra
   `toggleState: checked ? 'on' : 'off'` key, which is in `templating.ts`'s
   `ALLOWED_VARS` allowlist specifically to support this kind of toggle
   plugin.
3. Runs the interpolated command (`echo proxy {name} {toggleState}` by
   default) via `ctx.host.runProcess`, in a per-app named tmux window
   (`plugin-proxy-toggle-${status.name}`).

## Shared plugin home

Both handlers import from `marketplace/_shared/pluginContext.ts`
rather than re-implementing scope-narrowing or template-context assembly:

- `requireAppContext(ctx)` — throws `'plugin requires app-scoped context'`
  when `ctx.scope !== 'app'`, otherwise narrows and returns
  `{ app, status, appSurface }`.
- `buildTemplateContext(ctx)` — calls `requireAppContext` internally and
  maps the app/status pair to the `TemplateContext` shape `ctx.host.template`
  expects.

Other per-app example plugins (`open-site`, `git-log`, `restart-btn`) and
[flag-toggle](../entities/flag-toggle-platform-app-model.md) share this same
home rather than each hand-rolling the scope check.

## See also

- [Plugins](./index.md) — the example-plugins index.
- [Backend plugin system](../backend/plugins.md) — the host that loads
  `proxy-toggle`'s module, calls `describe`/`invoke`, and backs
  `readState`/`writeState`/`template`/`runProcess`.
- [Flag-toggle platform/app model](../entities/flag-toggle-platform-app-model.md)
  — contrast: a per-app toggle plugin with a platform/non-platform split,
  vs. `proxy-toggle`'s fully independent per-app state.
