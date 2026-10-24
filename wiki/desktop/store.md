---
type: concept
title: Desktop Redux store
timestamp: "2026-08-01T00:00:00Z"
---

# Desktop Redux store

The desktop app's client state lives in a single Redux Toolkit store
(`app/src/store/index.ts`). It holds nine slices (`apps`, `favorites`,
`order`, `sessions`, `ui`, `theme`, `plugins`, `git`, `groupSelections`), a
`listenerMiddleware` for side effects that must run outside any one
component's render cycle, a set of memoized cross-slice selectors
(`store/selectors.ts`), a small multi-step orchestration helper module
(`store/groupOps.ts`), and a top-level `usecases/` folder for
dispatch-only view-transition helpers that don't belong inside any single
slice. Every thunk in every slice normalizes its rejection message through
the same tiny helper (`store/thunkError.ts`) instead of hand-rolling
`action.error.message ?? fallback` at each call site.

Config itself is fetched once via `fetchConfig` (in `appsSlice`) and treated
as the server-side source of truth — group *membership* lives inside that
config payload (each app's `groups` tag list plus `config.groupOrder`), not
in a slice of its own; only per-(group, app) branch/env **intent** gets its
own slice (`groupSelectionsSlice`, hydrated from its own sidecar route). See
[Config read/write contract](../entities/config-read-write-contract.md) for
the backend schema/validation asymmetry this config payload is shaped by,
and for the "optimistic-persist pattern and its one exception" section that
documents the fire-and-forget-vs-must-not-swallow split referenced below.
Branch/session picker state (`gitSlice`, `sessionsSlice`) follows the
contracts in
[Frontend picker/selector contracts](../entities/frontend-picker-selector-contracts.md)
and the live-vs-picker-only distinction in
[Branch signal & refresh scope](../entities/branch-signal-and-refresh-scope.md).

## `app/src/store/index.ts`

Wires the store itself: `configureStore` with the nine slice reducers keyed
by name (`apps`, `favorites`, `order`, `sessions`, `ui`, `theme`,
`plugins`, `git`, `groupSelections`) and `listenerMiddleware.middleware` prepended to the
default middleware stack. Exports the `RootState` and `AppDispatch` types
that every other store file and component types its state/dispatch against.

## `app/src/store/hooks.ts`

Typed wrappers around `react-redux`'s `useDispatch`/`useSelector`:
`useAppDispatch: () => AppDispatch` and
`useAppSelector: TypedUseSelectorHook<RootState>`. This is the only place
components should pull dispatch/selector hooks from — it exists purely so
call sites don't repeat the generic type parameters everywhere.

## `app/src/store/thunkError.ts`

One function, `rejectionMessage(action, fallback)`, that reads
`action.error.message` off a rejected-thunk action and falls back to a
caller-supplied string when the message is empty. Every `.rejected` case in
every slice (`appsSlice`, `gitSlice`, `pluginsSlice`) calls this instead of
inlining the same `??`/`||` chain, so the fallback-message convention stays
in one place.

## `app/src/store/selectors.ts`

Cross-slice memoized selectors built with `createSelector`, all operating on
`RootState` (`s.order.order`, `s.apps.config`, `s.apps.apps`,
`s.favorites.favorites`, `s.ui.filterRunning`, `s.ui.searchQuery`):

- `selectEffectiveOrder` — wraps `effectiveOrder(order, config)` from
  `lib/grouping`.
- `selectSortedAll` — sorts all app names by effective order, then
  partitions favorites to the front.
- `selectVisibleNames` — applies the running-filter and search-query filter
  on top of `selectSortedAll`.
- `selectRunningCount` / `selectAppCount` — simple derived counts over
  `config`/`apps`.
- `selectGroupSections` — maps every group label (via
  `selectAllGroups(config)` from `lib/grouping`) to its filtered visible
  member names, dropping empty groups.
- `selectListNameSet` / `selectListNames` — apps whose `surface === 'list'`.
- `selectDockNames` — apps whose `surface === 'dock'`.
- `effectiveRepoPath(config, apps, name)` (module-private helper) —
  client-side reimplementation of the backend's `resolveEffective`
  precedence (`env.repoPath -> version.repoPath -> app.repoPath`) from
  `appManager.ts`; documented in detail in
  [Config read/write contract](../entities/config-read-write-contract.md)
  under "`selectors.ts` — `effectiveRepoPath` mirrors backend resolution".
- `makeSelectAppsSharingRepoPath()` — a **selector factory**, not a single
  shared selector: each app row must call
  `useMemo(makeSelectAppsSharingRepoPath, [])` to get its own instance,
  because a single shared memoized selector would thrash its one-slot cache
  across different `appName` args on every render.
- `makeSectionRows(ctx: SectionRowsCtx)` — a plain (non-memoized) factory
  taking `{ config, apps, searchQuery, filterRunning }` and returning a
  `(members: string[]) => string[]` filter function, used to derive
  per-section visible rows without going through `createSelector`.

## `app/src/store/listeners.ts`

`listenerMiddleware = createListenerMiddleware()`, with two registered
listeners:

1. Matches `setTheme` (from `themeSlice`) and persists the new theme to
   `localStorage` under `STORAGE_THEME` (`lib/constants`).
2. Matches `fetchConfig.fulfilled` (from `appsSlice`) and persists the
   **reconciled** `groupOrder` back to disk via `api.setGroupOrder`, but only
   when the reducer actually changed it: `action.payload.groupOrder` stays
   pristine (the reducer never mutates the action payload — see the Immer note
   in `fetchConfig.fulfilled`), so `arraysEqual(raw, reconciled)` is a reliable
   "did reconciliation do anything" check. Fire-and-forget: no pending/error
   state is dispatched on failure.

## `app/src/store/groupOps.ts`

Multi-step app/group start-stop orchestration thunks and group-membership
helpers, all plain functions (not `createAsyncThunk`):

- `applyGroupIntentAndStart(dispatch, getState, groupId, appName, opts?)` —
  the shared "apply this group's branch/env intent, then start" sequence
  used by both a row's own start (`useAppRow`) and the bulk group start.
  `ALL_ID` collapses to "no group" up front. The env comes from the group
  intent when it's present in the `scriptsByApp` matched list (or
  unconditionally under `opts.allowInvalidIntent`; otherwise it bails
  `false`), else from `st.selectedEnvironment`, else the first matched env.
  The checkout step **dispatches whenever an intent branch is set** — it
  deliberately does *not* compare against the cached `st?.branch`, which
  polling can leave stale for up to `POLL_MS`; a checkout to the branch
  already checked out is a no-op server-side (see
  [git-stash-flow-contract](../entities/git-stash-flow-contract.md)'s
  already-on-target rule). Starts with `persistSelection: false` inside a
  group so a group launch never rewrites the app's global env selection.
- `groupMemberNames` / `foreignRunningNames` / `groupIntentConflicts` —
  membership and drift helpers over `RootState`; `groupIntentConflicts`
  reuses `lib/grouping`'s `hasIntentDrift`, the same predicate the per-row
  drift indicator uses, so "is this app drifted" is defined once.
- `startGroupExclusive({ groupId, names, allowInvalidIntent, resolution })`
  — the exclusivity-aware entry point: without a `resolution` it parks any
  conflicts in `uiSlice` (`setPendingExclusiveStart`) and stops, starting
  nothing, so cancelling is a true no-op; with `'restart'` it also stops and
  relaunches drifted members, with `'skip'` it leaves them alone.
- `startApps(names, groupId?)` — starts each named app sequentially through
  `applyGroupIntentAndStart`, **re-reading
  `getState()` fresh before each step** (not a snapshot taken once), so an
  earlier app's start effects are visible to later steps (each per-app
  rejection is swallowed inside `applyGroupIntentAndStart`), then a single
  trailing `refreshAll()`.
- `stopApps(names)` — same shape for `stopApp`, only for apps whose status
  is currently `'running'`, then a trailing `refreshAll()`. There is
  deliberately no "stop other groups" behavior in `startApps` itself — that
  exclusivity lives only in `startGroupExclusive`.

## `app/src/store/slices/appsSlice.ts`

Owns `config` (the `FullConfig` fetched from the backend), `configLoaded`,
per-app runtime `apps: Record<string, AppStatus>`, a `busy` map, an
`errors` map, a single `cfgMsg` banner string, and the `fetchApps`
seq-guard triple `fetchAppsSeq` / `appliedFetchAppsSeq` /
`pendingFetchAppsSeq`.

Thunks: `fetchConfig`, `fetchApps`, `startApp`, `stopApp`, `restartApp`,
`setEnvironment`, `reloadConfig` (calls `api.reloadConfig()` then
re-dispatches `fetchConfig`+`fetchApps` in parallel and sets a success
`cfgMsg`, or a failure `cfgMsg` on catch), `openConfigInEditor` (fetches the
config path, shells out via `lib/tauri.openConfigInEditor`, sets a `cfgMsg`
either way), and `refreshAll` (dispatches `fetchApps` + `sessionsSlice`'s
`fetchSessions` in parallel — this is the generic polling entry point used
by `usePolling` and by other slices' post-mutation refreshes).

**`fetchApps` seq-guard.** Many call sites can have `fetchApps` requests in
flight at once (polling, window focus, `switchBranch`, start/stop, `groupOps`,
`refreshAll`), and responses can land out of order, letting a late reply to an
older request roll back a fresher snapshot. `fetchApps.pending` increments
`fetchAppsSeq` and stores it under `action.meta.requestId` in
`pendingFetchAppsSeq`; `.fulfilled` looks its own seq back up, deletes the
pending entry, **returns early without writing `state.apps` if that seq is
lower than `appliedFetchAppsSeq`**, and otherwise advances
`appliedFetchAppsSeq` before assigning. `.rejected` just drops the pending
entry. This is why `fetchApps.fulfilled` is no longer a plain assignment.

Reducer: `setCfgMsg`. `extraReducers` handles `fetchConfig.fulfilled/rejected`
and the `fetchApps` pending/fulfilled/rejected trio directly, plus a shared `appOps` group
(`startApp, stopApp, restartApp, setEnvironment`) matched generically via
`isPending`/`isFulfilled`/`isRejected` — pending sets `busy[name] = true`,
fulfilled writes the returned `AppStatus` into `apps[name]` and clears
`busy`/`errors`, rejected clears `busy` and sets `errors[name]` via
`rejectionMessage`. `fetchConfig.rejected` is the only config/apps-family
rejection that surfaces via `cfgMsg`, since `fetchConfig` runs once at mount
(unlike the polling `fetchApps`/`refreshAll`) — see
[Config read/write contract](../entities/config-read-write-contract.md).

## `app/src/store/slices/favoritesSlice.ts`

State: `{ favorites: string[] }`. `fetchFavorites` thunk loads from
`api.getFavorites()`. `toggleFavorite` thunk reads current favorites from
`getState()`, computes the toggled array, dispatches the sync `setFavorites`
reducer immediately, then calls `api.setFavorites(next).catch(() => {})`
fire-and-forget with no failure handling — the canonical "optimistic,
no revert" pattern also used by `orderSlice`.

## `app/src/store/slices/gitSlice.ts`

State: `branchesByApp: Record<string, GitBranchesResponse>`,
`branchesLoading`, `branchesError`, `conflict: Record<string, { files:
string[] } | undefined>`, `checkoutError`, `checkoutPending` — all keyed
**per-app**, so one app's error/conflict never leaks onto another app's
branch picker row — plus `scriptsByApp` / `scriptsPending`, which are keyed
by `scriptsKey(appName, requestedRef)` (a `\0`-joined pair) rather than by
app name alone, because the same app rendered in two group sections can
preview two different intent branches at once.

`checkoutPending[appName]` is set on `switchBranch.pending` and cleared on
both `.fulfilled` and `.rejected`. `switchBranch` is not part of
`appsSlice`'s `appOps` matcher, so it never touches `apps.busy` — this is
the signal that keeps a row disabled for the whole checkout (`useAppRow`'s
`isBusy` ORs the two).

Thunks: `fetchScripts({ appName, ref })` — per-(app, ref) env/script list
behind a `condition` that dedupes on `scriptsPending`, so concurrent
requests for the same slot collapse into one. `fetchBranches(appName)` — dispatched lazily only when a branch
picker opens, never from the polling `refreshAll`, since branch lists aren't
part of the regular status poll (the live branch signal instead is
`apps.apps[name].branch`, per
[Branch signal & refresh scope](../entities/branch-signal-and-refresh-scope.md)).
`switchBranch({ appName, branch })` — calls `api.checkoutBranch`, then
dispatches `refreshAll` (from `appsSlice`) before returning. `dropStash({
appName, stashRef })` — calls `api.dropStash`, then `refreshAll`; its thunk
contract requires the caller to gate the dispatch behind an explicit confirm
modal, since the thunk performs no confirmation itself.

Reducers: `dismissConflict`, `dismissCheckoutError` (both delete the
per-app key). `extraReducers`: `fetchBranches.pending/fulfilled/rejected`
manage `branchesLoading`/`branchesError`/`branchesByApp`.
`switchBranch.fulfilled` treats a `200` response with `ok: false` the same
as a blocking error (sets `checkoutError`, returns early) rather than
silently treating it as success — mirrors the `409` unresolved-conflict
path; see [Config read/write contract](../entities/config-read-write-contract.md)
(FR-37). That `ok: false` branch **deletes `conflict[appName]` first**:
`AppRowModals` gates the checkout-error banner behind `!conflict`, so a
leftover conflict from an earlier attempt would otherwise keep displaying
instead of the new error. `switchBranch.rejected` clears both
`checkoutPending` and `conflict` for the same reason before setting
`checkoutError`. On true success it sets `conflict[appName]` if the
response reports one, updates `branchesByApp[appName].current`, and
drops `.stash` if a stash was applied and there's no conflict; it then
either sets `checkoutError[appName]` to the response's `warning` (when
`staleStash && warning` — a succeeded checkout whose recorded stash had
been dropped outside the app, reusing the error banner purely as a message
channel) or clears `checkoutError`.

`fetchScripts.rejected` deletes the pending marker and, **if no slot exists
yet, writes an empty one** (`{ ref, matched: [], all: [] }`). Without it a
failed first fetch left no slot at all, and since `refreshScripts` only
re-fetches slots already in the cache, the env picker for that row was gone
permanently instead of retried on the next refresh.

`dropStash.fulfilled` similarly checks `ok === false` before clearing
`checkoutError` and deleting `.stash`. Both `.rejected` cases set
`checkoutError[appName]` via `rejectionMessage`.

## `app/src/store/slices/groupSelectionsSlice.ts`

State: `{ selections: GroupSelections; loaded: boolean }` — the per-(group
tag, app) branch/environment **intent** map mirrored from the backend's
`groupSelections.json` sidecar; see
[Per-(group, app) branch & environment intent](../entities/group-app-intent-contract.md)
for the sidecar contract itself. There is no separate client-side "groups"
slice: group *membership* lives in `apps.config` (each app's `groups` tag
list plus `config.groupOrder`), and this slice only owns intent.

Thunks — all server-first, state written from the response rather than
optimistically: `fetchGroupSelections` (hydrates the whole map, sets
`loaded`), `setGroupIntent({ group, app, patch })` (writes the returned
intent into `selections[group][app]`), `clearGroupIntent({ group, app })`
(deletes the app entry and prunes the group entry when it becomes empty —
the client-side mirror of the backend's lazy prune),
`renameGroupSelections({ from, to })` (merges the old tag's map into the new
one with existing `to` entries winning, then deletes the old tag). No plain
reducers.

## `app/src/store/slices/orderSlice.ts`

State: `{ order: string[] }` — the user's persisted custom app ordering.
`fetchOrder` thunk loads from `api.getOrder()`. `reorder({ dragSource,
target })` thunk: no-ops if `dragSource` is null or equals `target`;
otherwise reads `order` and `config` **fresh from `getState()`** (not a
stale render snapshot) and recomputes `effectiveOrder` so the reorder
matches whatever is currently displayed, splices `dragSource` to `target`'s
index, dispatches the sync `setOrder` reducer immediately, then persists via
`api.setOrder(next).catch(() => {})` fire-and-forget — same optimistic
pattern as `favoritesSlice`.

## `app/src/store/slices/pluginsSlice.ts`

State: `list: MarketplacePlugin[]` (every marketplace plugin, each carrying
its own `activated`/`enabled` booleans — see
[Backend plugin system](../backend/plugins.md) for what those two
independent flags mean; this is **not** an installed-only list), `descriptors:
Record<string, Record<string, ControlDescriptor>>`, `runningActions:
Record<string, boolean>` (keyed `${pluginId}:${appName}`), `invokeErrors:
Record<string, string>` (keyed per app), `catalog: CatalogEntry[]`,
`catalogLoading`, `preview: PluginPreview | null`, `previewSource: string`,
`installing`, `error`.

Thunks: `fetchPlugins`, `fetchDescriptors`, `installPlugin(source)` (installs
then awaits a re-dispatched `fetchPlugins`), `setPluginActivated({ id, activated })`
(flips the activation/config-membership flag, then awaits a re-dispatched
`fetchPlugins`), `setPluginEnabled({ id, enabled })` (flips the independent
enabled/disabled flag, same re-dispatch-`fetchPlugins` shape),
`removePlugin(id)` (calls `api.removePlugin` — which, despite the name,
only deactivates the plugin server-side, see
[Backend plugin system](../backend/plugins.md)'s "DELETE
`/api/plugins/:id` deactivates" section — then re-dispatches both
`fetchPlugins()` and `fetchCatalog()` in parallel so the Marketplace list
picks the plugin back up), `previewPlugin(source)`, `fetchCatalog`,
`invokePlugin({ pluginId, appName, input })` (invokes, then dispatches
`refreshAll` (from `appsSlice`) and `fetchDescriptors` in parallel — a
plugin invocation can change both app runtime state and descriptor-rendered
control state).

Reducers: `closePreview`, `showPluginDetails(plugin)` (sets `preview` from
an already-known `MarketplacePlugin` without a network round-trip, clearing
`previewSource`). `extraReducers` covers fulfilled/rejected pairs for each
thunk above, tracking `installing`/`catalogLoading` pending flags and
routing every rejection through `rejectionMessage` into `state.error` (and,
for `invokePlugin.rejected` specifically, also into the per-app
`invokeErrors[appName]`). `invokePlugin.pending/fulfilled` set/clear the
`runningActions[pluginId:appName]` key and clear
`invokeErrors[appName]` on success.

Two should-fix items from a prior plugin-system audit were fixed here:
- **`fetchPlugins.rejected`** now exists (`state.error = rejectionMessage(action, 'Plugins fetch failed')`)
  — previously there was no `.rejected` case anywhere for `fetchPlugins`,
  so a failed refetch (which every mutating thunk above chains through)
  left the list silently stale with zero error surfaced. `setPluginActivated.fulfilled`
  itself still has no dedicated reducer case, deliberately — the thunk's
  chained `await dispatch(fetchPlugins())` already overwrites `state.list`
  wholesale with the server's authoritative view, so a second optimistic
  patch would be redundant work immediately clobbered by that refetch.
- **`previewPlugin.pending`** now sets `state.installing = true` (and
  clears `state.error`); `.fulfilled`/`.rejected` both reset it to `false`.
  Previously `previewPlugin.pending` set `installing = false` (backwards —
  only `installPlugin.pending` ever set it `true`), so the Install button's
  loading spinner never appeared during a slow preview fetch.

## `app/src/store/slices/sessionsSlice.ts`

State: `{ sessions: SessionInfo[] }`. One thunk, `fetchSessions`, loading
from `api.getSessions()`; no manual reducers. This is the slice
`appsSlice.refreshAll` fans out to alongside `fetchApps`.

## `app/src/store/slices/themeSlice.ts`

State: `{ theme: Theme }` where `Theme = 'light' | 'dark' | 'auto'`. Initial
state is computed synchronously at module load via `loadTheme()`, which
reads `localStorage[STORAGE_THEME]` and falls back to `'auto'`. One reducer,
`setTheme`, whose persistence back to `localStorage` is handled entirely by
`listeners.ts` (the slice itself never touches `localStorage` on write,
only on initial read).

## `app/src/store/slices/uiSlice.ts`

Pure client-UI state, no thunks. State: `viewMode: 'apps' | 'settings'`,
`searchQuery`, `searchActive`, `filterRunning`, `collapsedGroups: string[]`,
`showSessions`, `autostart: boolean | null`, `dashboardOpen`,
`dashboardTab: DashboardTab` where
`DASHBOARD_TABS = ['apps', 'plugins', 'environment'] as const`. Reducers:
`setViewMode`, `setSearchQuery`, `setSearchActive`, `clearSearch` (resets
both search fields together), `toggleFilterRunning`, `toggleCollapsedGroup`
(push/splice toggle on the `collapsedGroups` array), `setShowSessions`,
`setAutostart`, `openDashboard`, `closeDashboard`, `setDashboardTab`.
`selectFilterRunning`/`selectSearchQuery` from this slice feed
`store/selectors.ts`'s `selectVisibleNames`.

## `app/src/usecases/menuNavigation.ts`

Thin dispatch-only helpers for view/dashboard transitions that don't belong
inside `uiSlice` itself because they layer in non-Redux side effects
(`lib/tauri` calls) around the state change:

- `onSettingsOpened()` — dispatches `setViewMode('settings')`.
- `onBackToMenu()` — dispatches `setViewMode('apps')`.
- `onWorkspaceOpened()` — guarded by a module-level `animInFlight` boolean
  (not Redux state — it's a transient animation lock, not app state) so
  concurrent calls are no-ops; dispatches `openDashboard()` then awaits
  `tauri.enterDashboard()`, resetting the guard in a `finally`.

This is the only file in `usecases/`; the naming makes clear it's reserved
for cross-cutting navigation/orchestration actions, not a general dumping
ground for thunks that belong in a slice.
