---
type: entity
title: Frontend picker/selector contracts
timestamp: "2026-07-23T19:27:47Z"
---

# Frontend picker/selector contracts

# Frontend picker/selector contracts

## Sort-vs-filter composition in `store/selectors.ts`

The visible-apps pipeline is deliberately split into a **sort** stage and a
**filter** stage, and it's important not to blur the two:

- `selectSortedAll` (favorites-pinned ordering) is a **sort-only** concern:
  it partitions the order-sorted app names into `[favorites..., non-favorites...]`,
  preserving `sortByOrder`'s relative order within each partition. Nothing is
  excluded here — every app name that exists in config comes out the other
  side, just reordered.
- `selectVisibleNames` is the **filter** stage, and composes two predicates
  with **AND**, applied in sequence to `selectSortedAll`'s output:
  1. `filterRunning` (`s.ui.filterRunning`): keep only apps where `isRunning(apps[n])`.
  2. `searchQuery` (`s.ui.searchQuery`): keep only apps whose config label
     case-insensitively includes the query.

  ```ts
  const filteredNames = filterRunning ? sortedAll.filter((n) => isRunning(apps[n])) : sortedAll
  const visibleNames = searchQuery
    ? filteredNames.filter((n) => config.apps[n].label.toLowerCase().includes(searchQuery.toLowerCase()))
    : filteredNames
  ```

  Both filters run over the **same** `filteredNames` chain — search narrows
  whatever the running-filter already narrowed, rather than the two filters
  being computed independently and unioned/intersected separately. This is
  the fixed bug: previously the running-filter and search filter could be
  computed against different base lists in different call sites, so toggling
  "running only" could silently reset/ignore an active search (or vice
  versa). Now there is exactly one composition path, and every downstream
  consumer of "what's visible" goes through it.
- `selectListNames` and `selectDockNames` **partition** `selectVisibleNames`'s
  already-filtered output by resolved surface (`selectListNameSet`, a `Set`
  built once from `config.apps[n].surface === 'list'` — see its own comment
  about being the single source of truth for "is this a list-surface app",
  called out because a prior regression came from different call sites
  re-testing `surface === 'list'` independently and drifting). The dock is
  explicitly **not** exempt from filterRunning/search — it obeys the same
  visibility filters as the list, this call just splits the filtered result
  by surface, it never re-derives or bypasses it.
- `selectGroupSections` and the `makeSectionRows` factory (used for custom
  group sections, "Other" section, etc.) apply the **identical** AND
  composition (`filterRunning` then `searchQuery`, same order, same
  `.toLowerCase().includes()` comparison) over each section's member list —
  so a custom-group section and the flat list never diverge on what counts
  as "visible" for a given search+filter combination. `sectionId` in
  `SectionRowsCtx`/`makeSectionRows` is otherwise unused: per-section
  collapse tracked by `sectionId` was removed as dead code; collapse state
  now lives entirely in `collapsedGroups` at the call site.
- `effectiveRepoPath()` / `makeSelectAppsSharingRepoPath()` are a separate,
  read-only concern (warning before a git checkout that other apps share the
  same effective repo) — it mirrors the backend's `resolveEffective`
  precedence (`env.repoPath -> version.repoPath -> app.repoPath`) client-side
  because `AppStatus` doesn't carry a resolved `repoPath` field. It's a
  **factory**, not a single shared selector: each app row must call
  `useMemo(makeSelectAppsSharingRepoPath, [])` to get its own memoized
  instance, since a single shared `createSelector` instance has one memo slot
  and would thrash across every row's differing `appName` argument on every
  render, never actually memoizing.

## The `Picker` contract (`components/pickers/Picker.tsx`)

`Picker` is the shared combobox trigger+menu used for both the environment
picker (`variant: 'env'`) and the git branch picker (`variant: 'branch'`).
It is a thin rendering shell around the `useCombobox` hook
(`hooks/useCombobox.ts`), which owns all interaction state (filter text,
filtered options, keyboard-driven highlight index, ARIA ids) with no DOM/
portal code of its own.

- **Loading/error rows**: only meaningful for the branch variant (env options
  come synchronously from config, not a fetch). When the menu is open and
  `cb.filtered.length === 0`, exactly one of three empty-state rows renders,
  in this priority order: `loading` → "Loading branches…"; else `errorText`
  → the error text; else (if the user has typed a non-empty query) → "No
  matches". `loading`/`errorText` are plain optional props threaded down
  from whatever branch-fetch thunk owns that state — `Picker` itself has no
  fetch logic.
- **Keyboard nav** (`useCombobox`): `ArrowDown`/`ArrowUp` move the highlighted
  index, clamped (not wrapped) to `[0, filtered.length - 1]`; `Home`/`End`
  jump to the first/last row; `Enter` selects the highlighted option (no-op
  if the filtered list is empty); `Escape` closes the menu. Typing a
  printable character (`key.length === 1`, no ctrl/meta) appends to `query`
  **only when `!searchEnabled`** (`useCombobox.ts`'s `onKeyDown` default
  case) — when search is enabled, the controlled `<input>`'s own `onChange`
  is the sole writer of `query`; the hook's `onKeyDown` still fires on that
  input (bubbling), but no longer also appends, since both writers acting on
  the same keystroke used to double up every character (each keypress landed
  twice — append-in-`onKeyDown` plus the input's own `onChange` with the
  character already inserted). Same split for `Backspace`: the hook slices
  its own `query` only when `!searchEnabled` — under `searchEnabled` the
  input's native `onChange` already handles it. Re-opening the menu resets
  the query and seeds
  `activeIndex` at the **current value's** position in the freshly-filtered
  list (falling back to `0` if the value isn't present), not always `0` —
  so reopening a picker highlights what's already selected. `aria-activedescendant`
  has exactly one owner at a time: the search `<input>` when `searchEnabled`,
  otherwise the listbox `<div>` itself (which then takes DOM focus and its
  own `onKeyDown` on open, per the `useEffect` in `Picker.tsx`).
- **Search auto-enable threshold**: `searchEnabled = options.length >=
  SEARCH_THRESHOLD` (`components/pickers/constants.ts`, `SEARCH_THRESHOLD = 9`).
  Below the threshold, no `<input>` is rendered in the DOM at all — the
  listbox container takes focus directly and handles keyboard nav itself
  (`onKeyDown` moves to the `.pickerMenu` div, not an absent input). At or
  above the threshold, the search `<input>` renders (`autoFocus`) and owns
  keyboard nav instead. `filterOptions()` is the single owner of the "action
  item" concept (e.g. `DROP_STASH_ITEM = 'Drop stash…'`, from `constants.ts`):
  it is case-insensitive-substring-filterable like any other option but is
  never excluded by an empty/no-match query and always sorts last —
  keyboard-reachable at the end of the list, separated visually by a
  `.pickerSeparator` in `Picker.tsx`. No other code branches on
  `variant === 'env'` vs `'branch'` for filtering — that split lives solely
  inside `filterOptions`/`isActionItem`.
- Positioning is delegated to `useAnchoredPosition` (fixed-viewport-coordinate
  portal placement via `Popover`), separate from the interaction hook.

## `ChipListEditor` subsumes Depends/Groups/Plugins

`components/Dashboard/ChipListEditor.tsx` is the single shared
chip-list-plus-searchable-add-popover implementation behind three thin
wrapper components — `DependsEditor.tsx`, `GroupsEditor.tsx`,
`PluginsEditor.tsx` — each now 28–36 lines, versus `ChipListEditor` itself at
~184 lines. Each wrapper only computes its own `addable` list and `onAdd`/
`onRemove` closures over its domain data, then hands everything else to
`ChipListEditor`.

**Props** (`ChipListEditorProps`):

| Prop | Purpose |
|---|---|
| `selectedKeys: string[]` | currently-selected keys, display order |
| `chipLabel: (key) => string` | label lookup for a selected chip |
| `addable: ChipOption[]` (`{ key, label }`) | options offered in the add-popover, already excludes selected |
| `onAdd(key)` / `onRemove(key)` | add a closed-set key or freshly-typed value (when `allowCreate`) / remove a selected key |
| `addButtonLabel`, `searchPlaceholder` | button/input copy |
| `allowCreate?` | **GroupsEditor only** — type-to-create an unlisted value |
| `hasExactMatch?(query)` | **GroupsEditor only** — suppresses the "Create …" row when the typed query already matches an existing option exactly (case-sensitive, untrimmed — preserved verbatim from the pre-extraction behavior) |
| `createLabel?(query)` | **GroupsEditor only** — render text for the create row, e.g. `` `Create "${q}"` `` |
| `hideAddWhenEmpty?` | **DependsEditor/PluginsEditor** — hide the add button entirely when nothing is addable and `!allowCreate` |

`DependsEditor` and `PluginsEditor` are closed-set editors: `hideAddWhenEmpty`,
no `allowCreate`. `GroupsEditor` is the one open editor: `allowCreate` plus
`hasExactMatch`/`createLabel`, no `hideAddWhenEmpty` (there's always the
"create" affordance even with zero existing groups).

**Outside-close via ref, not a shared class selector**: `ChipListEditor`
calls `useOutsideClose(open, () => setOpen(false), { ref: wrapRef, event:
'mousedown' })` scoped to its own `wrapRef` — deliberately **not** a
class-name-based outside-close. `DependsEditor`, `GroupsEditor`, and
`PluginsEditor` can all be rendered simultaneously and all share the same
root class name (`.dependsEditor`, kept for style continuity across the
merge). A class-selector-based outside-close would match a co-rendered
**sibling** editor's root element and could fail to close a popover on a
click that lands in a neighboring editor. Scoping to `wrapRef` — this
instance's own DOM node — restores the original per-editor
`wrapRef.current.contains(target)` behavior each editor had before they were
merged into one shared component.

Also notable: `usePopoverPosition`/`useCombobox` (the hooks backing
`Picker`) are **deliberately not reused** inside `ChipListEditor` — it has
its own in-flow flip positioning (`openUp` state, computed from
`wrapRef`'s bounding rect vs. viewport height) rather than `Picker`'s
portaled fixed-coordinate placement, and its own keyboard model (adds
`Home`/`End`-free Arrow nav plus the create-row Enter fallback) rather than
`useCombobox`'s. The two pickers intentionally diverge in positioning
strategy and keyboard behavior; they are not meant to converge into one
shared hook.

## `ChipListEditor` create-row commit: untrimmed vs trimmed query

Two different code paths in `ChipListEditor.tsx` intentionally disagree on
whitespace trimming, and the asymmetry is preserved on purpose (not a bug):

- The **create row** (`commit(key, isCreate=true)`, both mouse-select on the
  "Create …" row and the `filtered[activeIndex]` Enter path) passes the
  **raw, untrimmed** `query` to `onAdd`. This matches `GroupsEditor`'s
  original `handleSelect(query)` behavior byte-for-byte.
- The **empty-rows Enter fallback** (`rows.length === 0` branch in the
  keydown handler) is the only path that calls `onAdd(query.trim())` —
  mirroring `GroupsEditor`'s original `if (filtered.length === 0) { if
  (query.trim()) add(query.trim()) }`.

Both behaviors were carried over verbatim from the pre-extraction
`GroupsEditor` implementation; unifying them to always-trim or always-raw
would be a silent behavior change for whichever path currently differs.

Closed-set editors (`DependsEditor`/`PluginsEditor`, `allowCreate=false`)
no-op on Enter when there are zero rows — the popover stays open rather
than closing or creating anything, matching their original pre-extraction
Enter-with-no-matches behavior.

## `GroupsEditor` is a structural fork of `DependsEditor`

`GroupsEditor.tsx` shares the same chip+popover+keyboard-nav shape as
`DependsEditor.tsx` (both now built on `ChipListEditor`), but expresses an
**open** type-to-create semantics via `allowCreate`/`hasExactMatch`/
`createLabel` rather than being a second hand-rolled component. `DependsEditor`
and `PluginsEditor` stay closed-set (`hideAddWhenEmpty`, no `allowCreate`).

## `useCombobox` — interaction state machine and env/branch split ownership

`hooks/useCombobox.ts` is the **single owner** of the env (no-search) vs.
branch (search) split: no other module is allowed to branch on
`variant === 'env'` for filtering behavior — that logic lives entirely in
`filterOptions()`/`isActionItem` inside this hook. It is pure interaction
state (filter text, filtered options, keyboard-driven highlight index, ARIA
ids, scroll-into-view signal) with no DOM/portal code of its own.

`filterOptions()` does a case-insensitive substring filter on non-action
options; the action item (e.g. `DROP_STASH_ITEM`) is never excluded by the
filter and always sorts last, staying keyboard-reachable at the end of the
list.

On menu open (`open` transitioning `false -> true`), the hook resets the
query and seeds `activeIndex` at the **current value's** position in the
freshly-filtered list, falling back to `0` if the value isn't present —
reopening a picker highlights what's already selected instead of always
resetting to the top.

## `Picker` — branch-variant feedback, close stubbing, and single-owner ARIA

Additional contract details for `components/pickers/Picker.tsx` beyond the
core keyboard-nav/search-threshold behavior described above:

- **Loading/error props are branch-variant only.** The env variant has no
  fetch — its options come synchronously from config — so `loading`/
  `errorText` are only ever populated by whatever branch-fetch thunk owns
  that state; `Picker` itself has no fetch logic and doesn't care which
  variant is active when reading these props.
- **`onClose` reuses the existing `onToggle` close path via a minimal event
  stub.** `onToggle`'s only caller (`AppRow.tsx`) calls `e.stopPropagation()`
  on the event it receives, and the toggle handler is idempotent (it closes
  when already open) — so `onClose` builds a stub object
  (`{ stopPropagation: () => {} } as React.MouseEvent`) satisfying that call
  shape instead of adding a new dedicated close prop.
- **No search input in the DOM when `!searchEnabled`.** Keyboard nav still
  needs a focus target in that case, so the listbox container itself
  (`cb.listRef`) takes focus on open via a dedicated effect.
- **`aria-activedescendant` has exactly one owner at a time**: the search
  `<input>` when `searchEnabled` is true, otherwise the listbox `<div>`
  itself — never both, and the owner must be the currently-focused element.
  `inputActiveDescendant`/`listboxActiveDescendant` are computed as mutually
  exclusive based on `open && !cb.searchEnabled`.

## Env-picker column alignment: `AppRowPickers.tsx`

Each field (env, branch, toggle) in the row's meta area renders inside a
`.rowMetaCell` even when the current app has nothing to show there (e.g. no
environments configured) — an empty `.rowMetaCell` is still emitted rather
than omitted. This keeps the grid's fixed env column aligned across every
row in a group; omitting the cell entirely would collapse and shift the
branch/toggle columns left for that row relative to its neighbors.

## `SelectorRow` placeholder value

When a `SelectorRow` field has no persisted value yet, it shows the first
*detected* candidate as an uncommitted, visually grey placeholder-look
selection (`isPlaceholder = value == null`, `displayValue = value ??
candidates[0]?.path ?? ''`) rather than rendering a real committed value —
distinguishing "nothing chosen yet, here's what we'd default to" from an
actual saved selection.

## Environment `enabled` flag hides from the picker, not the config

Environments have no stored `enabled` flag any more — environments are derived from the repo's `package.json` scripts filtered by `global.environmentFilterRegex` / `app.environmentFilter`;
setting it to `false` (via the dashboard checkbox) hides that environment
from the compact popover `Picker` without deleting it from config. Frontend
env lists render exactly the matched script names (see
`AppTile.tsx`, `useAppRow.ts`) to implement this.

## `ExecutionSection` roving-tabindex nav index space

The provider-card `ref` array and the roving-tabindex keyboard nav
(`selectableIndices`/`moveSelection`) share **one index space over the full,
unfiltered `providers` list**. Unavailable provider cards stay in the array
with `tabIndex=-1` and are skipped by `selectableIndices`
(`providers.map((p,i) => p.available ? i : -1).filter(i => i !== -1)`), but
the underlying array is never itself filtered down. Filtering it would shift
indices out from under `selectableIndices`/`moveSelection`, desyncing the
ref array from the rendered card positions. Rendering separately collapses
unavailable providers into a single text line, but that's a display-only
concern layered on top of the same unfiltered index space.

## Positioning: `anchorBelowOrAbove` (`lib/position.ts`)

Pure trigger-anchored flip/shift positioning shared by pickers/popovers:
places the menu below the trigger by default, flips it above when there is
more room above than below and the desired height can't fit below, and
shifts it horizontally to stay within viewport margins. Takes no DOM/window
reads itself — the caller supplies the trigger rect and viewport size, which
keeps the algorithm pure and testable.

## `store/selectors.ts` — favorites partition, baseNames replication, list-surface single source

- **`selectSortedAll`** pins favorites first via a **stable partition**: it
  walks the order-sorted app names once and buckets each into a `favs` or
  `rest` array (`favSet.has(n) ? favs : rest`), then concatenates
  `[...favs, ...rest]`. This preserves `sortByOrder`'s relative ordering
  within each partition and is purely a sort concern — nothing is excluded
  here, unlike `selectVisibleNames`'s filter stage described above.
- **`selectVisibleNames`** replicates App.tsx's original `baseNames ->
  filteredNames -> visibleNames` chain verbatim as a named selector chain,
  now built on `selectSortedAll` instead of a separately-sorted favorites
  list — favorites no longer filter anything themselves, they only affect
  ordering via `selectSortedAll`.
- **`selectListNameSet`** is the single source of truth for "is this app a
  list-surface app": every consumer that needs that fact must go through
  this memoized `Set` rather than re-testing `config.apps[n].surface ===
  'list'` itself. That re-testing duplication is exactly what caused a prior
  regression (see `GroupSection`/`OtherSection`/`AllSection`
  history) — different call sites drifted on the predicate. `surface` is
  guaranteed present post-`loadConfig`, so no default-fallback is applied
  here.

## `makeSelectAppsSharingRepoPath` — shared-repo warning

`makeSelectAppsSharingRepoPath` returns other app names whose EFFECTIVE repoPath (version/env-override aware, via `effectiveRepoPath`) matches the target app's — used to warn, before a git checkout, that a shared repo is about to be affected for other apps too. Derived purely from `state.apps.config` (already loaded); the git REST contract has a fixed set of endpoints and none for shared-repo scanning.

