---
type: concept
title: Development
description: "Running Loki from source, launch modes, the demo, build layout and tests."
timestamp: "2026-10-24T00:00:00Z"
---

# Development

How to run, build and test Loki from source on macOS, Windows and Linux. To
just use Loki, download an installer instead: see the
[README](../../README.md#install). Contribution rules are in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## Run from source

Install these once:

| Tool | macOS | Windows |
|---|---|---|
| Node.js | Node 22 (CI version) | Node 22 (CI version) |
| Git | `xcode-select --install` includes Git | Git for Windows on PATH |
| Rust | Stable Rust from [rustup.rs](https://rustup.rs) | Stable Rust with the MSVC toolchain |
| Native desktop tools | Xcode Command Line Tools: `xcode-select --install` | Visual Studio Build Tools: **Desktop development with C++** and Windows SDK |
| Webview | System WebKit | Microsoft Edge WebView2 Runtime |

On Linux, install Node 22, Git, Rust and the WebKitGTK packages Tauri needs;
on Ubuntu 24.04 that is
`sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev`
(the same list CI uses). Linux builds run in CI but no Linux installer is
published.

Use [Tauri's prerequisite guide](https://v2.tauri.app/start/prerequisites/) for
native installation details. Open a new terminal after installing tools so
PATH includes Node, Git and cargo. `tmux` is optional; the detached process
provider works everywhere. Init Service and Windows Service are not
implemented.

Run from the repository root in Terminal or PowerShell:

```sh
git clone https://github.com/liubomyr-kozak/Loki.git
cd Loki
# If corepack is missing: npm install --global corepack
corepack enable
yarn install --immutable
yarn doctor:strict
yarn tauri info
yarn start
```

Yarn is pinned to 4.12.0. `yarn start` is an alias for `yarn dev`: it checks basic
tools, compiles the backend and launches Tauri, Vite and the backend. The
first launch also downloads/builds Rust dependencies and can take several
minutes. Internet access is needed for the initial dependency installation.

**Open Loki from the tray/menu-bar icon**; the launcher starts hidden. Use
**Open Workspace** to add a local Git repository and start it (see
[Getting started](getting-started.md)). Install that repository's own dependencies first. No manual config
file or `.env` file is required for an empty first launch.

Keep **9999** (backend) and **1421** (Vite) free. Close an installed Loki or
another dev session before starting; do not run `yarn backend:dev` alongside
`yarn start`, because the desktop shell starts its own backend.

`doctor:strict` checks Node, Yarn, Git and cargo. `yarn tauri info` reports
native dependencies; the native build is the final compiler check.
If something fails, see [Troubleshooting](troubleshooting.md).

### Other launch modes

| Command | Purpose |
|---|---|
| `yarn dev` / `yarn start` | Complete desktop development app |
| `yarn backend:dev` | Backend only on port 9999 |
| `yarn ui:dev` | UI development server on port 1421; run `yarn backend:dev` in another terminal |
| `yarn cli` | Interactive backend CLI; optionally append a config file path |
| `yarn build` | Build a native installer on the current OS |

With `yarn backend:dev` and `yarn ui:dev` running, open
`http://localhost:1421/` in a browser for the launcher UI and
`http://localhost:1421/?window=workspace` for the Workspace. Everything that
goes over HTTP works there; native dialogs, the tray, terminals and other
Tauri commands need the desktop app.

### Try the demo

```sh
yarn demo:init
```

This creates Git history and feature branches for the three bundled demo
apps without replacing existing repositories. It uses a local demo commit
identity, so a global Git identity is not required. `--force` explicitly
rebuilds a demo repo and discards its history.

Then select the demo config and launch:

macOS or Linux terminal:

```sh
CONFIG_FILE="$PWD/demo/loki-config.json" yarn start
```

Windows PowerShell:

```powershell
$env:CONFIG_FILE = Join-Path (Get-Location).Path 'demo/loki-config.json'
yarn start
# After exiting, return to your normal profile:
Remove-Item Env:CONFIG_FILE
```

Demo apps use Node's built-in modules, the detached provider and portable
commands. Backend/frontend ports default to 4001/4002. No extra npm install
is needed inside the demo repositories.

## Build layout

The Tauri CLI owns the build lifecycle through `beforeDevCommand` and
`beforeBuildCommand`, following [Tauri's lifecycle configuration](https://v2.tauri.app/develop/).
`yarn dev` prepares the backend/resources and starts Vite before launching
Rust. `yarn build` prepares those same resources and the production UI before
compiling and packaging the native app. Direct `yarn tauri dev` / `yarn tauri
build` commands execute the same hooks, so no separate preparation is needed.

```text
dist/                         generated JavaScript output; ignored by Git
  backend/                    TypeScript server/CLI output; no test files
  shared/                     Shared modules used by the compiled backend
  frontend/                   type-checked Vite production HTML/CSS/JS
  resources/                  self-contained server bundle + marketplace
app/src-tauri/target/        Cargo cache, native executables and installers
```

`frontendDist` points only to `dist/frontend`; the Tauri resource mapping
copies only `dist/resources` into the app. Vite clears only its own frontend
directory, preserving the sibling backend/resources outputs.

- `yarn build:assets`: prepare JS outputs without compiling Rust.
- `yarn clean`: remove generated JS outputs, including old output locations;
  stop dev processes first. Cargo's cache is retained.
- `yarn desktop:dev` and `yarn desktop:build`: compatibility aliases.
- `yarn ui:typecheck`: check frontend TypeScript without emitting files;
  also runs automatically before every production UI build.

On macOS without Finder automation access, DMG window decoration can fail.
Use `CI=true yarn build` in Terminal for a headless build; Tauri skips Finder
layout customization. GitHub Actions already sets `CI=true`.


## Tests

| Command | What it checks | Time |
|---|---|---|
| `yarn server:build` | The backend compiles (`tsc`) | seconds |
| `yarn ui:build` | The UI type-checks and builds (Vite) | seconds |
| `yarn test` | Unit tests (Vitest) for config, plugins, providers and lifecycle | under a minute |
| `node scripts/smoke-test.js` | The backend starts and saves config from source, compiled and packaged | about a minute |
| `node scripts/smoke-test.js app` | Builds and launches the desktop binary; uses port 9999 and the real installed-app profile | minutes |
| End-to-end, below | The UI against a real backend and the demo apps | about 3 minutes |

CI ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) runs the first
four on macOS, Ubuntu and Windows for every pull request, and builds the
desktop bundle on all three.

### End-to-end tests

The Playwright suites in `e2e/` start their own backend and Vite dev server
against a copy of the demo apps in a temporary folder. Ports 9999 and 1421
must be free, so stop `yarn start` and any installed Loki first.

```sh
yarn demo:init                                   # once: the Git suites need the demo branches
npx playwright install chromium                  # once, if Playwright has no browser yet
npx playwright test -c e2e/playwright.config.ts
```

Suites run one at a time because they share the demo apps. A failing test
leaves a trace under `test-results/`; open it with
`npx playwright show-trace <path>`.

### Manual checks on each OS

A Linux container can run everything above except the native desktop on
Windows and macOS. Before a release, install the CI-built installer on each
OS and check the tray and Workspace, starting and stopping a repository, a
repository path with spaces, and that the config survives a restart.

## Project layout

The folders and what lives where are described in
[Architecture → Repository layout](architecture.md#repository-layout). Run
all commands from the repository root: one root `package.json` and
`yarn.lock` manage the JavaScript dependencies, and Cargo output lives in
`app/src-tauri/target/`. The UI imports contracts from `app/shared/`, which
must stay independent of Node.js and backend modules.

After updating from the old layout (`desktop/` instead of `app/`), stop any
running development session and run
`cargo clean --manifest-path app/src-tauri/Cargo.toml` once if Cargo reports
missing files under `desktop/tauri/target`. Its cache contains absolute
paths.
