---
type: concept
title: Backend infra — git, process, ports
timestamp: "2026-08-01T00:00:00Z"
---

# Backend infra — git, process, ports

Zone BZ5 covers the low-level infra the app layer builds on: `backend/git/*`
(branch/stash git plumbing and the composite checkout/stash-apply/stash-drop
flows built on top of it), `backend/process/*` (two small JSON sidecar
stores — the process-state registry and the per-app environment
selections), and `backend/ports/*` (port-liveness/PID discovery shell-outs
used to detect and kill running app processes). None of these files talk to
each other's domains; they're grouped here only by "infra the rest of the
backend calls," not by a shared abstraction.

## `backend/git/gitUtils.ts` — low-level git subprocess wrapper

Responsibility: the only file that spawns a real `git` process. Everything
above it (`gitFlowService.ts`) is composition; this file is where
`execFile('git', ['-C', repoPath, ...])` actually happens.

Key exports:
- `getGitInfo(repoPath)` — current branch (`rev-parse --abbrev-ref HEAD`),
  short commit, and `dirty` (non-empty `git status --porcelain`). Uses the
  bare `git()` helper, **not** `runGit`/`withRepoLock` — see invariant below.
- `listBranches`, `checkoutBranch`, `stashPush`, `stashApply`, `dropStash`,
  `hasUnmergedPaths` — all routed through `withRepoLock`.
- `listBranches(repoPath)` — trims and drops empty lines, **and drops any
  line starting with `(`**: in a detached-HEAD worktree `git branch` prints a
  pseudo-row like `(HEAD detached at <sha>)`, which is not a real branch and
  must never reach the picker's option list or a checkout call.
- `checkoutBranch(repoPath, branch)` — runs `git checkout <branch> --`. The
  trailing `--` separates the branch name from pathspecs, so a branch whose
  name collides with a file or directory in the worktree (a file literally
  named `develop`) can never be misread by git as a path to restore.
- `getUnmergedFiles(repoPath)` — **exported** (it used to be module-private):
  parses `git status --porcelain` for `UNMERGED_CODES` rows and returns the
  paths. `gitFlowService.ts` calls it directly so the pre-checkout 409
  conflict body can name the files that need resolving.
- `listStash(repoPath)` — parses `git stash list` lines into
  `{ ref, message }` via regex `^(stash@\{\d+\}):\s*(.*)$`.
- `resolveStashRefByTag(repoPath, tag)` — re-derives the current
  `stash@{N}` ref for a previously-recorded tag by scanning live
  `listStash()` output and matching on message substring, because
  `stash@{N}` indices shift whenever any other stash is pushed/dropped —
  a stored index/ref can silently point at the wrong entry after that.
  Callers must re-resolve at use time rather than trust a cached ref.
- `stashPush(repoPath, tag)` — pushes with `-u` (include untracked) and a
  tag embedded in `-m`, then immediately looks the entry back up in
  `listStash()` to capture its real ref. It never guesses a ref — that
  "refusing to guess" invariant still holds — but the *outcome* is now
  reported through a `saved: boolean` field rather than a synthetic error:
  the return type is `{ stashRef, saved } & GitResult`.
  - push exited non-zero → `{ ...res, stashRef: '', saved: false }` (a real
    failure, `res.code` is git's own).
  - push exited 0 **and** the tagged entry is in `listStash()` →
    `{ stashRef: found.ref, saved: true }`.
  - push exited 0 but no tagged entry exists → `{ code: 0, stashRef: '',
    saved: false }`. This is "nothing was actually stash-able" (e.g. a tree
    whose only changes are inside a submodule/nested repo), not an error;
    the old code synthesized `code: 1` here (`STASH_TAG_LOOKUP_FAILED_CODE`,
    now deleted) and aborted the whole checkout flow on it.
- `stashApply(repoPath, stashRef)` — applies, then re-checks
  `getUnmergedFiles` to report `conflict`/`files`; a conflicted apply is
  not surfaced as a `runGit` error code, it's a distinct `conflict: true`
  result the caller must branch on.
- `dropStash(repoPath, stashRef)` — comment states the confirmation gate
  is the caller's job: "caller must already have explicit user
  confirmation; this function does not gate on that itself."
- `hasUnmergedPaths(repoPath)` — true if `git status --porcelain` has any
  line whose two-letter code is in `UNMERGED_CODES` (`UU, AA, DD, AU, UA,
  UD, DU`).

Invariant — **two separate concurrency primitives, deliberately not shared**:
- `withRepoLock` (per-`repoPath` promise-chain mutex) serializes
  `listBranches`/`checkoutBranch`/`stashPush`/`stashApply`/`dropStash`/
  `hasUnmergedPaths` against each other on the same repo.
- `getGitInfo`/the internal `git()` helper are **intentionally excluded**
  from `withRepoLock` (stated in the doc comment above the lock) — a
  read-only info probe doesn't need to queue behind mutating operations.
- This is a different, narrower lock than `gitFlowService.ts`'s own
  `withGitFlowLock` (see below); the two never nest into each other.

Consumers: `backend/git/gitFlowService.ts` (all composite flows),
`backend/git/gitStashStore.ts` (`reconcileStashMap` uses `listStash`),
`backend/apps/statusService.ts`, `backend/apps/templateContext.ts`.

## `backend/git/gitStashStore.ts` — stash-record sidecar

Responsibility: persists the orchestrator's own bookkeeping of "which
stash belongs to which branch on which repo" — a JSON sidecar
(`git-stashes.json`), independent of git's own stash storage. This is
metadata *about* stashes, not the stashes themselves.

Key exports:
- `StashRecord = { stashRef, tag, createdAt }`, `StashMap = Record<repoPath,
  Record<branch, StashRecord>>`.
- `readStashMap`/`writeStashMap` — thin wrapper over
  `jsonSidecarStore<StashMap>` (from `backend/config/jsonStore.ts`),
  filename `git-stashes.json`, fallback `{}`, `coerce` guards against a
  non-object raw value.
- `writeStashRecord(config, repoPath, branch, record)` — upserts one
  `[repoPath][branch]` entry.
- `removeStashRecord(config, repoPath, branch)` — deletes one entry,
  pruning the now-empty `repoPath` sub-object if it was the last branch.
- `hasStashForBranch(config, repoPath, branch)` — pure map lookup, no git
  spawn. **Staleness caveat** (documented in
  [Config read/write contract](../entities/config-read-write-contract.md)
  and FR-14/FR-44): this can go stale if the stash was dropped outside the
  orchestrator (e.g. a manual `git stash drop` in a terminal) — callers
  must not treat it as a live git-truth check.
- `reconcileStashMap(config, repoPath)` — the freshness fix for the above:
  fetches live `listStash()`, and for every recorded branch entry whose
  `stashRef` isn't in the live ref set *and* whose `tag` isn't a substring
  of any live stash message, deletes the record. Called after every
  mutating step in `gitFlowService.ts` so the sidecar self-heals instead
  of drifting permanently.

Consumers: `backend/git/gitFlowService.ts` (primary caller of every
export), `backend/apps/statusService.ts` (reads `hasStashForBranch`-style
data for `RuntimeStatus.hasStashForBranch`). See
[git-stash-flow-contract.md](../entities/git-stash-flow-contract.md) for
the full stash lifecycle contract this store participates in.

## `backend/git/gitFlowService.ts` — composite checkout/stash flows

Responsibility: the orchestration layer that turns raw `gitUtils.ts`
primitives + `gitStashStore.ts` bookkeeping into the multi-step flows the
routes need: branch listing with stash annotation, the 2-step "stash
current work, checkout target, auto-apply target's stash" checkout flow,
and standalone stash-apply/stash-drop by ref.

Key exports:
- `readBranchesInfo(config, repoPath)` — reconciles the stash map, then
  reads `listBranches` + `getGitInfo` in parallel; returns
  `{ current, branches, dirty, stash? }`, attaching the current branch's
  stash record if one exists.
- `runCheckoutFlow(config, repoPath, branch)` — the 2-step checkout:
  1. `hasUnmergedPaths` guard first — if true, returns `409` immediately
     ("resolve in terminal first") before touching anything else. The 409
     body carries `files` (from `getUnmergedFiles`) alongside `error`, so
     the caller can name the unmerged paths instead of showing a bare
     string.
  1b. **Already-on-target short-circuit**: after `getGitInfo`, if
     `branch === currentBranch` it returns `{ ok: true, stashed: false }`
     immediately — no stash, no checkout. This makes a redundant checkout a
     true no-op so callers (notably `groupOps.applyGroupIntentAndStart`)
     can always dispatch the intent branch without first diffing against a
     possibly-stale cached branch value.
  2. If dirty, `stashPush` with a tag of the form
     `loki-orchestrator:<branch>:<ISO timestamp>`. A record is written via
     `writeStashRecord` (and `stashed: true` reported) **only when
     `pushResult.saved`** is true; a `dirty` tree that produced no stash
     entry (see `stashPush`'s `saved` contract above) proceeds straight to
     checkout with no record rather than aborting the flow.
  3. `checkoutBranch` to the target. **No auto-revert of the just-pushed
     stash on checkout failure** — stated explicitly in a comment; the
     stash is left in place for the user to resolve manually.
  4. If the target branch has its own recorded stash, re-resolves its
     ref by tag (never trusts the stored `stashRef` directly — see
     `resolveStashRefByTag`'s staleness note above) and applies it. A
     stale/unresolvable record (the physical stash was dropped outside the
     app) is pruned via `removeStashRecord` and reported as `{ ok: true,
     appliedStash: false, staleStash: true, warning: 'recorded stash for
     <branch> no longer exists in git' }` — the checkout itself succeeded,
     so this is not an error, but the warning keeps it from being a silent
     "your changes vanished". A clean
     apply removes the record; **a conflicted apply does not** — "never
     dropped here — the record is removed only on a clean apply; the
     physical stash always stays in `git stash list`" (comment, line 65-66).
  Every exit path calls `reconcileStashMap` before returning.
- `runStashApply(config, repoPath, stashRef)` / `runStashDrop(...)` — both
  first try to resolve `stashRef` against a recorded map entry (matching
  on either `stashRef` or `tag`), re-resolving by tag if found; if no
  record matches, fall back to checking whether `stashRef` is a literal
  live ref via `listStash`. Either way, an unresolvable ref returns
  `{ ok: false, error: 'stash not found (stale reference)' }` rather than
  attempting the git command blind.

Invariant — `withGitFlowLock`: a **second**, outer per-`repoPath` mutex
(distinct from `gitUtils.ts`'s `withRepoLock`) serializes these composite
flows against each other, so two requests touching the same repo can't
interleave steps (e.g. two concurrent checkouts). The doc comment (lines
5-10) states explicitly that this lock is independent from and never
nests with `gitUtils.ts`'s internal per-call lock, so there is no deadlock
risk between the two.

Consumers: `backend/routes/git.ts` (the git API routes), `backend/apps/
lifecycleOps.ts`.

## `backend/process/registry.ts` — process-state sidecar

Responsibility: persists the last-known runtime state (PID, port, status,
etc. — shape defined by `ProcessState` in `backend/types.ts`) per app name,
across server restarts, keyed by a caller-supplied `stateFile` path (not
derived from `Config` the way the git stores are).

Key exports:
- `readRegistry(stateFile)` / `writeRegistry(stateFile, registry)` — thin
  wrapper over `jsonPathStore<ProcessRegistry>(stateFile, { fallback: () =>
  ({}), label: 'registry' })` (from `backend/config/jsonStore.ts`).
- `updateProcessState(stateFile, appName, state)` — read-modify-write: if
  `state == null`, deletes the app's entry (used when an app is no longer
  running); otherwise upserts `registry[appName] = state`.

Contract: `jsonPathStore` (unlike the config-derived `jsonSidecarStore`
used by `gitStashStore.ts`) throws on a parse error rather than silently
falling back — per the "explicit-path files that throw on parse error"
half of the `jsonStore.ts` factory contract documented in
[Config read/write contract](../entities/config-read-write-contract.md).

Consumers: widely used across the app layer —
`backend/index.ts`, `backend/plugins/lifecycle.ts`,
`backend/plugins/runtime.ts`, `backend/plugins/pluginDescriptorService.ts`,
`backend/apps/sessionOps.ts`, `backend/apps/providerRegistry.ts`,
`backend/apps/lifecycleOps.ts`, `backend/apps/templateContext.ts`,
`backend/routes/plugins.ts`, `backend/routes/apps.ts`.

## `backend/process/selections.ts` — per-app environment selection sidecar

Responsibility: persists which environment (and, historically, which
"variant") the user last selected per app, keyed by an explicit file path.

Key exports:
- `readSelections(file)` — reads via `jsonPathStore<Record<string,
  AppSelection>>`, `label: 'selections'`.
- `writeSelection(file, appName, patch)` — resolves `file` to an absolute
  path first (`path.resolve`), then merges `patch` into the existing
  per-app entry (only `environment` is currently mergeable), or deletes
  the entry entirely when `patch === null`.

Invariant — legacy migration on read: the store's `coerce` function
(documented also in [Config read/write contract](../entities/config-read-write-contract.md#processselectionsts--legacy-string-migration-on-read))
converts old variant-only string values (`value: "someEnv"`, the
pre-environments format) into `{ environment: value }` on the fly, so old
selection files keep working without a one-time migration script. This
coercion is narrowly scoped to that one known legacy shape — any other
malformed entry that isn't a string or object is silently dropped from
the coerced result (not thrown), while genuinely invalid JSON at the file
level is still a hard error.

Consumers: `backend/apps/effectiveConfig.ts`, `backend/apps/
statusService.ts`, `backend/apps/templateContext.ts`, `backend/apps/
lifecycleOps.ts`, `backend/routes/apps.ts`.

## `backend/ports/portUtils.ts` — port/PID discovery and process control

Responsibility: the only file that shells out to `lsof`/`ps`/`net.Socket`/
`process.kill` for port-liveness checks, PID-to-port discovery, and
killing a process (and its descendants) by PID. No JSON persistence here —
pure OS-probing utilities.

Key exports:
- `isPortOpen(port)` — raw TCP connect probe to `127.0.0.1:port` with a
  1s timeout (`PORT_CHECK_TIMEOUT_MS`); resolves `true` only on a
  successful `connect` event, `false` on timeout or error.
- `getProcessByPort(port)` — `lsof -iTCP:<port> -sTCP:LISTEN -n -P -t` to
  get the listening PID, then `ps -p <pid> -o pid= -o command=` to get its
  command line. Returns `{ pid: null }` on any lsof failure/empty output.
- `killProcess(pid)` — `SIGTERM` first, then `SIGKILL` after a
  `KILL_GRACE_MS` (1000ms) grace period regardless of whether the process
  already exited (wrapped in try/catch so a since-exited PID doesn't
  throw).
- `killProcessOnPort(port)` — composes `getProcessByPort` +
  `killProcess`.
- `getDescendantPids(rootPid)` — BFS over the full `ps -eo pid=,ppid=`
  process table to build a `childrenOf` adjacency map, then walks it from
  `rootPid` to collect the whole descendant subtree (used so killing a
  shell/session-manager process can also account for children it spawned).
- `getListenPort(pids)` / `discoverPort(panePid)` — `getListenPort` runs a
  single `lsof -nP -iTCP -sTCP:LISTEN -a -p <comma-joined pids> -Fn` across
  a whole PID set and parses the first `n...:<port>` line found;
  `discoverPort` composes it with `getDescendantPids` to find "the port
  some descendant of this pane's PID is listening on" — used to detect a
  dev server's actual bound port when the app didn't declare one
  explicitly.

Invariant: every OS shell-out here uses `execFile` with an argument array,
**never** a string-interpolated `exec()` — the doc comment above
`getProcessByPort` states this explicitly: `port`/`pid` never pass through
a shell, so there is no command-injection surface even if a caller ever
forwarded an untrusted value.

Consumers: `backend/apps/statusService.ts` (port-open/liveness checks),
`backend/apps/lifecycleOps.ts` (kill-on-stop, descendant-port discovery
for detached processes).

## How the three zones interact

None of `git/`, `process/`, and `ports/` import from each other — they are
independent leaf utilities. The layer above (`backend/apps/lifecycleOps.ts`,
`backend/apps/statusService.ts`, `backend/apps/templateContext.ts`) is the
common consumer that stitches all three together: e.g. starting an app
touches `process/selections.ts` (which environment to run) and
`process/registry.ts` (record the resulting PID/state), while stopping/
status-checking an app touches `ports/portUtils.ts` (find/kill the
listening process) and, for repos, `git/gitFlowService.ts` +
`git/gitStashStore.ts` (branch/stash state shown in the UI).
