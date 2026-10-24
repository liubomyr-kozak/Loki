---
type: concept
title: Provider session lifecycle
timestamp: "2026-07-24T08:16:18Z"
---

# Provider session lifecycle

# Provider session lifecycle

How session providers register, resolve, and manage the underlying
process/session lifecycle for each concrete backend (`detached`, `tmux`,
`initService` placeholder, `windowsService` placeholder). For the general
`SessionProvider` interface shape and `resolveEffective`/`effectiveConfig`
contracts, see the session-providers-effective-config page — this page covers
the provider-internal behavior and per-provider rationale that page doesn't.

## Registration order and side-effect imports

`backend/server.ts` imports the four provider modules purely for their
registration side effect (`registerProvider(...)` at module bottom):

```ts
// Importing these registers every session provider (side effect).
import './apps/providers/tmuxProvider';
import './apps/providers/detachedProvider';
import './apps/providers/initServiceProvider';
import './apps/providers/windowsServiceProvider';
```

`backend/apps/providerRegistry.ts` separately imports `tmuxProvider` and
`detachedProvider` for their `configure()` functions — importing for the
`configure()` call incidentally re-triggers the same `registerProvider()` side
effect (harmless: registration is idempotent by id). `providerRegistry.ts`'s
`currentConfigFilePath()`/`primeProviders()` resolve the config file the same
way `server.ts` does, because `primeProviders()` needs it too:
`resolveSessionsDir()` must resolve a relative `global.sessionsDir` against the
config file's directory (matching `detectRuntime()`'s `detected.sessionsDir`)
rather than against `process.cwd()`.

`configureDetached({ resolvePid, ... })` wires a fallback: the detached
provider's in-memory `pids` map only knows about processes started by *this*
backend instance, so after a backend restart it has nothing for
already-running sessions. `resolvePid` lets it fall back to the on-disk
process registry instead of under-reporting a live session as "not running".

## `sessionProvider.ts` — the interface contract

- `SessionState` (`present`/`dead`/`pid`) is richer than the plain
  `sessionAlive()` boolean. Providers with nothing richer to report simply
  omit `sessionState()`, and callers fall back to `sessionAlive()`.
- `SessionSnapshot` is `unknown` — an opaque, provider-produced, point-in-time
  liveness snapshot (e.g. tmux's window-info map) handed back to
  `sessionState()`/`sessionAlive()` so an N-app sweep can do one shared probe
  (one `tmux list-windows` fork) instead of N. Its concrete shape is private
  to the producing provider; callers only pass it through opaquely.
- `availability()` sits on the hot poll path — `resolveProvider()` runs on
  every status poll — so it must be cheap and cacheable. Callers pass
  `{ bypassCache: true }` only from the explicit "Detect again" endpoint.
- `resolveProvider(config)` prefers `config.global.sessionProvider` by id if
  registered and available, else the first available provider in
  registration order. In practice it never throws (the built-in detached
  provider is always available and is imported wherever a provider is
  needed) — but if no provider module were imported at all, there would be
  nothing to fall back to, and it throws a clear "import a provider module"
  error rather than a confusing downstream failure.
- `computeRecommendedId()` is computed for the **host only** (no `platform`
  param): a provider's `recommended` flag is a host-baked constant (e.g.
  `detached.recommended = process.platform === 'win32'`), so recommending for
  anything but the host it was actually evaluated on would be misleading.
  Registration order breaks ties, matching `resolveProvider`.

## `detachedProvider.ts` — the universal fallback

Spawns a plain OS-detached child process (no terminal multiplexer). This is
the fallback provider: always available, including on Windows where tmux
doesn't exist. `sessionState()`'s note: a detached process has no separate
"crashed but kept around" state the way a tmux pane with `remain-on-exit` can,
so `dead` is always `false` — `present`/`pid` alone are enough to describe it.
`resolvePid` (wired by `providerRegistry.ts`'s `primeProviders()`) resolves a
session name to its persisted pid when the in-memory map has no entry, e.g.
after a backend restart, by reading the on-disk process registry.

## `initServiceProvider.ts` / `windowsServiceProvider.ts` — not-yet-implemented placeholders

Both register so they show up — disabled, with a reason — in the provider
picker (systemd/launchd style init-managed services on Linux/macOS; Windows
Services via `sc.exe`), but running apps as an actual managed service isn't
implemented yet. Every mutating method throws `"${notImplementedLabel}: not
implemented"`; every read-only method reports "nothing here" so callers that
poll status don't need special-casing for an unimplemented provider. Both
share `makePlaceholderProvider()` (from `initServiceProvider.ts`) and differ
only in their static metadata and `availability()` — the Windows one also
reports `unsupportedPlatform` on non-Windows hosts, which is entirely
`availability`'s concern.

## `tmuxCli.ts` — binary/socket resolution and availability caching

- `findTmux()`: the GUI app's PATH (launchd) doesn't include Homebrew, so it
  falls back through well-known install locations after checking an explicit
  config override (`global.tmuxBin`) and the `TMUX_BIN` env var.
- `getSocketPath()`: GUI apps (launchd) and a Terminal shell have different
  `$TMPDIR` values, so tmux's default per-`$TMPDIR` socket path would split
  the GUI and terminal onto two different tmux servers. A fixed absolute
  socket path keeps both sides talking to the same server; an explicit
  override from config (`global.socketPath`) is still honored.
- `availability()` is on the hot path (`resolveProvider()` runs on every
  status poll), so the **full result including the reason string** is cached
  per resolved binary path to avoid forking `tmux -V` on every call. The
  cache is invalidated automatically if the resolved binary path changes
  (e.g. `global.tmuxBin` patched at runtime) or on demand via
  `{ bypassCache: true }`. As a side effect, the probe also stores the parsed
  version string, so `scan.ts`'s `detectComponents()` can read a cached tmux
  version without a second fork — but only if `availability()` was called
  first (every real code path already does this before reaching the version
  getter).

## `tmuxProvider.ts` / `tmuxSession.ts` — one shared parent session, one window per app

Every app is spawned as a named *window* inside a single shared parent tmux
session (`getParentSession()`, default `"mfe"`, overridable via
`global.sessionPrefix`) so each app owns a real TTY a user can attach to live
from a terminal. This module owns every tmux-specific detail (binary
resolution, pinned socket, window naming, spawn/teardown, liveness parsing)
so the rest of the codebase never shells out to tmux directly.

- `snapshot()` does one `tmux list-windows` fork for the whole parent
  session, keyed by window name — the value handed back through
  `SessionSnapshot` so `sessionState`/`sessionAlive` answer a whole N-app
  sweep from a single fork. `windowInfoFrom(snap)` resolves either the
  caller-supplied hoisted snapshot or, if absent, a fresh `getWindowInfo()`
  call — so a standalone (non-hoisted) call behaves identically to before
  hoisting existed.
- `sessionState()` (richer than `sessionAlive()`): `present` = the window
  exists at all (even a crashed pane kept around by `remain-on-exit`); `dead`
  = the pane's process has exited; `pid` = the pane's current shell pid. This
  lets `getAppStatus` report a crashed-but-present window as `unhealthy`
  instead of either "running" (what a plain `sessionAlive()` true would
  imply) or "stopped".
- `getWindowInfo()` (`tmuxSession.ts`) parses `tmux list-windows` for the
  parent session into a `windowName -> {dead, pid}` map, returning an empty
  map if the parent session doesn't exist yet (or tmux is unreachable) —
  callers treat that uniformly as "no windows".
- Window names may contain spaces: `list-windows` output must be rejoined
  except the last two whitespace-delimited tokens (dead flag, pid), since
  those two are always the trailing fields.
- `spawnInWindow()` kills any stale window of the same name first, then
  creates the parent session on first use (`createTmuxWindow()` — shared
  between the "create parent session" and "add window to existing session"
  branches, differing only in the tmux subcommand and its flags). It
  normalizes a raw `execFileSync` failure (e.g. ENOENT when the tmux binary
  is missing) into a clear, identifiable `Error` so callers get a handled
  failure instead of an opaque child_process error.
- After spawning, `remain-on-exit` is set `on` for the window so a crash or
  early exit stays visible in any attached terminal instead of the window
  quietly closing — this is what makes `sessionState()`'s "present but dead"
  case observable at all.
- `getAttachCommand({ controlMode: true })` reproduces the exact command the
  pre-refactor Tauri `open_in_terminal` handed iTerm for native control-mode
  integration (macOS only): `tmux_path -S sock -CC attach -t mfe`. It uses
  the *resolved* tmux binary path (not the bare `"tmux"` the plain,
  paste-able command uses) for the same launchd-PATH-lacks-Homebrew reason
  `findTmux()` exists. It attaches to the whole parent session, not a
  specific window — window selection is a separate, best-effort
  `select-window` call made once iTerm's control-mode client has connected
  (racy to chain into the attach command itself), which is caller-side wiring
  outside this command string.

## `lifecycleOps.ts` — start serialization and failing loudly

`startApp` is serialized per app via `withStartLock`: concurrent starts for
the same app run one after another, so the second observes the first's
`running` state and returns early rather than double-spawning (which would
orphan the first process and leak its port). Different apps run in parallel
(distinct per-app lock keys), and dependency recursion (`app.dependsOn` →
recursive `startApp`) is deadlock-free because each dependency locks under
its own distinct key rather than reusing the parent's.

When `stopApp` needs to reclaim a port, it prefers the port **discovered from
the process's own tree** over the registry/config port — that discovered port
provably belongs to this app, so killing whatever still holds it also covers
detached rspack children that spawned their own child processes on a
different port than the one recorded.

## `providerRegistry.ts` — pid resolution after a restart

`resolvePid` (wired into `configureDetached`) lets the detached provider
resolve a pid for a session it has no in-memory record for — most commonly
right after a backend restart — by reading the on-disk process registry
instead of under-reporting a live session as not running.
