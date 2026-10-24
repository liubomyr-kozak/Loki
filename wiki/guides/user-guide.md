---
type: concept
title: User guide
description: "The launcher, environments, branches, groups, clones, terminals, the Workspace window, plugins, settings and shortcuts."
timestamp: "2026-10-24T00:00:00Z"
---

# User guide

Everything you can do in Loki's two windows: the **launcher** for daily
start, stop and branch switching, and the **Workspace** for setting apps up.
New to Loki? Start with [Getting started](getting-started.md).

- [The launcher](#the-launcher)
- [Starting and stopping apps](#starting-and-stopping-apps)
- [Environments](#environments)
- [Branches](#branches)
- [Groups, favorites and order](#groups-favorites-and-order)
- [Clones](#clones)
- [Terminals and logs](#terminals-and-logs)
- [The Workspace window](#the-workspace-window)
- [Plugins](#plugins)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)

## The launcher

Click Loki's icon in the menu bar (macOS) or tray (Windows). The launcher
shows:

- **Header:** the running count (`2 / 3 running`; click it to show only
  running apps), the tmux sessions button (when tmux is the process runner)
  and the settings button **⬡**.
- **Groups:** each group has a header with its name, how many of its apps
  run, a **Start** or **Stop** button for the whole group and a **⋮** menu
  (**Start group**, **Stop group**, **Rename**, **Delete group**).
- **All:** every app, collapsed by default.
- **Dock:** apps whose placement is *Dock* appear as icons along the bottom
  instead of as rows.

Each app row shows the environment, the branch, plugin controls, and the
**Start**/**Stop** button with the port once the app listens on one.
Right-click a row for its menu: groups, **Favorite**, **Open in terminal**,
**Clone**, plugin actions and **App settings**.

## Starting and stopping apps

- **Start** runs the app's selected environment in its repository folder.
  Apps listed under *Depends on* are started first.
- **Stop** ends the app's process and everything it started.
- **Restart** is in the terminal button's hold menu and in plugins such as
  *Restart Button*.
- A group's **Start** starts every app of the group. A group is exclusive:
  running apps that belong to other groups are stopped first. Apps in no
  group are never touched. Starting a single row inside a group section works
  the same way.
- Each group remembers the branch and environment you chose for each of its
  apps. If an app of the group is already running on something else, Loki
  asks whether to restart it with the group's choice or leave it running,
  instead of deciding silently.

The port is detected from the running process, so there is nothing to
configure. If the app also needs a fixed address, set **App URL** in its
details; plugins such as *Open Site* use it.

When a start fails because the port is in use, the row shows the error and
two buttons: **Force start** starts anyway, **Force stop** kills the process
that holds the port.

Apps run outside Loki's own process (in tmux, or as detached background
processes), so they keep running when Loki quits. Loki keeps a record of
what it started and picks those apps up again on its next start.

## Environments

An environment is one of the scripts in the app's `package.json`. The
environment picker on the row lists the scripts on the current branch, and
the selected one is what **Start** runs. The command depends on the lockfile
in the repository: `yarn <script>` with `yarn.lock`, `pnpm <script>` with
`pnpm-lock.yaml`, otherwise `npm run <script>`.

To shorten the list, filter scripts with a regular expression:

- for all apps: Workspace → **Settings** → **Environment Filter**;
- for one app: Workspace → **Apps** → the app → **Environments** →
  **Filter**. Either use the global value or set the app's own regex.

An empty filter shows every script. An invalid regex is ignored, so the app
can still start.

If the repository has no `package.json`, or the filter matches no script,
Start runs the app's own start command instead (the one you typed when adding
it, or `startCommand` in the [config](configuration.md#apps)).

The branch picker in **Environments** previews the scripts of another branch
without checking it out.

## Branches

Click the branch on a row to switch it. Loki:

1. stashes uncommitted changes, recorded for the branch you are leaving;
2. checks out the selected branch;
3. applies the stash recorded for that branch, if there is one.

If applying the stash conflicts, the row reports *Unresolved conflict* and
branch switching for that app stops until you resolve the conflict in the
repository. Stashes always stay in `git stash list`, so you can recover them
by hand.

Switching the branch does not restart a running app.

## Groups, favorites and order

- **Add to a group:** right-click a row → **Groups** → tick a group, or
  **New group**. An app can belong to several groups. Groups can also be
  edited in the app's details in the Workspace.
- **Rename or delete a group:** the **⋮** menu on the group header. Deleting
  a group keeps its apps.
- **Reorder:** drag rows within a group, or drag group headers.
- **Favorite:** right-click → **Favorite** moves the app to the top.
- **Search:** with the launcher focused, just start typing. **Esc** clears the
  search.

## Clones

Right-click → **Clone** adds a second row for the same app, for example to
watch it on another environment. A clone with the same environment as the
original controls the same process. A clone with a different environment
runs its own process next to the original. Delete a clone from its own
right-click menu (**Delete clone**).

## Terminals and logs

How you reach an app's output depends on the process runner chosen in
Settings → **Execution**:

- **tmux** (macOS and Linux, recommended there): each app runs in a window of
  a shared tmux session. The terminal button on a running row opens a
  terminal attached to it. Hold the button for **Open terminal**,
  **Restart** and **Copy tmux attach command**. The header's sessions button
  lists the tmux windows.
- **Detached process** (every OS, the only choice on Windows): each app runs
  as a background process and its output goes to a log file in the sessions
  folder (see [Configuration](configuration.md#files-in-the-config-folder)).

**Open in terminal** in the right-click menu opens a plain terminal in the
app's folder in both modes.

## The Workspace window

Open it from the launcher: **⬡** → **Workspace**, a row's right-click menu →
**App settings**, or **Open Workspace** when no apps exist. It has three
tabs.

### Apps

The list of apps on the left, with **Add app** at the bottom. Drop a
repository folder on the window to add it as well. For the selected app:

| Section | What you set |
|---|---|
| Header | Icon, name, **Yarn install** (runs `yarn install` in the app's folder) and **Terminal** |
| Environments | Scripts on a branch, the environment **Filter** |
| Details | **Repo path**, **Repo URL**, **App URL**, **Placement** (List or Dock), **Depends on**, **Groups** |
| Plugins | Plugins turned on for this app and their per-app settings |
| Delete app | Removes the app from Loki. The repository on disk is not touched. |

### Plugins

Plugins you can install, and the installed ones. See [Plugins](#plugins).

### Settings

The same Settings as below, in a larger window.

## Plugins

Plugins add controls to app rows: buttons, toggles, popups and right-click
menu items. Five come with Loki:

| Plugin | What it adds | Shows on |
|---|---|---|
| Git Actions | Fetch, Pull, Push and Stash for the app's repository, as buttons, a popup or menu items | every app |
| Open Site (demo) | A button that opens the running app in the browser | every app |
| Restart Button (demo) | A restart button that asks for confirmation | every app |
| Git Log (demo) | A right-click item that shows `git log` in a terminal window | apps you add it to |
| Custom Toggle (demo) | A per-app toggle that runs a command when switched | apps you add it to |

To use one:

1. Workspace → **Plugins** → **Install** next to the plugin. It moves from
   *Marketplace* to *Installed*, and plugins marked *every app* appear on
   all rows right away.
2. For the other plugins, open an app on the **Apps** tab and add the plugin
   under **Plugins**. It then shows on that app only, and you can give it
   per-app settings there.

To install a plugin that is not in the list, paste a folder path, a `.zip`
path or a `.zip` URL into the field on the Plugins tab, or drop the folder
there. Loki shows the plugin's name and description before it installs it.
The folder button next to the field opens Settings → **Storage**, where
your plugin folders are configured.

Plugins run with your user's permissions and can run commands. Install only
plugins you trust. Writing your own: [Plugins](plugins.md).

## Settings

Open them with **⬡** in the launcher. The launcher's own settings:

- **Configuration:** **Workspace** (opens the Workspace window),
  **Edit in your editor** (opens `loki-config.json`), **Reload
  configuration** (apply changes made in the file), **Restart Loki**.
- **General:** **Launch at login**.
- **Appearance:** theme (auto, light, dark).

The Workspace's **Settings** tab holds the rest:

| Section | What it controls |
|---|---|
| Execution | Process runner: tmux or Detached process, and their options |
| Environment | Shell and Node.js used to launch apps |
| Environment Filter | The global script filter (see [Environments](#environments)) |
| Storage | **Config folder**, **Plugins folders**, **Import settings** |

**Import settings** takes the folder that holds another `loki-config.json`
(from another machine, say) and merges its apps into yours, or replaces your
config. **Reset to defaults** clears the Execution, Environment and filter
settings; the storage paths and your apps stay.

Every field is stored in `loki-config.json`; the
[configuration reference](configuration.md) lists them.

## Keyboard shortcuts

| Keys | Where | Does |
|---|---|---|
| Any letter | Launcher | Starts a search with that letter |
| Esc | Launcher, while searching | Clears the search |
| Cmd+R / Ctrl+R | Launcher | Restarts Loki |
