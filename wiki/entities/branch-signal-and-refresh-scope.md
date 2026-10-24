---
type: entity
title: Branch signal & refresh scope
description: Which Redux state is the live git-branch signal (apps.apps[].branch, poll-backed) vs the picker-only branchesByApp; what refreshAll refreshes; where env scan candidates live.
timestamp: "2026-07-24T00:00:00Z"
---

# Branch signal & refresh scope

Which Redux state actually tracks an app's current git branch live, what
`refreshAll` does (and does not) refresh, and where the Environments scan
results live. Getting any of these wrong produces UI that silently fails to
react to branch changes.

## The live branch signal: `apps.apps[name].branch`

`AppStatus.branch` (`backend/runtime.types.ts:30`) is recomputed on **every**
status computation: `backend/apps/statusService.ts:90` sets it from
`getGitInfo()`, which runs a fresh `git rev-parse --abbrev-ref HEAD`
(`backend/git/gitUtils.ts:29`) — no caching.

On the frontend, `apps.apps[name]` is refreshed by `fetchApps` via
`refreshAll`, dispatched on mount, on **every poll tick**, and on **window
focus** (`app/src/hooks/usePolling.ts:18-28`), and additionally on
`switchBranch` completion (`app/src/store/slices/gitSlice.ts:31`).

⇒ **`s.apps.apps[name].branch` is the correct signal to subscribe to for any
branch-dependent UI that must auto-refresh** — it fires for picker-driven
switches *and* for external branch changes (a checkout done in a terminal is
picked up on the next poll tick or window focus).

`useAppRow`'s `liveBranch` reads `st?.branch ?? branchInfo?.current ?? ''`
(`app/src/components/AppList/useAppRow.ts:56`) — the live poll-backed
signal is checked **first**, `branchesByApp[name].current` is only a
fallback for the window before the first status poll lands. This was
previously inverted (`branchInfo?.current ?? st?.branch`), which meant the
picker-only cache — populated once on picker-open and only re-synced by this
same row's own `switchBranch` — permanently shadowed the live signal: a
second row sharing the same `repoPath`, or a checkout done outside the app,
never showed up until that row's own picker happened to reopen. `fetchApps`
also gained a seq-guard (`app/src/store/slices/appsSlice.ts`,
`fetchAppsSeq`/`appliedFetchAppsSeq`/`pendingFetchAppsSeq`): each dispatch is
tagged with a sequence number keyed by `requestId`, and `fetchApps.fulfilled`
drops any response older than the last one actually applied — closing a race
where overlapping `refreshAll` calls (polling, focus, switchBranch, start/
stop, groupOps) could let a late, stale response overwrite a fresher `apps`
snapshot.

## The narrow signal: `git.branchesByApp[name].current` — picker-only

`git.branchesByApp[name]` is populated **only** by `fetchBranches`, which is
dispatched **only when the branch dropdown is opened**
(`app/src/components/AppList/AppRow.tsx:82`). It is updated on
`switchBranch.fulfilled` (`app/src/store/slices/gitSlice.ts:85`) but
**never by polling** — `refreshAll`/`usePolling` never touch it.

⇒ `s.git.branchesByApp[name].current` silently misses every branch change
that doesn't go through the picker. Do **not** use it as a general
auto-refresh trigger; it exists to serve the open picker's option list.

## Grouped rows: intent shadows the live signal in the picker

Inside a group section the branch picker no longer displays the live signal
directly: `useAppRow`'s `branchValue` is
`intentBranch ?? (apps.apps[name].branch ?? branchesByApp[name].current)`
when `groupId !== undefined`, and picking a branch there writes intent only
without checking out
(`app/src/components/AppList/useAppRow.ts:55-57,138-145`). The live
signal above is still the right thing to subscribe to for *reality* — it is
what drift detection compares intent against — but it is not what a grouped
row's picker shows. See
[Per-(group, app) branch & environment intent](group-app-intent-contract.md).

## Checkout-in-flight busy state: `git.checkoutPending`

`switchBranch` lives outside `appsSlice`'s `appOps` matcher list, so it never
touches `state.apps.busy` — without a separate signal, a row's Start/branch
controls stayed clickable for the seconds a checkout takes, letting a start
race in on the branch that's mid-swap. `gitSlice`'s `checkoutPending[appName]`
closes that gap: set on `switchBranch.pending`, cleared on both
`fulfilled`/`rejected`. `useAppRow`'s `isBusy` is
`!!s.apps.busy[name] || !!s.git.checkoutPending[name]`
(`app/src/components/AppList/useAppRow.ts:26`) — a row counts as busy for
either reason, so the row-level busy signal can no longer be read as "just
`apps.busy`".

## `refreshAll` scope: apps + sessions, NOT config

`refreshAll` (`app/src/store/slices/appsSlice.ts:71-73`) dispatches only
`fetchApps` + `fetchSessions`. It does **not** dispatch
`fetchConfig`/`reloadConfig` — so a branch switch (which awaits
`refreshAll`, `gitSlice.ts:31`) never re-reads config. `fetchConfig` runs
once at mount (`usePolling.ts`, and see the custom-groups persist exception
in [Config read/write contract](config-read-write-contract.md)). Any feature
that needs fresh config after a branch change must fetch it explicitly.

`fetchGroupSelections` is in the same one-shot category: it is dispatched
once at mount (`usePolling.ts:22`) and is **not** part of `refreshAll`, the
poll interval, or the focus handler — the group-intent slice stays current by
folding its own mutation results into state instead.

## Environments candidates are local component state, not Redux

The Environments scan results — `candidates` and `picked` — live in **local
`useState` inside `useAppConfigDetail`**
(`app/src/components/Dashboard/useAppConfigDetail.ts:23-24`), not in any
Redux slice. No thunk (git or otherwise) can see or refresh them; only
`refreshPreview` (`useAppConfigDetail.ts`, wired to the manual Refresh
button) populates them.

⇒ A branch-driven refresh of the environments list must re-invoke
`refreshPreview` from the component layer (e.g. an effect watching
`apps.apps[name].branch`); relying on Redux config reload does nothing —
twice over, since `refreshAll` skips config anyway (above).

# Citations

[1] `backend/runtime.types.ts:30`, `backend/apps/statusService.ts:90`, `backend/git/gitUtils.ts:29`
[2] `app/src/hooks/usePolling.ts:18-28`
[3] `app/src/store/slices/appsSlice.ts:71-73`, `app/src/store/slices/gitSlice.ts:31,85`
[4] `app/src/components/AppList/AppRow.tsx:82`
[5] `app/src/components/Dashboard/useAppConfigDetail.ts:23-24,52`
