---
type: concept
title: git-log plugin
timestamp: "2026-07-30T12:00:00Z"
---

# git-log plugin

`git-log` is an example plugin under `marketplace/git-log/` (`index.ts`,
`manifest.json`) demonstrating a `menu`-surface, shell-running control. It
adds a "Git log" context-menu entry to an app row that opens a `tmux` window
running `git log --oneline` against that app's repo. See
[Backend plugin system](../backend/plugins.md) for the host engine that
loads and dispatches it, and [index](./index.md) for the other example
plugins.

## Manifest

`manifest.json` declares `id: "git-log"`, `surfaces: ["menu"]`, and
`risk: "runs a shell command"` — the risk string surfaces in the plugin
install/enable UI so a user installing it knows `invoke()` shells out.

## `describe(ctx)`

Returns a static `ControlDescriptor`: `action: 'button'`, `surface: 'menu'`,
`label: 'Git log'`, `icon: 'git-branch'`, `visible: true`. No branching on
`ctx` — the descriptor is identical for every app row.

`menu` is a context-menu surface reached by right-clicking the app row,
regardless of where/how that app is placed or rendered. Because of that it
is exempt from the app-placement/surface-adaptation rules other surfaces
follow (`list`, `dock`) — there is no per-placement variant to resolve, so
`describe` never needs to consult `ctx.appSurface` or app-placement state
the way a `list`/`dock` plugin would.

## `invoke(ctx)`

```ts
export function invoke(ctx: PluginContext): Promise<void> {
  const { status } = requireAppContext(ctx);
  const command = ctx.host.template('git -C {repoPath} log --oneline -20 | less', buildTemplateContext(ctx));
  return ctx.host.runProcess(command, { window: `plugin-git-log-${status.name}` });
}
```

- `requireAppContext(ctx)` (from the shared
  `marketplace/_shared/pluginContext.ts` home) narrows the
  `PluginContext` union to its app-scoped shape, throwing if `invoke` is
  ever called global-scoped — `git-log` only makes sense against a specific
  app's repo.
- `buildTemplateContext(ctx)` (same module) derives the `{repoPath}`
  placeholder value (among others) from the app's current status/config.
- `ctx.host.template(...)` substitutes `{repoPath}` via the host's
  allowlisted `substituteTemplate` (see
  [Backend plugin system](../backend/plugins.md#backend-pluginstemplatingts)),
  producing a concrete `git -C <path> log --oneline -20 | less` command.
- `ctx.host.runProcess(command, { window })` hands the command to the host's
  tmux-backed process runner, naming the window
  `plugin-git-log-<appName>` so repeated invocations across apps land in
  distinct tmux windows rather than colliding.

## Cross-links

- [Backend plugin system](../backend/plugins.md) — `runtime.ts`'s
  `makeHost` (source of `ctx.host.runProcess`/`ctx.host.template`) and
  `pluginDescriptorService.ts` (calls `describe`, enforces the descriptor
  contract `git-log`'s return value satisfies).
- [Plugin-agnostic architecture](../entities/plugin-agnostic-architecture.md)
  — surface→scope derivation and the descriptor host-contract this plugin's
  `menu` surface and static descriptor conform to.
- [flag-toggle platform/app model](../entities/flag-toggle-platform-app-model.md)
  — contrast: a plugin with real per-app/per-platform state, unlike
  `git-log`'s stateless read-only descriptor.
- [index](./index.md) — other example plugins (`open-site`, `restart-btn`,
  `proxy-toggle`, `flag-toggle`) and the shared `_shared/pluginContext.ts`
  home they all draw `requireAppContext`/`buildTemplateContext` from.
