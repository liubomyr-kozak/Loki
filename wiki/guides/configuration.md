---
type: concept
title: Configuration reference
description: "Config file locations, every field of loki-config.json, state files, plugin folders and environment variables."
timestamp: "2026-10-24T00:00:00Z"
---

# Configuration reference

Where Loki keeps its config and state, every field of `loki-config.json`, and
the environment variables Loki reads. Most of this is edited through the
Workspace window; see the [user guide](user-guide.md) for that.

- [Where the config lives](#where-the-config-lives)
- [Files in the config folder](#files-in-the-config-folder)
- [`loki-config.json`](#loki-configjson)
  - [Top level](#top-level)
  - [`apps`](#apps)
  - [`global`](#global)
  - [`workspace`](#workspace)
- [Plugin folders](#plugin-folders)
- [Environment variables](#environment-variables)
- [Moving from the old `state/` folder](#moving-from-the-old-state-folder)

## Where the config lives

| Mode | Default config file |
|---|---|
| Installed, macOS | `~/Library/Application Support/com.liubomyr.loki-orchestrator/loki-config.json` |
| Installed, Windows | `%APPDATA%\com.liubomyr.loki-orchestrator\loki-config.json` |
| Installed, Linux | `${XDG_CONFIG_HOME:-~/.config}/com.liubomyr.loki-orchestrator/loki-config.json` |
| From source / CLI, macOS | `~/Library/Application Support/com.liubomyr.loki-orchestrator.dev/loki-config.json` |
| From source / CLI, Windows | `%APPDATA%\com.liubomyr.loki-orchestrator.dev\loki-config.json` |
| From source / CLI, Linux | `${XDG_CONFIG_HOME:-~/.config}/com.liubomyr.loki-orchestrator.dev/loki-config.json` |

The installed app and a source checkout use separate profiles (`.dev`), so
developing Loki does not touch the config of the Loki you use. The path in
use is shown in Settings → **Storage** and returned by
`GET http://127.0.0.1:9999/api/config/path`.

To use another file, set **`CONFIG_FILE`** to its path (absolute paths are
safest; a relative one resolves against the folder you launch from). For
`yarn cli`, a path given as an argument wins over `CONFIG_FILE`. The file can
be JSON, or YAML with a `.yaml`/`.yml` extension.

On first launch Loki creates an empty config. Relative paths inside the
config (`repoPath`, `stateFile`, `sessionsDir`, plugin folders) resolve
against the config file's folder, so a config and its repositories can be
moved together. Importing a config in Settings keeps relative repository
paths pointing at the imported file's original folder.

## Files in the config folder

```text
<config folder>/
  loki-config.json      apps, groups, plugins and settings (you may edit it)
  state.json            processes Loki started: pid, port, environment
  selections.json       environment chosen per app
  groupSelections.json  branch and environment chosen per app inside each group
  instances.json        clones of apps
  favorites.json        favorites and the order of rows
  git-stashes.json      which stash belongs to which app and branch
  plugin-state.json     data plugins store, per plugin and app
  sessions/             output of apps run as detached processes
  plugins/              your plugins, one folder per plugin
  panel-width.json      launcher size (desktop only)
  workspace-size.json   Workspace window size (desktop only)
```

Everything except `loki-config.json` and `plugins/` is written by Loki; there
is no need to edit those files. The sidecar files sit next to `stateFile`, so
moving `global.stateFile` moves them too. Crash logs of the packaged desktop
app go to the platform's log folder:
`~/Library/Logs/com.liubomyr.loki-orchestrator/` on macOS,
`%LOCALAPPDATA%\com.liubomyr.loki-orchestrator\logs\` on Windows.

## `loki-config.json`

A minimal config with one app (replace `repoPath` with a real checkout):

```json
{
  "version": 1,
  "global": {
    "sessionProvider": "detached"
  },
  "apps": {
    "my-app": {
      "label": "My app",
      "repoPath": "/absolute/path/to/my-app",
      "startCommand": "npm run dev"
    }
  },
  "groupOrder": [],
  "plugins": []
}
```

A fuller example is [`demo/loki-config.json`](../../demo/loki-config.json).
After editing the file by hand, apply it with Settings → **Reload
configuration**. Unknown fields are kept, so a config written by a newer
Loki still loads.

### Top level

| Field | Type | Meaning |
|---|---|---|
| `version` | number | Format version. Currently `1`. |
| `apps` | object, **required** | Your apps, keyed by an id of your choice (`"my-app"`). See [`apps`](#apps). |
| `global` | object | Settings that apply to all apps. See [`global`](#global). |
| `groupOrder` | string[] | Group names in display order. A name used in an app's `groups` but missing here still works, but does not count as a group for exclusive group start. |
| `plugins` | string[] | Ids of installed (activated) plugins. |
| `disabledPlugins` | string[] | Ids of installed plugins that are switched off. |
| `workspace` | object | Reserved. See [`workspace`](#workspace). |

### `apps`

Each key is the app's id; Loki uses it in file names, tmux window names and
the HTTP API. Each value:

| Field | Type | Meaning |
|---|---|---|
| `label` | string, **required** | Name shown in the UI. |
| `repoPath` | string | Folder of the repository. Needed to start the app. Relative to the config folder unless absolute. |
| `startCommand` | string | Command to run when no `package.json` script is selected or matched. Required when the app is created through the API. |
| `appUrl` | string | Address the app is reached at, for example `http://localhost:4002`. Used by plugins such as Open Site. |
| `repoUrl` | string | Web address of the repository, shown in the details. |
| `dependsOn` | string[] | Ids of apps to start before this one. |
| `groups` | string[] | Names of the groups the app belongs to. |
| `surface` | `"list"` or `"dock"` | Placement in the launcher: a row, or an icon in the dock bar. Default `"list"`. |
| `icon` | string | Icon name from the icon picker (Lucide icon names such as `server`, `globe`, `cpu`). |
| `environmentFilter` | object | Which `package.json` scripts are offered as environments. `{ "useGlobal": true }` uses `global.environmentFilterRegex`; `{ "useGlobal": false, "filterRegex": "^dev" }` sets the app's own. Absent means use the global one. |
| `plugins` | object | Per-app plugin settings, keyed by plugin id: `{ "git-actions": { "placement": "popup" } }`. A plugin with `requiresConfig` shows only on apps that have an entry here, even an empty `{}`. |

How the command is chosen at start: if `repoPath` has a `package.json`, its
scripts are filtered by the environment filter, and the selected script runs
(`npm run <script>`, or `yarn <script>`/`pnpm <script>` when that lockfile
exists). With no selection, the first matching script runs. With no
`package.json` or no matching script, `startCommand` runs. Commands run in
the configured shell (`cmd.exe` on Windows), in `repoPath`.

On Windows, JSON paths may use forward slashes (`C:/work/my-app`). Use
package scripts rather than POSIX syntax such as `PORT=4001 node server.js`,
which `cmd.exe` does not understand.

### `global`

| Field | Type | Default | Meaning |
|---|---|---|---|
| `sessionProvider` | string | `tmux` if available, else `detached` | How apps are run: `tmux` (macOS, Linux) or `detached` (all OS). `init-service` and `windows-service` are listed but not implemented. An unavailable choice falls back to the first available one. |
| `sessionsDir` | string | `sessions` | Folder for detached apps' output. Relative to the config folder. |
| `stateFile` | string | `state.json` | Process record; the other sidecar files go next to it. |
| `pluginFolders` | string[] | `["plugins"]` | Your plugin folders. See [Plugin folders](#plugin-folders). |
| `pluginsDir` | string | | Older single plugins folder, used only when `pluginFolders` is unset. |
| `marketplaceDir` | string | built-in `marketplace/` | Folder of the built-in plugins. For development. |
| `pluginCatalogUrl` | string | built-in `marketplace/catalog.json` | `http(s)` URL of a plugin catalog to list on the Plugins tab instead of the built-in one. |
| `packageManager` | string | `npm` | Package manager used when a repository has no lockfile: `npm`, `yarn` or `pnpm`. |
| `defaultShell` | string | detected | Shell used to run start commands, for example `/bin/zsh` or `cmd.exe`. |
| `environmentFilterRegex` | string | empty (all scripts) | Global environment filter. |
| `tmuxBin` | string | detected | Path to the `tmux` binary. |
| `sessionPrefix` | string | | Name of the tmux session. |
| `socketPath` | string | | tmux socket file. |
| `nodePath` | string | | Stored by Settings → Environment → Runtime. Not used when launching apps yet. |
| `attachBehavior` | `"auto"` or `"manual"` | | Stored tmux preference. Not used yet. |
| `restartStaleSessions` | boolean | | Stored tmux preference. Not used yet. |

### `workspace`

`workspace.name` and `workspace.editorCommand` are accepted and returned by
`GET /api/config`, but nothing uses them yet.

## Plugin folders

Loki loads plugins from the built-in set and from your plugin folders,
configured in Settings → **Storage** → **Plugins folders** and saved as
`global.pluginFolders`. The field takes one folder per line, or folders
separated by commas; full paths and `~/` work. When unset, it is `plugins/`
next to the config, created automatically. The folder button on the Plugins
tab opens that setting.

Each entry is a folder, not a file, and is either:

- a folder of plugin folders, where each subfolder's name must equal its
  manifest `id` (subfolders starting with `_` are skipped); or
- one plugin folder with its own `manifest.json`.

Plugins found there appear on the Plugins tab, where **Install** turns them
on. Plugins installed from a path, a `.zip` or a URL are copied into the
first folder. When the same id exists in several places, your folders win
over the built-in plugins, and earlier folders win over later ones. How to
write a plugin: [Plugins](plugins.md).

## Environment variables

| Variable | Read by | Effect |
|---|---|---|
| `CONFIG_FILE` | backend | Config file to use instead of the default. |
| `APP_SESSIONS_DIR` | backend | Default for `global.sessionsDir` when the config has none. |
| `MARKETPLACE_DIR` | backend | Folder of the built-in plugins; wins over `global.marketplaceDir`. |
| `CATALOG_FILE` | backend | Local catalog file, used when `global.pluginCatalogUrl` is not an `http(s)` URL. |
| `TMUX_BIN` | backend | tmux binary to try before the usual locations. |
| `LOKI_SKIP_SHELL_PATH` | backend | `1` stops Loki from reading `PATH` from your login shell at startup (macOS, Linux). |
| `LOKI_PORT` | backend | Port of a standalone backend (`yarn backend:dev`). The UI always talks to `9999`, so change it only for scripts and tests. |
| `LOKI_BUNDLE_NODE` | build | `0` builds an installer without the bundled Node.js. See [Releasing](releasing.md#what-is-inside-an-installer). |

The apps Loki starts do not see the backend variables above, nor `PORT` or
anything starting with `LOKI_`: each app gets its port from its own config or
scripts, never from Loki's environment.

## Moving from the old `state/` folder

Older checkouts kept their config in `state/loki-config.json` inside the
repository. Close Loki and the apps it runs, then, **before the first launch
with the new defaults**, run:

```sh
yarn config:migrate
```

It copies the `state/` profile into the source-mode profile, keeps the
sidecar files and custom subfolders, and fixes relative repository paths.
The original files stay where they are. It refuses to overwrite an existing
profile; if you already launched the new one, use Settings → **Import
settings** with the old `state/` folder instead. To keep using the old
folder, set `CONFIG_FILE` to `state/loki-config.json`. Personal config and
state are not committed to Git; `demo/loki-config.json` is the checked-in
example.
