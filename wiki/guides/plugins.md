---
type: concept
title: Plugins
description: "Writing a plugin: manifest, descriptors, invoke, lifecycle hooks, host API, loading rules and sharing."
timestamp: "2026-10-24T00:00:00Z"
---

# Plugins

A plugin adds controls to Loki: a button or toggle on app rows and dock
icons, a group of buttons or a popup, or items in a row's right-click menu.
It can also react when an app starts or stops. This page shows how to write,
test and share one. Installing plugins as a user is covered in the
[user guide](user-guide.md#plugins).

- [A first plugin](#a-first-plugin)
- [Folder layout](#folder-layout)
- [`manifest.json`](#manifestjson)
- [Surfaces and scope](#surfaces-and-scope)
- [`describe(ctx)`](#describectx)
- [`invoke(ctx, input)`](#invokectx-input)
- [Lifecycle hooks](#lifecycle-hooks)
- [The context object](#the-context-object)
- [Per-app settings](#per-app-settings)
- [How Loki loads plugin code](#how-loki-loads-plugin-code)
- [Testing and sharing a plugin](#testing-and-sharing-a-plugin)
- [Built-in plugins as examples](#built-in-plugins-as-examples)

## A first plugin

This plugin adds a **site** button to every running app that opens it in the
browser. Create a folder named `hello-site` inside your plugins folder (shown
in Settings → **Storage** → **Plugins folders**):

`hello-site/manifest.json`:

```json
{
  "id": "hello-site",
  "name": "Hello Site",
  "version": "1.0.0",
  "description": "Opens the running app in the browser",
  "surfaces": ["list", "dock"],
  "requiresConfig": false
}
```

`hello-site/index.ts`:

```ts
export function describe(ctx: any) {
  if (ctx.scope !== 'app') throw new Error('app rows only');
  return {
    action: 'button',
    surface: ctx.appSurface ?? 'list',
    label: 'site',
    icon: 'external-link',
    visible: ctx.status.process === 'running',
  };
}

export function invoke(ctx: any) {
  const url = ctx.status.appUrl ?? `http://localhost:${ctx.status.port}`;
  return ctx.host.openUrl(url);
}
```

Open the Workspace → **Plugins**. *Hello Site* is listed; click **Install**.
Start an app and the **site** button appears on its row.

## Folder layout

```text
hello-site/
  manifest.json    metadata, read without running any code
  index.ts         entry point (or index.js)
  helpers.ts       optional: more files, imported with relative paths
```

The folder name must equal the manifest `id` when the folder sits inside a
folder of plugins. Folders whose names start with `_` are skipped, which is
how the built-in `marketplace/_shared/` holds helpers.

## `manifest.json`

| Field | Type | Meaning |
|---|---|---|
| `id` | string, **required** | Lowercase letters, digits and `-`, starting with a letter or digit, at most 64 characters. |
| `name` | string, **required** | Name on the Plugins tab. |
| `version` | string, **required** | Your plugin's version, free form. |
| `description` | string | One line on the Plugins tab. |
| `surfaces` | string[] | Where the plugin may render: any of `list`, `dock`, `menu`, `header`. A descriptor for a surface not listed here is rejected. Omitted means app rows only. |
| `requiresConfig` | boolean | Default `true`: the plugin shows only on apps that have an entry for it under `plugins` in their config (see [Per-app settings](#per-app-settings)). Set `false` to show it on every app. |
| `risk` | string | Free text warning, for example `"runs a shell command"`. |

Unknown fields are ignored. Invalid optional fields are dropped rather than
failing the plugin.

## Surfaces and scope

| Surface | Where it renders | Scope |
|---|---|---|
| `list` | On an app row in the launcher | app |
| `dock` | On an app's icon in the dock bar. Needs an `icon`. | app |
| `menu` | As an item in the row's right-click menu | app |
| `header` | Reserved for the launcher header. Accepted, but the UI does not render it yet. | global |

An app-scoped plugin is described once per app; the `list` or `dock` choice
follows the app's placement, given to you as `ctx.appSurface`. A plugin whose
`surfaces` include `header` is also described once with a global context.

## `describe(ctx)`

`describe` returns what to draw. It must be **synchronous**: Loki does not
await it, so a returned Promise fails validation. Keep it fast; it runs on
every UI refresh for every app.

A **button**:

```ts
{ action: 'button', surface: 'list', label: 'restart', icon: 'rotate-ccw',
  visible: true, confirm: 'Restart?' }
```

A **toggle**:

```ts
{ action: 'toggle', surface: 'list', label: 'proxy', icon: 'zap',
  visible: true, checked: true }
```

A **group** of buttons or toggles:

```ts
{ kind: 'group', surface: 'list', label: 'Git', icon: 'git-branch',
  visible: true, mode: 'popup',
  items: [
    { id: 'pull', action: 'button', surface: 'list', label: 'Pull', icon: 'download', visible: true },
    { id: 'push', action: 'button', surface: 'list', label: 'Push', icon: 'upload', visible: true },
  ] }
```

| Field | Applies to | Meaning |
|---|---|---|
| `action` | button, toggle | `"button"` or `"toggle"`. |
| `kind` | group | `"group"`. |
| `surface` | all | One of the manifest's `surfaces`. Group items must use the group's surface. |
| `label` | all | Text of the control, or the popup trigger for a group. |
| `visible` | all | `false` hides it, for example while the app is stopped. |
| `icon` | all | One of `play`, `square`, `rotate-ccw`, `external-link`, `terminal`, `zap`, `flag`, `wrench`, `git-branch`, `download`, `upload`, `refresh-cw`, `archive`. Other names show a puzzle piece. Required on `dock`. |
| `title` | button, toggle | Tooltip. |
| `confirm` | button, toggle | Text shown on the first click; a second click within 3 seconds runs the action. |
| `disabledHint` | button, toggle | `true` shows the control disabled. |
| `checked` | toggle | Current state. |
| `id` | group items | Identifies the item; sent to `invoke` as `input.action`. |
| `mode` | group | `"buttons"` shows the items inline, `"popup"` behind one button. Only matters on `list`. |
| `items` | group | One or more buttons or toggles. |

If `describe` throws, or returns something invalid, that plugin is skipped
for that app and the error goes to the backend log. Other plugins and apps
are not affected.

## `invoke(ctx, input)`

Called when the user clicks the control. It may be `async`. `input` is:

| Control | `input` |
|---|---|
| button | `{}` |
| toggle | `{ checked: boolean }`, the new state |
| group item | `{ action: '<item id>' }` |

A thrown error is shown to the user. The return value is passed back to the
UI as `result` but is not displayed.

## Lifecycle hooks

Two optional exports run as a side effect of starting and stopping apps:

```ts
export async function onStart(ctx, info) { /* info.event === 'onStart' */ }
export async function onStop(ctx, info) { /* info.event === 'onStop' */ }
```

`onStart` runs right before the app's process starts, `onStop` when it is
stopped. They run for every installed plugin on every app, regardless of
`requiresConfig`, so check `ctx.app.plugins?.['your-id']` if the hook only
applies to configured apps. A failing hook is logged and does not block the
start or stop.

## The context object

Every function gets `ctx`:

| Field | Meaning |
|---|---|
| `ctx.scope` | `"app"` or `"global"`. The fields below except `host` exist only for `"app"`. |
| `ctx.app` | The app's config entry (`label`, `repoPath`, `appUrl`, `plugins`, …). See [Configuration](configuration.md#apps). |
| `ctx.status` | Live status: `name`, `process` (`running`, `stopped`, `port-conflict`, `unhealthy`, `unknown`), `port`, `branch`, `dirty`, `selectedEnvironment`, `runningEnvironment`, `appUrl`. |
| `ctx.appSurface` | `"list"` or `"dock"`, the app's placement. |
| `ctx.host` | Functions provided by Loki, below. |

`ctx.host`:

| Function | Does |
|---|---|
| `config.read()` | Returns the whole current config. |
| `apps.start(name, sel?)`, `apps.stop(name)`, `apps.restart(name)` | Control any app. `sel` may be `{ environment: '<script>' }`. |
| `apps.status(name)` | Live status of any app. |
| `runProcess(command, { cwd?, window? })` | Runs a shell command through the active process runner: a tmux window named `window`, or a detached process with its output in the sessions folder. Returns when it has been started, not when it ends. |
| `openUrl(url)` | Opens a URL in the default browser. |
| `readFile(path)`, `writeFile(path, content)` | Read and write UTF-8 files. `writeFile` creates missing folders. |
| `readState(pluginId, appName?)`, `writeState(pluginId, value, appName?)` | Small JSON data kept in `plugin-state.json`, per app, or global without `appName`. |
| `template(text, values)` | Replaces `{name}`, `{port}`, `{environment}`, `{branch}`, `{appUrl}`, `{repoPath}`, `{toggleState}` and `{version}` in `text`. Missing values become empty strings; other braces stay as they are. |

## Per-app settings

Settings for one app live in that app's config under `plugins`, keyed by
plugin id:

```json
"apps": {
  "web": {
    "label": "Web",
    "repoPath": "../web",
    "plugins": {
      "git-actions": { "placement": "popup", "confirm": { "push": true } }
    }
  }
}
```

Read them in your plugin as `ctx.app.plugins?.['git-actions']`. Adding the
plugin to an app in the Workspace (Apps → the app → **Plugins**) creates this
entry. With `requiresConfig` left at its default, having the entry is what
makes the plugin show on that app.

## How Loki loads plugin code

- `index.ts` is compiled file by file with TypeScript's `transpileModule` to
  CommonJS (ES2020). There is **no type checking**; run `tsc` yourself if you
  want it. `index.js` is loaded as is, as CommonJS.
- Relative imports between your plugin's files work. Use `import type` for
  types; a type-only import is removed during compilation, so its path does
  not have to exist at runtime.
- Node.js built-ins (`child_process`, `fs`, …) are available. There is no
  install step for npm packages: vendor what you need into the plugin folder.
- Plugins run inside the backend process with your user's permissions. There
  is no sandbox.
- Loki reloads plugin code from disk each time it uses it, so edits apply on
  the next refresh without restarting Loki.

The built-in plugins import `../../app/shared/types` and
`../_shared/pluginContext`. Those paths only exist inside the Loki
repository; a plugin in your own folder should define what it needs itself,
as in [A first plugin](#a-first-plugin).

## Testing and sharing a plugin

1. Put the plugin folder in your plugins folder, or add its parent folder (or
   the plugin folder itself) to Settings → **Storage** → **Plugins folders**.
2. Install it on the Workspace → **Plugins** tab.
3. Watch the backend output for errors: the terminal running `yarn start`
   during development, or the log folder of the installed app (see
   [Troubleshooting](troubleshooting.md#port-9999-or-1421-is-already-in-use)).
4. To check what Loki gets from `describe`, open
   `http://127.0.0.1:9999/api/plugins/descriptors`.

To share a plugin, zip its folder (the zip may contain the folder or its
contents) and publish it anywhere reachable over HTTPS. Others install it by
pasting the path or URL into the field on the Plugins tab. Downloads are
limited to 10 MB, must not redirect, and time out after 5 seconds. To offer
several plugins, host a catalog file in the format of
[`marketplace/catalog.json`](../../marketplace/catalog.json) and point
`global.pluginCatalogUrl` at it.

To add a plugin to Loki itself, put it in `marketplace/<id>/` and add it to
`marketplace/catalog.json` in a pull request (see
[CONTRIBUTING.md](../../CONTRIBUTING.md)).

## Built-in plugins as examples

| Plugin | Shows how to |
|---|---|
| [`open-site`](../../marketplace/open-site/index.ts) | A button that depends on the app's status, `host.template`, `host.openUrl` |
| [`restart-btn`](../../marketplace/restart-btn/index.ts) | `confirm`, `host.apps.restart` |
| [`proxy-toggle`](../../marketplace/proxy-toggle/index.ts) | A toggle, per-app state with `readState`/`writeState`, `host.runProcess` |
| [`git-log`](../../marketplace/git-log/index.ts) | A right-click menu item |
| [`git-actions`](../../marketplace/git-actions/index.ts) | Groups in `buttons` and `popup` mode, per-app settings, a different surface per setting |

The internals of the plugin host are described in the
[wiki](../backend/plugins.md).
