---
type: concept
title: Troubleshooting
description: "Install, launch, port, PATH and build problems and how to fix them."
timestamp: "2026-10-24T00:00:00Z"
---

# Troubleshooting

## macOS says "Loki Not Opened" or "can't be opened" or "is damaged"

Typical messages: *"Loki" Not Opened. Apple could not verify "Loki" is free of
malware…*, *"Loki" can't be opened because Apple cannot check it for malicious
software*, or *"Loki" is damaged and can't be opened*. The app is not
notarized by Apple, so Gatekeeper blocks the first launch of a downloaded
copy. The file is fine. Click **Done**, not **Move to Bin**.

Option 1, in System Settings:

1. Try to open Loki once from **Applications** and click **Done**.
2. Open **System Settings → Privacy & Security**, scroll down to **Security**
   and click **Open Anyway** next to the Loki message, then confirm with your
   password. This button appears only for about an hour after the blocked
   attempt.

On macOS 15 Sequoia and newer, right-click → **Open** no longer skips this
check; use the steps above.

Option 2, in Terminal (also fixes "is damaged"): remove the download
quarantine flag and open the app again.

```sh
xattr -dr com.apple.quarantine /Applications/Loki.app
```

## Windows protected your PC (SmartScreen)

The installer is not code-signed, so SmartScreen warns about an unknown
publisher. Click **More info → Run anyway**. If the browser blocks the
download, choose **Keep** from the download's menu.

## Loki starts but no window appears

That is expected: Loki lives in the tray (Windows, bottom-right, possibly
under the **^** overflow arrow) or in the macOS menu bar. Click the icon to
open the launcher. On a MacBook with a notch, a full menu bar can hide the
icon; close a few menu-bar apps or use a menu-bar manager.

## "Node.js not found" or "Node.js is too old" on launch

Only builds made with `LOKI_BUNDLE_NODE=0` rely on a system Node. Install the
current Node LTS (`brew install node` / `winget install OpenJS.NodeJS.LTS`)
or use a release download, which carries its own runtime.

## Loki hangs on "Connecting to orchestrator…" or says port 9999 is in use

The window keeps showing *Connecting to orchestrator…* until the backend
answers on `127.0.0.1:9999`, and retries every second. If another program
already listens on that port, the backend cannot start: the installed app
shows an error that names the program and its PID (on macOS and Linux), and
`yarn start` prints `Cannot listen on 127.0.0.1:9999`. Stop that program or
move it to another port, then start Loki again. A dev server that listens
only on `[::1]:9999` (some Vite setups) no longer gets in the way, because
Loki uses the IPv4 address. See the next section for how to find the
process.

## Port 9999 or 1421 is already in use

Only one Loki can run at a time: the backend always listens on
`127.0.0.1:9999` and the dev UI on 1421. Quit the installed Loki before `yarn start`, and do not run
`yarn backend:dev` next to it. To find the process holding a port:

```sh
lsof -nP -iTCP:9999 -sTCP:LISTEN                  # macOS
Get-NetTCPConnection -LocalPort 9999 | Select OwningProcess   # PowerShell
```

The backend's error and crash logs are in Loki's log folder:
`~/Library/Logs/com.liubomyr.loki-orchestrator/` on macOS,
`%LOCALAPPDATA%\com.liubomyr.loki-orchestrator\logs\` on Windows.

## `yarn install` fails or uses Yarn 1

The repo pins Yarn 4 through `packageManager`. Run `corepack enable` (on a
fresh Node install, `npm install --global corepack` first) and open a new
terminal. On Windows, run the terminal as administrator once for
`corepack enable` if it reports a permission error.

If Corepack cannot download Yarn (`Error when performing the request to
https://repo.yarnpkg.com/…`, common behind company proxies), let it fetch
Yarn from the npm registry instead:

```sh
export COREPACK_NPM_REGISTRY=https://registry.npmjs.org     # macOS / Linux
$env:COREPACK_NPM_REGISTRY = 'https://registry.npmjs.org'   # PowerShell
```

## `cargo` or `link.exe` not found, or the Rust build fails

- Open a new terminal after installing Rust so `~/.cargo/bin` is on PATH;
  `yarn doctor` shows what is missing.
- Windows: install **Visual Studio Build Tools** with **Desktop development
  with C++** (MSVC and the Windows SDK). Rust must use the MSVC toolchain
  (`rustup default stable-msvc`).
- macOS: run `xcode-select --install`. After a macOS or Xcode update, accept
  the license with `sudo xcodebuild -license accept`.
- `yarn tauri info` lists every native dependency Tauri checks.

## macOS `yarn build` fails while creating the DMG

Building the DMG scripts Finder, which needs Automation permission. Run
`CI=true yarn build` to skip the Finder layout step, or allow Terminal under
**System Settings → Privacy & Security → Automation**.

## Building an Intel Mac installer on Apple Silicon (or the reverse)

```sh
rustup target add x86_64-apple-darwin
yarn tauri build --target x86_64-apple-darwin
```

The bundled Node runtime follows the target automatically. The result is in
`app/src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/`.

## A managed app's command works in Terminal but not in Loki

Apps launched from Finder or the Dock start with a bare PATH, so tools
installed through nvm, Homebrew or Volta (`yarn: command not found`, pane
exits with status 127) would be missing. On macOS and Linux Loki asks your
login shell (`$SHELL -ilc`) for its PATH at startup and runs start commands
in that same shell, so this should not happen any more. If it still does,
make sure the PATH changes live in a file your login shell reads
(`~/.zprofile` or `~/.zshrc` for zsh), restart Loki, or use full executable
paths in the start command. If a tmux server from an older Loki is still
running, `tmux -S /tmp/mfe-tmux-$(id -u).sock kill-server` clears it.

On Windows, commands run through `cmd.exe`, so POSIX syntax like
`PORT=4001 node server.js` does not work; use a package script instead.
