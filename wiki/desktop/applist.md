---
type: concept
title: AppList surface — rows, tiles, dock, per-row state
timestamp: "2026-08-01T00:00:00Z"
---

# AppList surface — rows, tiles, dock, per-row state

Zone: `app/src/components/AppList/*.tsx`, `*.ts`. This is the primary
desktop-shell surface that renders configured apps as either **list rows**
(grouped by favorites/custom-groups/other, via `../Groups/*Section`) or
**dock tiles** (`DockBar`/`AppTile`, for apps whose resolved surface is
`'dock'` — see `selectListNameSet`/`selectDockNames` in
`store/selectors.ts`, documented in
[frontend-picker-selector-contracts.md](../entities/frontend-picker-selector-contracts.md)).
Row-level env/branch pickers and picker positioning are the shared `Picker`/
`useCombobox` contract from the same document; shared row/list styling
conventions live in
[frontend-component-contracts.md](../entities/frontend-component-contracts.md).

All 13 files in the zone:

## `AppList.tsx`

Top-level list container. Owns three pieces of cross-row UI state that must
be threaded down to every `AppRow`: `dragSource` (name of the row currently
being drag-reordered), `openPicker` (`PickerTarget | null` — which row+field
has an open env/branch picker), and `longMenu` (name of the row showing the
terminal long-press menu). Reads `selectListNames` (visible, list-surface
app names), `ui.searchQuery`, `ui.filterRunning` for the empty-state message.
Wires global listeners: `mouseup` on `window` clears `dragSource`; two
`useOutsideClose` calls close `openPicker` (scoped to `.pickerMenuPortal`
class selector, click event) and `longMenu` (any outside click);
`visibilitychange` clears `longMenu` when the tab is hidden (prevents a
stale long-press menu lingering after switching away). `renderRows(names,
hideStar?)` is the shared row-rendering closure passed to
`GroupSection`/`OtherSection`/`AllSection` (in `../Groups/`) so each
section renders its own name subset through one `AppRow` factory.

## `AppRow.tsx`

Single list-row component. Delegates all view-model computation to
`useAppRow(name)` (below) and composes the visual sub-parts:
`AppRowStatus` (drag handle/status dot/icon), label + `ExternalLink` site-open
affordance, `TerminalButton`, favorite `Star` toggle (suppressible via
`hideStar` for sections that render favorites separately), `AppRowPickers`
(env/branch pickers + plugin list-surface controls), `AppRowActions`
(start/stop button), and `AppRowModals` (confirm/error dialogs). Owns the
row's `onMouseEnter` (dispatches `reorder({dragSource, target: name})` from
`store/slices/orderSlice`) and `onContextMenu` (opens the row context menu
via `vm.openContextMenu`). Props: `AppRowProps` (`types.ts`) —
`name`, `openPicker`/`setOpenPicker`, `longMenu`/`setLongMenu`,
`dragSource`/`setDragSource`, optional `hideStar`.

## `useAppRow.ts`

The row's view-model hook — all Redux reads, local confirm-dialog state, and
derived booleans for one app `name`, decoupled from rendering. Exports
`useAppRow(name)` and its return type `AppRowVM`.

- Selects: `apps.config.apps[name]` (cfg), `apps.apps[name]` (runtime
  status `st`), `apps.busy[name]`, `apps.errors[name]`,
  `favorites.favorites.includes(name)`, `plugins.list`/`descriptors`/
  `runningActions`, `plugins.invokeErrors[name]`, `git.branchesByApp[name]`,
  `git.branchesLoading[name]`, `git.branchesError[name]`,
  `git.conflict[name]`, `git.checkoutError[name]`,
  `git.checkoutPending[name]`.
- `isBusy` is **not** `apps.busy[name]` alone: it is
  `!!s.apps.busy[name] || !!s.git.checkoutPending[name]`, so the row also
  reads as busy for the whole duration of an in-flight `switchBranch`
  (which never touches `apps.busy` — see
  [Branch signal & refresh scope](../entities/branch-signal-and-refresh-scope.md)).
- `selectAppsSharingRepoPath = useMemo(makeSelectAppsSharingRepoPath, [])` —
  per-row memoized selector instance (see
  [frontend-picker-selector-contracts.md](../entities/frontend-picker-selector-contracts.md#store-selectorsts--favorites-partition-basenames-replication-list-surface-single-source)
  for why this must not be hoisted to module scope: one shared `createSelector`
  would thrash across differing `appName` args every render).
- Local state: `pendingBranch: {branch, warnings} | null`,
  `pendingDropStash: boolean` — both back the confirm modals in
  `AppRowModals`.
- Derives `envs` (env keys filtered on `enabled !== false`), `selEnv`,
  `running` (via `lib/grouping.isRunning`), `isStoppable`
  (`st?.process === 'running'`), `hasActiveStatus` (running or
  `'unhealthy'`), `localPort`, `siteUrl`, `canOpenSite`, `effIcon` (via
  `lib/appIcon.resolveAppIcon`), `canDropStash`, `branchOptions`,
  `branchPickerOptions` (branch list plus `DROP_STASH_ITEM` sentinel from
  `../pickers/constants` when a stash is droppable).
- `requestBranchSwitch(branch)`: builds a `warnings[]` (running-app warning
  plus shared-repo-path warning from `sharingApps`) and either sets
  `pendingBranch` (surfaces `GitCheckoutConfirm` via `AppRowModals`) when
  warnings exist, or dispatches `switchBranch` directly when there's nothing
  to warn about.

## `AppRowStatus.tsx`

Renders the row's leading status dot / drag handle / icon. Props
(`AppRowStatusProps`): `process?`, `hasActiveStatus`, `effIcon`
(`EffectiveIcon` from `lib/appIcon`), `dragging`, `onDragStart`. When
`hasActiveStatus` is true, renders a colored `.dot` (class driven by
`process ?? 'unknown'`) that doubles as the drag handle; otherwise renders
`.rowIconHandle` containing either a `DynamicIcon` (lucide, with
`NoIconFallback` as the render-failure fallback) or a `CircleDashed` glyph
for apps with no configured icon. Drag is initiated via `onMouseDown` (not
native HTML5 DnD) calling `onDragStart`, consumed by `AppList`'s
`dragSource` state and `AppRow`'s `reorder` dispatch on hover.

## `AppRowPickers.tsx`

Renders the row's env picker, branch picker, and any list-surface plugin
controls, each inside its own `.rowMetaCell` — emitted even when empty (see
[frontend-picker-selector-contracts.md § Env-picker column
alignment](../entities/frontend-picker-selector-contracts.md#env-picker-column-alignment-approwpickerstsx))
so the fixed-width columns stay aligned across rows that do/don't have
envs/branches. Both pickers are instances of the shared `Picker` component
(`../pickers/Picker.tsx`, `variant: 'env'` / `'branch'`); this component
only wires open/value/onSelect/onToggle props through, all interaction
logic lives in `Picker`/`useCombobox`. Plugin controls: iterates `plugins`,
looks up `descriptors[name]?.[p.id]`, renders a `PluginSlot` (from
`../common/PluginSlot`) only when the descriptor is `visible` and
`surface === 'list'` — busy state combines row `isBusy` with
`runningActions['${p.id}:${name}']`. Props: `AppRowPickersProps` — env
(`selEnv`, `envs`, `envPickerOpen`, `onEnvToggle`, `onEnvSelect`), branch
(`branchValue`, `branchVisible`, `branchPickerOptions`, `branchPickerOpen`,
`badges` `{dirty, stashAvailable, conflict}`, `branchesLoading`,
`branchesError`, `onBranchToggle`, `onBranchSelect`), plugin
(`plugins`, `descriptors`, `runningActions`, `name`), plus shared `isBusy`.

## `AppRowActions.tsx`

The row's start/stop toggle button. Props (`AppRowActionsProps`): `isBusy`,
`isStoppable`, `port?`, `onToggle`. Renders a `Loader2` spinner while busy;
otherwise "Stop" (with a `.togglePort` badge showing `:port` when known) or
"Start" depending on `isStoppable`. Purely presentational — `onToggle`'s
start-vs-stop dispatch logic lives in `AppRow.tsx`.

## `AppRowModals.tsx`

Groups every confirm/error overlay a row can show, all backed by the shared
`GitCheckoutConfirm` component (`../portals/GitCheckoutConfirm`) except
plugin/general error which use `RowError`/plain `.cfgStatus`: plugin invoke
error (`pluginErr`), general row error (`err`, rendered via `RowError`),
pending-branch-switch confirm (`pendingBranch`, `variant: 'confirm'`),
pending-drop-stash confirm (`pendingDropStash && branchInfo?.stash`,
`variant: 'confirm'`), unresolved-conflict block (`conflict`,
`variant: 'conflict'`, lists `conflict.files`), and checkout-error block
(`checkoutError`, shown only `!conflict`, `variant: 'conflict'`). All
confirm/cancel callbacks are passed in as props (`AppRowModalsProps`) —
this component has no dispatch logic of its own, `AppRow.tsx` owns every
handler (e.g. `onConfirmBranch` dispatches `switchBranch` and clears
`pendingBranch`).

## `RowError.tsx`

Renders a row's error banner. Props (`RowErrorProps`): `name`, `error`,
`selEnv`. Detects port-conflict errors via a regex
(`/in use|port|EADDRINUSE|already/i`) and, only then, renders "Force start"
(`startApp({name, environment: selEnv || undefined, force: true})`) and
"Force stop" (`stopApp({name, force: true})`) recovery buttons alongside the
error text.

**Empty env is `undefined`, never `''`.** Both this button and `AppRow`'s
start/stop toggle pass `selEnv || undefined` rather than `selEnv ?? ''`: an
empty-string `environment` used to travel to `POST /api/apps/:name/start`,
get persisted as the app's selection, and then fall through
`effectiveConfig.ts`'s falsy fallback so the app silently launched the first
script. The route now also guards (`typeof === 'string' && !== ''`) — the
client side is the matching half of that contract, documented in
[Backend Route/API reference](../entities/backend-route-api-reference.md).

## `TerminalButton.tsx`

Per-row terminal affordance with a long-press secondary menu. Props
(`TerminalButtonProps`): `name`, `longMenu` (name of row currently showing
its long menu, lifted to `AppList`), `setLongMenu`. Short click calls
`openTerminal(name)` — an **exported** module-level function (it used to be
file-private), so `portals/AppContextMenu.tsx`'s "Open in terminal" item
reuses this exact implementation instead of re-deriving the attach command
— (fetches attach command via
`api.getAttachCommand(name, {control: true})`, opens it via
`tauri.openInTerminal`). Holding the button for `LONG_PRESS_MS` (600ms, via
a `setTimeout` ref, cleared on unmount/mouseup/mouseleave) opens the long
menu instead, offering: open terminal, restart (`restartApp` then
`refreshAll`), and copy tmux attach command (`api.getAttachCommand(name)`
without `control`, copied via `lib/clipboard.copyText`). A
`longPressFired` ref suppresses the trailing `onClick` from also firing
`openTerminal` after a long-press already opened the menu.

## `AppTile.tsx`

Dock-surface rendering of one app — used by `DockBar` for apps resolved to
`surface: 'dock'`. Unlike `AppRow`, this component reads its own Redux
selectors directly (`s.apps.config.apps[name]`, `s.apps.apps[name]`,
`s.apps.busy[name]`, `s.plugins.list/descriptors/runningActions`) rather
than going through a shared hook — there is no `useAppTile`. Computes
`envs`/`selEnv`/`isStoppable`/`effIcon` inline (duplicated logic pattern
also present in `useAppRow`, both filtering the filter-matched script list on
`enabled !== false` per the picker-contracts doc). `dockControls` filters
`plugins` to descriptors that are `visible && surface === 'dock'`. Renders
one `.appTileMain` button (start/stop toggle, same busy/spinner pattern as
`AppRowActions`) showing either the resolved icon (`DynamicIcon`, falling
back to `InitialsFallback`) or, while busy, a spinner; plugin dock controls
render in a sibling `.appTileBadges` span (deliberately a **sibling**, not a
descendant, of the `<button>` — interactive plugin controls are invalid
HTML content inside a `<button>` and nesting them would let badge clicks
bubble into the tile's start/stop handler; `e.stopPropagation()` on the
badges span is the second half of that isolation). Tile label renders
below as `.appTileLabel`.

## `DockBar.tsx`

Dock container, rendered once at the app-shell level (outside `AppList`'s
list). Reads `selectDockNames` (the dock partition of
`selectVisibleNames`, per
[frontend-picker-selector-contracts.md](../entities/frontend-picker-selector-contracts.md#store-selectorsts--favorites-partition-basenames-replication-list-surface-single-source)),
renders `null` when empty, otherwise one `AppTile` per name inside
`.dockBar`.

## `InitialsFallback.tsx`

Two exports: `initials(label)` — pure helper producing a 1–2 letter glyph
from an app label (first two chars of a single word, or first letters of
the first two words); and `InitialsFallback({label})` — a component
rendering just those initials, used as `AppTile`'s icon-load failure
fallback (passed as `DynamicIcon`'s `fallback` render function).

## `NoIconFallback.tsx`

`export const NoIconFallback = () => null` — the icon-load failure fallback
used by `AppRowStatus`'s `DynamicIcon` (list rows show nothing rather than
initials when a library icon fails to resolve; contrast with `AppTile`,
whose dock context uses `InitialsFallback` instead).

## `types.ts`

Shared type definitions for the zone. `PickerTarget` — `{name, field:
'version' | 'env' | 'branch'}`, the shape of `AppList`'s `openPicker` state
(only `'env'`/`'branch'` are actually opened from within this zone; `'version'`
is part of the same union used elsewhere in the app's picker-target model).
`AppRowProps` — the full prop contract accepted by `AppRow.tsx` (`name`,
`openPicker`/`setOpenPicker`, `longMenu`/`setLongMenu`, `dragSource`/
`setDragSource`, `hideStar?`). `GroupSectionSharedProps` — `{renderRows}`,
the contract each `../Groups/*Section` component receives from `AppList`.

## Cross-links

- Picker/combobox interaction contract, favorites/visibility selector
  pipeline, list-vs-dock surface partitioning, and env-picker column
  alignment: [frontend-picker-selector-contracts.md](../entities/frontend-picker-selector-contracts.md)
- Shared component/styling conventions: [frontend-component-contracts.md](../entities/frontend-component-contracts.md)
