---
type: concept
title: Installers and releases
description: "Publishing a release, test builds on GitHub and local installers."
timestamp: "2026-10-24T00:00:00Z"
---

# Installers and releases

There are two ways to get installers: let GitHub build them (nothing to
install on your computer), or build one locally for the computer you are on.

| I want… | Do this |
|---|---|
| A new public release with downloads for everyone | [Publish a release](#publish-a-release) |
| Installers to test, without a public release | [Test build on GitHub](#test-build-on-github) |
| An installer for this computer only | [Build locally](#build-locally) |

## Publish a release

A release is named after the version in `package.json` (version `1.0.0`
becomes the tag and release `v1.0.0`). **Every release needs a new version**:
if the tag already exists, the build still runs but the last step,
*publish release*, fails with "already exists".

### 1. Raise the version

The version is written in four files, and all four must match:

| File | Line |
|---|---|
| `package.json` | `"version": "1.0.0",` |
| `app/src-tauri/tauri.conf.json` | `"version": "1.0.0",` |
| `app/src-tauri/Cargo.toml` | `version = "1.0.0"` (under `[package]`) |
| `app/src-tauri/Cargo.lock` | `version = "1.0.0"` under `name = "loki-orchestrator-desktop"` |

Local commits do the first three for you: after `yarn install`, a git
pre-commit hook (`scripts/bump-version.js`) raises the minor version
(`1.0.0` → `1.1.0`) on every commit. Commits made on GitHub, in a pull
request from Claude, or by a merge button do **not** run the hook, so there
you change the files by hand. `Cargo.lock` is not touched by the hook;
the next local `yarn build` or `cargo` run updates it, or edit it by hand.

To check which versions are already taken, open
[Releases](https://github.com/liubomyr-kozak/Loki/releases) or run
`git tag`.

### 2. Get it onto `main`

Merge the version change into `main` together with (or after) the changes
you want to ship. A release is built from the commit you choose, so anything
not yet merged is not in it.

### 3. Run the Release workflow

1. Open **Actions → Release → Run workflow**.
2. Branch: `main`.
3. Tick **publish**.
4. Click **Run workflow**.

It builds three installers in parallel (macOS Apple Silicon, macOS Intel,
Windows), which takes about five minutes. Then *publish release* tags the
commit `v<version>` and creates the release with the files attached. The
README's download link always points at the newest release.

Instead of steps 3.1–3.4 you can push the tag yourself; the tag must match
`package.json`:

```sh
git tag "v$(node -p "require('./package.json').version")"
git push origin --tags
```

### If it fails

| Failed step | Cause and fix |
|---|---|
| *publish release* → *Create release*: "already exists" | The version was not raised. Do step 1, merge, run again. |
| *Check tag matches package.json* | The pushed tag differs from `package.json`. Delete the tag and push the right one. |
| *build (…)* → a download error (HTTP 500, timeout) | GitHub or a download server hiccuped. **Re-run failed jobs** on the run page. |
| *build (…)* → a compile or test error | A real code problem; it shows in the CI checks of the pull request too. |

## Test build on GitHub

Same as step 3 above, but leave **publish** unticked. No version change is
needed and nothing is published. When the run finishes, the installers are
under **Artifacts** at the bottom of the run's page (`installer-aarch64-apple-darwin`,
`installer-x86_64-apple-darwin`, `installer-x86_64-pc-windows-msvc`), each a
zip with the `.dmg` or `-setup.exe` inside. They are kept for 14 days.

Pull requests that change the release workflow, `tauri.conf.json` or the
Node bundling script build these artifacts automatically.

## Build locally

First install the tools from [Development → Run from source](development.md#run-from-source)
(Node 22, Git, Rust, Xcode Command Line Tools on macOS or Visual Studio Build
Tools + WebView2 on Windows). Then, from the repository root:

```sh
corepack enable
yarn install --immutable
yarn doctor:strict
yarn build
```

The first build downloads and compiles Rust dependencies and takes several
minutes; later builds are faster. The installer is for the computer you
build on:

| Computer | Installer |
|---|---|
| macOS | `app/src-tauri/target/release/bundle/dmg/Loki_<version>_<arch>.dmg` |
| Windows | `app/src-tauri/target/release/bundle/nsis/Loki_<version>_x64-setup.exe` |

Install it like a downloaded release. For an Intel installer on an Apple
Silicon Mac (or the reverse), and for a DMG step that fails on Finder
permissions, see [Troubleshooting](troubleshooting.md#macos-yarn-build-fails-while-creating-the-dmg).

## What is inside an installer

The build downloads a pinned, checksum-verified Node.js runtime
(`scripts/bundle-node-runtime.js`, cached in `node_modules/.cache/loki-node/`)
and ships it inside the app, which uses it before any Node on the machine.
`LOKI_BUNDLE_NODE=0 yarn build` skips that; the installed app then needs Node
18+ on the target machine and searches PATH, the login shell, nvm, fnm, Volta,
asdf and Homebrew for it. Git is still needed on the target machine for branch
features, plus whatever the managed apps themselves run.

Finder can have a different PATH from Terminal: if a managed app's command
cannot find Yarn or another tool, configure its executable path/environment.

The installers are ad-hoc signed on macOS and unsigned on Windows; Apple
notarization and Windows code signing need paid certificates and are not set
up. [Troubleshooting](troubleshooting.md) shows how to open them the first
time.
