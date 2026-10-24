---
type: entity
title: Per-(group, app) branch & environment intent
description: The groupSelections.json sidecar keyed by (group tag, app name), its opaque-tag backend contract, the two-store resolution order, and why a group entry is intent rather than isolation.
timestamp: "2026-07-30T12:00:00Z"
---

# Per-(group, app) branch & environment intent

A group section's row can now carry its own branch and environment choice,
stored per `(group tag, app name)` pair in a new sidecar. This page states
the storage shape, the backend's deliberately dumb contract around the group
tag, the resolution order between the new per-group store and the existing
global per-app one, and — most importantly — the physical limits that make a
group entry an *intent* and not an isolated runtime.

## The sidecar: `groupSelections.json`

`backend/process/groupSelections.ts` owns a sidecar written next to
`state.json`/`selections.json` — `sidecarPath(config, 'groupSelections.json')`
(`backend/config/statePaths.ts:10`), so it follows `global.stateFile`'s
directory in both dev and packaged mode.

Shape (`groupSelections.ts:6-11`):

```ts
Record<groupTag, Record<appName, { branch?: string; environment?: string }>>
```

Both fields are optional and independently settable: a group may pin only a
branch, only an environment, both, or nothing.

Store API, all built on the shared `jsonPathStore` factory
(`backend/config/jsonStore.ts:33`, see
[Config read/write contract](config-read-write-contract.md)):

- `readGroupSelections(file)` (`groupSelections.ts:37`) — the store's
  `coerce` drops any group whose value isn't an object and any app entry
  that isn't an object, so a hand-mangled file degrades to "fewer entries"
  rather than throwing.
- `writeGroupIntent(file, group, app, patch)` (`:41`) — **merges** the patch
  over the existing entry (`{ ...existing, ...patch }`) and returns the
  merged intent, so setting a branch never clears a previously-set
  environment.
- `deleteGroupIntent(file, group, app)` (`:58`) — removes the app entry and,
  when that empties the group, removes the group key too (no empty-object
  residue accumulates).
- `renameGroup(file, from, to)` (`:72`) — moves the whole app map to the new
  key. On collision the **destination wins** per app (`{ ...fromMap, ...toMap }`).
- `pruneGroups(file, liveTags)` (`:84`) — keeps only tags present in
  `liveTags`, and rewrites the file **only if something was dropped**.

## Routes: the group tag is opaque, and unknown tags never 404

`backend/routes/groupSelections.ts`, mounted in `backend/server.ts:15,43`:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/group-selections` | Collects every tag in `config.apps[*].groups`, calls `pruneGroups` against that set, returns the pruned map |
| PUT | `/api/group-selections/:group/:app` | Merge-writes `{ branch?, environment? }`, returns the merged intent |
| DELETE | `/api/group-selections/:group/:app` | Deletes the entry, returns `{ ok: true }` |
| POST | `/api/group-selections/rename` | Body `{ from, to }`; `400` if either is missing |

Two deliberate properties:

- **The group tag is an opaque string.** The backend never resolves it to a
  config entity, never validates it against `config.apps[*].groups` on write,
  and therefore **never 404s on an unknown tag** — a PUT for a tag nobody
  uses simply lands in the file. Group membership lives entirely in the
  per-app `groups[]` tags in the config; this sidecar only annotates them.
- **Staleness is reconciled lazily, on read.** There is no delete-group
  endpoint here. `GET` prunes on every call (`routes/groupSelections.ts:18-25`),
  so a group that stopped existing (its last member's tag was removed) loses
  its intents the next time the frontend fetches. Group *deletion* in the UI
  relies on exactly this: `GroupMenu.deleteDerivedGroup` strips the tag from
  every member and then just re-dispatches `fetchGroupSelections()`
  (`app/src/components/portals/GroupMenu.tsx:83-88`).
- `PUT` copies `branch`/`environment` straight off the body when they are
  `!== undefined` (`:38-40`) with no type check — this is a local sidecar
  written by the app's own UI, not a validated public write boundary like
  `POST /api/config/apps`.

Group **rename** does not ride the lazy prune, because the old tag would be
pruned before anyone re-keyed it: `GroupMenu.renameDerivedGroup` rewrites
every member's `groups[]` tag first and dispatches
`renameGroupSelections({ from, to })` **only if every member patch
succeeded** (`GroupMenu.tsx:64-81`); on partial failure it surfaces a
`cfgMsg` naming the apps whose settings were left under the old tag instead
of moving the sidecar key onto a half-renamed group.

## `AppStatus.runningEnvironment` vs `selectedEnvironment`

`backend/runtime.types.ts:35` adds `runningEnvironment?: string`, set in
`backend/apps/statusService.ts:103`:

```ts
status.runningEnvironment = status.process === 'running' ? regEntry?.environment : undefined;
```

`regEntry` is the process-registry entry written at spawn time
(`backend/apps/lifecycleOps.ts:118-124` — the registry state carries
`environment: eff.environmentKey`). So:

- `selectedEnvironment` = what `resolveEffective` currently resolves from the
  **persisted** `selections.json` — "what a plain start would use next".
- `runningEnvironment` = what the live process was **actually launched with**,
  `undefined` whenever the app isn't running.

The two can disagree, and this feature is why they must be tracked
separately: a group start passes `persistSelection: false`
(`backend/routes/apps.ts:58-59` → `lifecycleOps.ts:37,49`), so the launch
environment is **not** written into `selections.json`. Without
`runningEnvironment` there would be no record at all of what a
group-launched process is running, and drift detection would be impossible.

## The two-store resolution order

For an environment, in order:

1. `(groupId, app)` intent from `groupSelections.json` — **only when
   `groupId !== undefined`**
2. the global per-app selection — `AppStatus.selectedEnvironment`, backed by
   `selections.json`
3. the first matched script for the current ref (`envs[0]`)

For a branch, in order:

1. `(groupId, app)` intent — again only when `groupId !== undefined`
2. the live branch (`git.branchesByApp[name].current ?? apps.apps[name].branch`)

Both orders are implemented twice, deliberately in lockstep: in the render
path (`selectGroupIntent`, `app/src/store/selectors.ts:123-138`, consumed
by `useAppRow.ts:53-58,74-75`) and in the start path
(`applyGroupIntentAndStart`, `app/src/store/groupOps.ts:22-27`). Changing
one without the other makes the picker show one env and the launch use
another.

**When `groupId` is `undefined`, the group store is skipped entirely and
behaviour is byte-for-byte the pre-feature behaviour.** This is asserted at
every branch point rather than left to fall out of an empty lookup:
`useAppRow.ts:53` (`intentBranch` forced `undefined`), `:58-71` (the
`fetchScripts` effect keeps its old fetch-once shape), `:74`, `:93`
(`hasDrift` is `false`), `:111`, `:119`, and `groupOps.ts:24,27,29,37`.

The `groupId`-less call sites are:

- the **"Other" section** — `OtherSection.tsx:35` calls `renderRows(rows)`
  with no third argument, so its rows get `groupId === undefined`. (Its
  `GroupHeader` does receive `OTHER_ID`, but only for collapse state and the
  menu; the header is `readOnly`, so its bulk-start button — the one call
  that would forward a group tag, `GroupHeader.tsx:47` — never renders.)
- the **dock** and every non-group surface,
- the **Dashboard** app detail, which still edits the global selection.

Grouped rows get their tag from `GroupSection.tsx:24,31` — `groupId` **is**
the derived group's label, i.e. the raw `AppConfig.groups[]` tag.

## The physical model: intent, not isolation

One `repoPath` has exactly one checked-out branch, and one app name has
exactly one process slot in the registry. Nothing about this feature changes
that. So a `(group, app)` entry is a **stated intent**, not a per-group
sandbox — the same app cannot run on two branches at once, no matter how
many groups list it.

What makes reality match intent is starting the row *from its group*
(`applyGroupIntentAndStart`, `groupOps.ts:12-40`), which is shared verbatim
by the row's own play button (`useAppRow.ts:127-132`) and the group header's
bulk Start (`startApps(members, groupId)`, `groupOps.ts:42-49`,
`GroupHeader.tsx:47`):

1. If the intent branch differs from the live branch, `await
   switchBranch(...)` — a **real checkout** through the existing
   auto-stash → checkout → auto-apply flow (see
   [Git stash flow contract](git-stash-flow-contract.md)). The start is
   **aborted** if that returns falsy, `ok: false`, or a conflict
   (`groupOps.ts:29-32`) — never start on the wrong branch.
2. Start with the resolved env and `persistSelection: false`, so a group
   launch never rewrites the app's global selection.

Consequences that follow directly from the one-branch-per-repo fact:

- **Picking a branch inside a group stores intent only and does not check
  out** (`useAppRow.ts:118-125`). Outside a group the picker still checks out
  immediately, exactly as before.
- The pre-start confirm is raised only when a checkout is actually needed
  (`useAppRow.ts:134-146`), reusing the existing running-app and shared-repo
  warnings (`useAppRow.ts:14-16`) — the shared-repo warning text explicitly
  says the app's rows *in other groups* will follow this checkout and may
  show drift.
- **Drift**: when a row is running with a branch/env other than the group it's
  displayed under wants, `hasDrift` is set (`useAppRow.ts:109-114`) and the row
  shows a small warning icon (`AppRowPickers.tsx`'s `rowMetaDrift` +
  `driftWarningIcon`) instead of the earlier inline `live: <branch> · <env>`
  chip. Hovering the icon opens a `Popover` (portal-rendered to
  `document.body`, `position: fixed`, viewport-space math for placement
  above/below and a right-pushed box) showing branch and env on separate
  rows — `driftSlot` now carries `{ active, branch, env }`
  (`useAppRow.ts:116-117`'s `driftBranch`/`driftEnv`, passed via
  `AppRow.tsx:69`) instead of one pre-formatted `driftLabel` string (still
  computed at `useAppRow.ts:115` but no longer rendered). Portal positioning
  exists because an absolute-positioned box near the top/bottom of a row got
  clipped or overlapped the adjacent row — no gap between rows to open into;
  same reasoning as this codebase's dropdown `Popover`/`Picker`. An explicit
  **restart** affordance remains (`AppRow.tsx:75`'s `restart={vm.hasDrift}`).
  Pressing it on a drifting running app opens a confirm with three outcomes —
  restart with the group's settings, keep the drift, or cancel
  (`useAppRow.ts:157-177`) — instead of silently clobbering another group's
  running process.

### Nuance: the env half of drift uses the resolved value, not the raw intent

`hasDrift`'s branch comparison uses `intentBranch`, which is the **raw**
group intent (`useAppRow.ts:53`). Its environment comparison uses
`intent.environment` (`:95`), which comes from `selectGroupIntent` and has
**already fallen back** to `apps[app].selectedEnvironment`
(`selectors.ts:133`). So an app with no group env intent, a global selection
of `dev`, and a live `runningEnvironment` of `prod` will report drift — the
in-code comment at `useAppRow.ts:90-92` ("an unset intent never counts as
drift") holds for the branch half only. The two halves are asymmetric on
purpose or by accident; treat the comment as describing the branch case.

## No migration, no first-run behaviour change

There is no migration step and no default file. If `groupSelections.json`
doesn't exist, `jsonPathStore.read()` returns the `{}` fallback without
touching disk (`jsonStore.ts:48`), every lookup misses, every resolution
falls through to the global selection, and the app behaves exactly as it did
before the feature. The file is created on the first `PUT`.

Boot wiring is a single one-shot fetch — `fetchGroupSelections()` in
`app/src/hooks/usePolling.ts:22`, **outside** the poll interval and the
focus handler. Like `fetchConfig`, it does not re-fetch periodically; the
slice keeps itself in sync by folding each mutation's result into state
(`groupSelectionsSlice.ts:50-72`), and `deleteDerivedGroup` re-fetches
explicitly when it needs the prune to land.

# Citations

[1] `backend/process/groupSelections.ts:6-11,37,41,58,72,84`
[2] `backend/routes/groupSelections.ts:15-31,33-48,50-62,64-78`; `backend/server.ts:15,43`
[3] `backend/config/statePaths.ts:10`; `backend/config/jsonStore.ts:33,48`
[4] `backend/runtime.types.ts:35`; `backend/apps/statusService.ts:103`; `backend/apps/lifecycleOps.ts:37,49,118-124`; `backend/routes/apps.ts:58-59`
[5] `app/src/store/selectors.ts:123-138`; `app/src/store/slices/groupSelectionsSlice.ts`; `app/src/store/groupOps.ts:12-49`
[6] `app/src/components/AppList/useAppRow.ts:53-58,74-75,93-97,110-125,134-146,157-177`; `app/src/components/AppList/AppRow.tsx:97,103,105`
[7] `app/src/components/Groups/GroupSection.tsx:24,31`; `OtherSection.tsx:28,35`; `GroupHeader.tsx:47`
[8] `app/src/components/portals/GroupMenu.tsx:64-88`; `app/src/api.ts:228-241`; `app/src/hooks/usePolling.ts:22`
