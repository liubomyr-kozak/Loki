---
type: concept
title: Backend apps domain
timestamp: "2026-07-24T00:00:00Z"
---

# Backend apps domain

`backend/apps/` is the module that turns a configured `AppConfig` entry into
a running (or reported-on) process: resolving which environment/selection is
"effective" for an app, starting/stopping it through a pluggable session
provider, computing its live `AppStatus`, and enumerating/attaching to
sessions. It sits between `backend/config/*` (what the user configured) and
`backend/process/*` / `backend/ports/*` (the on-disk registry and port
probing) — everything in this domain reads `Config`/`AppConfig` and produces
either a side effect (spawn/kill a process) or a read-only view (`AppStatus`,
`SessionInfo`, `TemplateContext`).

The domain has two internal layers:

- **Orchestration** (`backend/apps/*.ts`) — effective-config resolution,
  lifecycle (start/stop/restart), status computation, session listing/attach,
  template context, and the session-provider registry/interface.
- **Providers** (`backend/apps/providers/*.ts`) — concrete `SessionProvider`
  implementations (tmux, detached-process, and two not-yet-implemented
  placeholders for init-service/Windows-service), each self-registering into
  the registry defined in `sessionProvider.ts`.

`backend/apps/__checks__/` holds a standalone (non-test-runner) sanity script
for `resolveEffective`.

See also: [Session providers & effective config](../entities/session-providers-effective-config.md),
[Provider/session lifecycle](../entities/provider-session-lifecycle.md), and
[Backend module boundary contracts](../entities/backend-module-boundary-contracts.md)
for the cross-cutting rules this domain must honor.

## `backend/apps/appManager.ts` — the domain's public barrel

Pure re-export barrel: no logic of its own. Re-exports `primeProviders`
(from `providerRegistry.ts`), `resolveEffective` (from `effectiveConfig.ts`),
`getAppStatus`/`makeStatusContext`/`StatusContext` (from `statusService.ts`),
`startApp`/`stopApp`/`restartApp` (from `lifecycleOps.ts`),
`getAttachCommand`/`listSessions`/`runShellCommand`/`runProcessInTmux`/
`SessionInfo` (from `sessionOps.ts`), and `resolveEffectiveForApp` (from
`templateContext.ts`). On import, it also calls
`registerAppOps({ getAppStatus, makeStatusContext, startApp, stopApp, restartApp, runProcessInTmux })`
against `backend/core/appOps.ts` — this is how the rest of the backend
(routes, plugins) reaches app lifecycle/status behavior without importing
`backend/apps/*` directly, keeping `core/appOps.ts` as the declared
indirection point (see
[Backend module boundary contracts](../entities/backend-module-boundary-contracts.md)).
**Consumers**: `backend/core/appOps.ts` (registration target), `backend/index.ts`,
`backend/routes/apps.ts`, `backend/routes/config.ts`, `backend/routes/git.ts`,
`backend/routes/plugins.ts` (via the barrel's re-exports), and
`backend/apps/__checks__/resolveEffective.check.ts` (imports `resolveEffective`
straight from this barrel).

## `backend/apps/effectiveConfig.ts` — environment/selection resolution

- `getSelectionsPath(config)`: derives the sidecar `selections.json` path
  from `config.global.stateFile`'s directory, falling back to
  `state/selections.json` if no `stateFile` is configured. Shared by
  every module in this domain that needs to read/write the per-app
  environment selection.
- `resolveEffective(app, selection)`: the **single precedence formula** for
  turning an `AppConfig` + optional `AppSelection` into a concrete
  `{ environmentKey, startCommand, port, repoPath, repoUrl, appUrl }`. Order:
  if the selection names a valid, existing environment key on the app, use
  it; otherwise fall back to the first filter-matched script name (if any).
  For each field, an environment-level value wins over the app-level value
  (`env?.startCommand ?? app.startCommand`, same pattern for `repoPath`/
  `repoUrl`/`appUrl`); `port` has **no** app-level fallback — it only ever
  comes from the environment. All fields are optional in the return type
  because a real config may have neither an environment nor an app-level
  value (see the read-path leniency documented in
  [Config read/write contract](../entities/config-read-write-contract.md)).
- **Invariant**: this is the one place the environment-vs-app precedence is
  computed; `statusService.ts`, `lifecycleOps.ts`, and `templateContext.ts`
  all call into it rather than re-deriving the fallback chain, and the
  frontend's `store/selectors.ts#effectiveRepoPath` deliberately mirrors this
  same order by hand (documented as an intentional duplication in the config
  contract page).
- **Consumers**: `lifecycleOps.ts`, `statusService.ts`, `templateContext.ts`,
  re-exported via `appManager.ts`, and directly exercised by
  `__checks__/resolveEffective.check.ts`.

## `backend/apps/lifecycleOps.ts` — start/stop/restart

- `startApp(config, appName, sel?, force?)`: public entry point, wraps
  `startAppLocked` in a **per-app mutex** (`withStartLock`, a
  `Map<appName, Promise>` queue) so two concurrent starts for the *same* app
  can't both observe `stopped`, both spawn, and race `updateProcessState`
  into orphaning the first process/leaking its port. Different apps still
  start in parallel; the map entry is pruned once its lane drains.
- `startAppLocked`: merges any explicit `sel.environment` onto the persisted
  selection (persisting it back via `writeSelection` if the caller passed
  one), resolves effective config via `resolveEffective`, recursively starts
  every `app.dependsOn` entry first, no-ops if the app is already `running`
  (unless `force`), runs the `onStart` plugin lifecycle hook (via
  `runPluginLifecycle`, warn-and-continue on failure — a failing plugin hook
  must not block the app from starting), then hard-fails with a descriptive
  error if `eff.startCommand` or `eff.repoPath` is missing (this is the one
  point where those `resolveEffective` fields, optional everywhere else,
  become required). It then `primeProviders(config)`, resolves the active
  `SessionProvider`, spawns via `provider.start(startArgs)`, polls
  `discoverPort(pid)` for up to `PORT_DISCOVERY_TIMEOUT_MS` (30s, every
  `PORT_DISCOVERY_POLL_MS` = 1s) to find the app's real bound port, and
  writes the resulting `{ pid, port, startedAt, environment, session }` to
  the process registry via `updateProcessState`. If a port was discovered it
  also calls `provider.setSessionLabel?.()` to rename the session/window.
- `stopApp(config, appName, force?)`: reads the registry entry, tries to
  discover the current port (best-effort), calls `resolveProvider(config).stop(appName)`
  (swallowing errors — a session-provider-level stop failure must not block
  the process-kill fallback), sends `SIGTERM` to the **process group**
  (`-entry.pid`) on non-Windows (falling back to a plain `process.kill` if
  the group kill fails), clears the registry entry, waits
  `SIGTERM_GRACE_MS` (500ms), then falls back to killing whatever is bound
  to the discovered/registered port (`killProcessOnPort`) — gated by `force`
  or a pid match so it doesn't kill an unrelated process that happens to
  have grabbed the same port. Finally runs the `onStop` plugin hook
  (warn-and-continue).
- `restartApp`: `await stopApp(); await startApp();` — no special-casing.
- **Consumers**: re-exported via `appManager.ts` → `core/appOps.ts` →
  routes (`routes/apps.ts` start/stop/restart endpoints, group-start flows).

## `backend/apps/providerRegistry.ts` — provider configuration priming

`primeProviders(config?)` is the **one function** that pushes the current
`Config`'s provider-relevant settings (`tmuxBin`, `socketPath`,
`sessionPrefix` for tmux; resolved `sessionsDir` + a `resolvePid` callback for
the detached provider) into each provider module's own module-level
`configure()` function. It must be called before `resolveProvider`/any
provider method is used with fresh config, since providers hold their
configured state in module-level variables, not per-call parameters.
`resolveSessionsDir` (from `backend/config/scan.ts`) is reused here so the
detached provider's actual log-write location always matches what the
Settings UI displays. `currentConfigFilePath()` falls back to
`process.env.CONFIG_FILE || 'orchestrator.json'` for the log-dir resolution
base. **Consumers**: called at the top of nearly every operation in
`lifecycleOps.ts`, `sessionOps.ts`, and `statusService.ts` (each guards
against redundant re-priming via `StatusContext.primed`), plus
`routes/config.ts`'s provider-list/detect endpoints.

## `backend/apps/sessionOps.ts` — attach/list/run-command

- `getAttachCommand(appName, config?, opts?)`: primes providers, resolves
  the active provider, and returns its `getAttachCommand` result (empty
  string if the provider returns `null`, e.g. the detached provider has no
  attach concept).
- `SessionInfo` interface: `{ appName, label, window, target, dead, port? }`
  — the cross-provider shape used to list live sessions regardless of which
  provider produced them.
- `listSessions(config)`: builds a reverse map from tmux-safe window name →
  `{ appName, label }` for every configured app, then maps each
  `provider.listSessions()` entry onto that (falling back to treating the
  raw session name as the app name if no window-name match is found), and
  attaches the registry's tracked `port`. Returns `[]` on any error (this is
  a read-only status-adjacent call; callers shouldn't crash a status
  render over a transient provider error).
- `runShellCommand(config, windowLabel, command, cwd?)`: resolves the
  shell (`config.global.defaultShell` or the platform default) and calls the
  active provider's optional `runCommand`, throwing if the provider doesn't
  implement it (the detached and tmux providers do; the placeholder
  providers don't).
- `runProcessInTmux(config, command, cwd?, window?)`: thin wrapper generating
  a unique-ish window label (`run_<timestamp>_<random>`) when none is given,
  then delegating to `runShellCommand`. Despite the name, it goes through
  whatever provider is active, not necessarily tmux — the name is legacy
  from before the provider abstraction existed.
- **Consumers**: `runProcessInTmux` is re-exported through `appManager.ts`
  into `core/appOps.ts` for plugin-triggered shell commands; `listSessions`/
  `getAttachCommand` back the Sessions UI via `routes/apps.ts`.

## `backend/apps/sessionProvider.ts` — the `SessionProvider` contract & registry

Defines the full session-provider interface and the module-level provider
registry that every concrete provider self-registers into.

- **Required** members: `id`, `label`, `description`, `icon`, `platforms`,
  `recommended`, `benefits`, `availability()`, `start()`, `stop()`,
  `listSessions()`, `sessionAlive()`, `getAttachCommand()`.
- **Optional** members: `advancedDescription`, `settings`, `snapshot()`,
  `sessionState()`, `setSessionLabel()`, `runCommand()` — a provider that
  can't support one (e.g. attach for the detached provider, `runCommand` for
  the not-yet-implemented placeholders) simply omits it; callers must
  guard with `?.`.
- `registerProvider(p)`: idempotent by `id` — registering the same id twice
  is a silent no-op, so a provider module can be imported more than once
  (e.g. via both a direct import and a barrel re-export) without
  duplicating registry entries.
- `resolveProvider(config?)`: prefers `config.global.sessionProvider` if set
  **and** that provider reports itself available; otherwise falls back to
  the first registered provider whose `availability().available` is true;
  throws if none are available (this only happens if no provider module was
  ever imported — a startup wiring bug, not a runtime condition).
- `computeRecommendedId()`: picks the first provider matching the current
  `process.platform`, marked `recommended`, and currently available; falls
  back to the first available provider of any kind.
- `listProviderMeta(config?)`: builds the `ProviderMetaEntry[]` consumed by
  the Settings UI's provider picker, including each provider's
  `availability()` result/reason and its `settings` field descriptors, plus
  the currently active id and the platform-recommended id.
- **Consumers**: every module in this domain (`lifecycleOps.ts`,
  `sessionOps.ts`, `statusService.ts`) calls `resolveProvider`;
  `routes/config.ts` calls `listProviderMeta`/`computeRecommendedId` for the
  provider-settings API; all four `providers/*.ts` modules call
  `registerProvider` on import.

## `backend/apps/statusService.ts` — live `AppStatus` computation

- `makeStatusContext(config)`: builds a `StatusContext` (`{ selections,
  sessionSnapshot, primed: true }`) once per status-poll batch — primes
  providers, reads selections, and takes one `provider.snapshot?.()` — so
  that computing status for N apps in one poll doesn't re-prime providers or
  re-read the selections file N times. `getAppStatus` accepts this context
  optionally and only does the expensive per-call work itself when no
  context is supplied.
- `getAppStatus(config, appName, registry, ctx?)`: the central per-app
  status computation. Resolves the effective port via `resolveEffective`
  (persisted-selection environment, or the registry's recorded environment
  as fallback), asks the provider for `sessionState`/`sessionAlive` (using
  the shared snapshot from `ctx` when present), checks whether the port is
  open (`isPortOpen`) and whether the registry's tracked pid is still alive
  (`process.kill(pid, 0)`), and combines these into one of `'running'` /
  `'unhealthy'` / `'port-conflict'` / `'stopped'` / `'unknown'`:
  - a **PID-reuse guard**: if the session reports "present" but its live pid
    differs from the registry's tracked pid, the registry entry is treated
    as stale (`pidAlive = false`) — this catches the OS having recycled the
    pid onto an unrelated process.
  - `present && dead` (tmux window exists but its pane died) →
    `'unhealthy'`.
  - `(present && !dead) || pidAlive` → `'running'`.
  - a port that's open with a registry entry present, but no
    session/pid-alive signal → `'port-conflict'` (something else — or a
    zombie — is squatting on the app's port).
  - otherwise `'stopped'`.
  - Also attaches git info (`branch`, `commit`, `dirty`,
    `hasStashForBranch`) when `effForPort.repoPath` resolves, swallowing any
    git-read error silently (status must degrade gracefully, not throw, when
    a repo path is missing/invalid) — see the staleness caveat for
    `hasStashForBranch` in
    [Config read/write contract](../entities/config-read-write-contract.md).
  - Finally re-resolves `resolveEffective` against the **persisted**
    selection (not the registry-derived one used for the port fallback) to
    populate `selectedEnvironment`/`repoUrl`/`appUrl` on the returned status.
- **Consumers**: re-exported via `appManager.ts` → `core/appOps.ts`; used by
  `lifecycleOps.ts#startAppLocked` (to check for an already-running app) and
  by the status-polling routes.

## `backend/apps/templateContext.ts` — plugin/template variable resolution

`resolveEffectiveForApp(config, appName)` builds a `TemplateContext`
(`{ name, port, environment, branch, appUrl, repoPath }`) for a single app —
port from the registry if tracked, else the resolved effective port; branch
from a best-effort `getGitInfo(eff.repoPath)` call (swallowed on error, same
pattern as `statusService.ts`). This is a narrower, template/placeholder-
oriented sibling of `getAppStatus`: it doesn't touch session-provider state
or process liveness at all, only config resolution + registry + git. Used
to fill in `{{port}}`/`{{branch}}`/etc.-style placeholders for plugin
commands and other templated strings, not for computing UI-facing run
status.

## `backend/apps/__checks__/resolveEffective.check.ts` — standalone sanity check

Not a Jest/Vitest test — a plain script (`assert` + `console.log`, run
directly under Node/ts-node) asserting that `resolveEffective` (imported
from the `appManager` barrel) tolerates an `AppConfig` whose `environments`
is `undefined`: it must fall back to the app-level `startCommand`/`repoPath`
and report `environmentKey: undefined`, without throwing. This guards the
specific "app has no `environments` map at all" shape that real hand-edited
configs can produce (see the read-path leniency rationale in
[Config read/write contract](../entities/config-read-write-contract.md)).

## `backend/apps/providers/detachedProvider.ts` — plain background-process provider

Registers the `'detached'` `SessionProvider`: runs each app as a detached
child process (`spawn(shell, ['-c', command], { detached: true, ... })`, or
`ComSpec /c` on Windows), with stdout/stderr appended to a per-app log file
under a configured `sessionsDir` (falls back to `os.tmpdir()` if unconfigured).

- `configure({ sessionsDir?, resolvePid? })`: module-level configuration hook
  called by `providerRegistry.ts#primeProviders`.
- `sanitizeName(name)`: filesystem-safe log-filename sanitizer — broader
  than tmux's `windowName()` (also neutralizes `/`, `\`, and `..`) because
  this value is interpolated into a real path, not just a tmux window name.
- `spawnDetached(...)`: shared spawn helper behind both `start()` (app
  lifecycle — throws if no pid was yielded) and `runCommand()`
  (fire-and-forget generic command execution — tolerates a null pid, marked
  "N1" in-code). Attaches a `child.on('error', ...)` handler before
  returning, because an async spawn failure (e.g. missing shell binary)
  surfaces as an unhandled `'error'` event that would otherwise crash the
  whole Node process.
- **Known, documented gap**: on Windows, `command` is interpolated into a
  raw quoted string with no escaping of embedded `"` characters — a command
  containing a double quote can break out of the quoting. Left as
  pre-existing behavior; callers must not pass untrusted input through
  `command`.
- Tracks pids in an in-memory `Map<name, pid>`, falling back to the
  `resolvePid` callback (reads the process registry) when a name isn't in
  memory — covers the case where the orchestrator process restarted and
  lost its in-memory map but the app is still running.
- `getAttachCommand()` always returns `null` — this provider has no
  interactive-attach concept.
- **Recommended** on `win32` only (`recommended: process.platform === 'win32'`).
  Exposes one advanced setting: `sessionsDir`.

## `backend/apps/providers/initServiceProvider.ts` — placeholder + shared factory

Defines `makePlaceholderProvider(meta, availability)`, a factory used by
**both** not-yet-implemented providers (`initServiceProvider` and
`windowsServiceProvider`) to build a `SessionProvider` whose `start`/`stop`/
`runCommand` all throw `` `${notImplementedLabel}: not implemented` ``, whose
`listSessions()` returns `[]`, whose `sessionAlive()` returns `false`, and
whose `getAttachCommand()` returns `null`. `initServiceProvider` itself
registers as `id: 'init-service'` (systemd/launchd), scoped to
`platforms: ['darwin', 'linux']`, always unavailable
(`'Not yet implemented — coming in a future release.'`).

## `backend/apps/providers/tmuxCli.ts` — low-level tmux binary/socket plumbing

- Module-level `configure({ tmuxBin?, socketPath?, sessionPrefix? })`,
  mirroring the detached provider's configuration hook.
- `findTmux()`: candidate search order — explicit configured `tmuxBin`, then
  `process.env.TMUX_BIN`, then a fixed fallback list
  (`/opt/homebrew/bin/tmux`, `/usr/local/bin/tmux`, `/usr/bin/tmux`),
  falling back to the bare `'tmux'` command name (relies on `$PATH`) if none
  of those exist on disk.
- `getSocketPath()`: configured socket path, or a per-user default
  (`/tmp/mfe-tmux-<uid>.sock`) so concurrent users on a shared host don't
  collide on the same tmux socket.
- `getParentSession()`: configured `sessionPrefix`, or the default parent
  session name `'mfe'` — every app's window lives inside this one shared
  tmux session.
- `tmux(args, opts)`: `execFileSync` wrapper always passing `-S <socketPath>`
  first; `opts.ignore` suppresses stdout capture for fire-and-forget calls.
- `windowName(appName)`: tmux forbids `.`/`:` and whitespace in window
  names, so those are replaced with `_` — this is the tmux-specific sibling
  of `detachedProvider.sanitizeName`, intentionally narrower (doesn't touch
  `/`/`\`, since window names aren't filesystem paths).
- `getWindowTarget(name)`: `${parentSession}:${windowName(name)}` —
  the canonical tmux target string used throughout the tmux provider.
- `availability(opts?)`: hard-`false` (with `unsupportedPlatform: true`) on
  `win32`; otherwise probes `tmux -V` via `execFileSync` and **caches** the
  result keyed by the resolved binary path (`availabilityCache`), bypassed
  only when `opts.bypassCache` is set (used by the explicit "Detect again"
  UI action documented in
  [Config read/write contract](../entities/config-read-write-contract.md)).
- `getCachedTmuxVersion()`: exposes the version string captured incidentally
  during the last `probeTmux` call, for display purposes.
- **Consumers**: `tmuxProvider.ts` and `tmuxSession.ts` both build on this
  module; `providerRegistry.ts` calls `configure`; `statusService.ts`
  indirectly reuses the cached `availability()` result via
  `detectComponents()` (see the config contract page's note on
  `resolveSessionsDir`/tmux-check cache reuse).

## `backend/apps/providers/tmuxProvider.ts` — the `tmux` `SessionProvider`

Registers the `'tmux'` provider (`recommended: true` on `darwin`/`linux`).
Each app runs as a **named window** inside one shared parent tmux session
(`getParentSession()`), not its own session — this is what gives tmux
sessions the "shared terminal, live attach from any terminal" benefit
advertised in its `benefits` list.

- `start()`: delegates window creation to `tmuxSession.spawnInWindow`, sets
  the pane title (`name :port` or just `name`), then queries
  `list-panes -F '#{pane_pid}'` to recover the real pane pid (falls back to
  `-1` if unparseable).
- `stop()`: kills the app's window; if that was the **last** window in the
  parent session, also kills the whole parent session (so an empty `mfe`
  session doesn't linger). Every tmux call here is wrapped
  try/ignore-and-`console.debug`, since a missing window/session on stop is
  an expected, not exceptional, outcome.
- `listSessions()`/`snapshot()`/`sessionAlive()`/`sessionState()`: all
  layer on top of `tmuxSession.getWindowInfo()`, either calling it fresh or
  reusing a passed-in `SessionSnapshot` (the `Map` it returns) — this is the
  mechanism `statusService.makeStatusContext` uses to avoid re-shelling out
  to tmux once per app in a status-poll batch.
- `getAttachCommand(name, opts)`: two shapes — a **control-mode** attach
  (`tmux ... -CC attach -t <parentSession>`, for programmatic/embedded
  terminal use) when `opts.controlMode` is set, or a plain attach with a
  trailing `select-window` to jump straight to the app's window otherwise.
- **Settings** exposed to the UI: `tmuxBin`, `sessionPrefix` (labelled
  "Session name" — copyable), `socketPath`, plus two settings that are
  **stored preferences without runtime wiring yet**: `attachBehavior`
  (`auto`/`manual`) and `restartStaleSessions` (explicitly commented
  `"stored preference; runtime wiring TBD"` in the settings descriptor
  itself) — these are validated/persisted as base `GlobalConfigSchema`
  fields (per the config contract page) but don't yet change any runtime
  behavior in this file.

## `backend/apps/providers/tmuxSession.ts` — window-level tmux operations

- `getWindowInfo()`: runs
  `list-windows -F '#{window_name} #{pane_dead} #{pane_pid}'` and parses
  each line into a `Map<windowName, { dead, pid }>`; rejoins all tokens
  except the last two as the window name (since a window name may itself
  contain spaces). Swallows tmux errors (e.g. no parent session yet) and
  returns an empty map rather than throwing.
- `setPaneTitle(name, title)`: `select-pane -T <title>`, ignore-on-error.
- `spawnInWindow(label, cwd, shell, command)`: kills any stale window with
  the same name first (idempotent restart), checks whether the parent
  session already exists (`has-session`), and either creates it fresh
  (`new-session -d ... shell -c command`) or adds a window to the existing
  one (`new-window ...`); either way follows up with
  `set-option remain-on-exit on` so a dead pane stays visible/inspectable
  instead of the window disappearing the moment the command exits — this is
  what lets `sessionState()` distinguish `dead` (pane exited, window still
  there) from the window simply not existing.
- **Consumers**: exclusively `tmuxProvider.ts`.

## `backend/apps/providers/windowsServiceProvider.ts` — Windows-only placeholder

Registers `id: 'windows-service'` via the same `makePlaceholderProvider`
factory as `initServiceProvider.ts`, scoped to `platforms: ['win32']`,
always unavailable outside Windows
(`unsupportedPlatform: process.platform !== 'win32'`) and, even on Windows,
unconditionally unavailable today (`'Windows Services require Windows.'`
combined with the factory's blanket not-implemented behavior) — described
in its `benefits` as future work managed via `sc.exe`.
