---
type: concept
title: Getting started
description: "Ten-minute tutorial: install Loki, add a first app, start it, switch branches, make a group, try the demo."
timestamp: "2026-10-24T00:00:00Z"
---

# Getting started

This tutorial takes about ten minutes. You install Loki, add a repository,
start it, switch its branch and put two apps in a group. At the end you know
the parts of Loki you will use every day.

You need:

- Loki installed (see [Install](../../README.md#install)), or Loki running
  from source (see [Development](development.md));
- one local Git repository you can run, with its dependencies installed. If
  you don't have one at hand, use the [demo apps](#use-the-demo-apps-instead)
  that come with the source code.

## 1. Open the launcher

Start Loki. No window opens. Loki lives in the **menu bar** on macOS and in
the **tray** on Windows (bottom-right, maybe behind the **^** arrow). Click
the icon: the **launcher** drops down.

With no apps configured, the launcher says *No apps yet* and shows an
**Open Workspace** button.

## 2. Add your first app

1. Click **Open Workspace**. The **Workspace** window opens on its **Apps**
   tab.
2. Click **Add app** and choose the folder of your repository. You can also
   drag the folder onto the window.
3. Loki reads the folder's `package.json` and adds the app right away. It
   names the app after the package and picks a script that looks like a dev
   server (`dev`, `start`, `serve` or `watch`) as the start command. If the
   folder has no `package.json`, Loki asks for the command that starts it,
   for example `python main.py`; type it and click **Add**.
4. The app appears in the list on the left with its settings on the right:
   **Environments**, **Details** (repo path, app URL, placement,
   dependencies, groups) and **Plugins**.

Close the Workspace window with **×**.

## 3. Start it

Open the launcher again. Your app has a row with:

- its name;
- the **environment**, which is the script it will run (for example `start`);
- the **branch** it is on (for example `main`);
- a **Start** button.

Click **Start**. Within a few seconds the button turns into **Stop** and the
port the app listens on appears next to it (`:4001`). The header counts how
many apps are running (`1 / 1 running`).

If the start fails because the port is taken, the row shows the error with
**Force start** and **Force stop** buttons. Force stop kills whatever holds
the port.

## 4. Switch the branch

Click the branch name on the row and pick another branch.

If you have uncommitted changes, Loki stashes them for the branch you are
leaving and checks out the new one. When you come back to the first branch,
the stash is applied again. Nothing is lost if a step fails: the stash stays
in `git stash list`.

A running app is not restarted after a branch switch. Most dev servers reload
on their own; if yours does not, stop and start it.

## 5. Pick an environment

Click the environment name on the row. The list shows the scripts from
`package.json` on the current branch, for example `start`, `dev`,
`dev:staging`. Pick one; the next start runs it (`npm run dev:staging`,
`yarn dev:staging` or `pnpm dev:staging`, depending on the lockfile).

If a repository has many scripts, open the app in the Workspace, click
**Filter** in **Environments** and enter a regular expression such as
`^(start|dev)`. Only matching scripts are offered.

## 6. Group two apps

Add a second app, then in the launcher right-click a row. Under **Groups**,
choose **New group**, name it, and add the other app to the same group.

The group gets its own header with a **Start**/**Stop** button for all its
apps, and a **⋮** menu to rename or delete it. Starting a group stops apps
of other groups first, so you can switch between sets of apps with one
click. Drag rows and group headers to
reorder them. **Favorite** in the same right-click menu pins an app to the
top.

## Use the demo apps instead

The source code includes three tiny Node.js apps in `demo/` and a config for
them. From a clone of the repository:

```sh
yarn demo:init        # gives the demo apps Git history and feature branches
```

macOS or Linux:

```sh
CONFIG_FILE="$PWD/demo/loki-config.json" yarn start
```

Windows PowerShell:

```powershell
$env:CONFIG_FILE = Join-Path (Get-Location).Path 'demo/loki-config.json'
yarn start
```

The launcher shows **Demo Backend** and **Demo Frontend** in a *Demo Web*
group, and **Demo Worker** in *Demo Background*. Demo Frontend depends on Demo
Backend, so starting the frontend starts the backend first. Open
`http://localhost:4002` to see the frontend. Switch Demo Backend to a
feature branch to see the branch switcher at work.

## Next steps

- [User guide](user-guide.md): every feature of the launcher and the
  Workspace.
- [Configuration reference](configuration.md): where the config lives and
  what each field does.
- [Plugins](plugins.md): add buttons and toggles to app rows.
