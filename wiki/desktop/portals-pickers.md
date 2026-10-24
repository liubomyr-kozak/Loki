---
type: concept
title: Desktop portals, pickers, common controls, Groups, Header
timestamp: "2026-08-01T00:00:00Z"
---

# Desktop portals, pickers, common controls, Groups, Header

Current-state file-by-file map of desktop zone DZ4: `app/src/components/portals/*`,
`app/src/components/pickers/*`, `app/src/components/common/*`,
`app/src/components/Groups/*`, `app/src/components/Header/*`. This page is a
coverage/reference index over these directories; the *why* behind several of the
trickier contracts already lives in
[`frontend-picker-selector-contracts`](../entities/frontend-picker-selector-contracts.md)
(the `Picker`/`useCombobox` keyboard-nav, search-threshold, and `ChipListEditor`
material) and in
[`frontend-component-contracts`](../entities/frontend-component-contracts.md) (icon
resolution, row layout). Plugin surfacing conventions (`ControlDescriptor`, plugin
menu/toggle rendering) are the frontend half of the contract described in
[`plugin-agnostic-architecture`](../entities/plugin-agnostic-architecture.md).

Four families of UI live here:

- **`portals/`** — `document.body`-portaled overlay primitives (`Popover`) and the
  concrete popovers/menus built on it (context menu, group menu, icon picker,
  git-checkout confirm modal), plus the shared menu-row/menu-divider/inline-text-form
  atoms they compose from.
- **`pickers/`** — the combobox-style trigger+menu (`Picker`, env/branch variants),
  a checkbox-styled `ToggleSwitch`, and the numeric/z-index/string constants both
  `pickers/` and `portals/Popover.tsx` share.
- **`common/`** — cross-cutting, plugin-driven controls not owned by any one feature
  area; currently just `PluginSlot`, the per-app plugin action/toggle renderer.
- **`Groups/`** — the three group-section variants (custom groups, derived/version
  groups, the "Other" catch-all) and the shared collapsible `GroupHeader` they all
  render into.
- **`Header/`** — the app-bar: workspace title vs. settings-back state, search-bar
  swap, running-count summary/filter toggle, and the tmux sessions dropdown.

All portal/picker overlays share one positioning discipline: `usePopoverPosition`
(portals) or `useAnchoredPosition` (pickers) computes fixed-viewport coordinates
from a trigger rect, and `useOutsideClose` closes on an outside `mousedown` scoped
to the portal's own class name or ref. None of the files below re-implement
positioning or outside-click handling themselves.

## `portals/`

### `MenusContext.tsx` (root components/)
Shared React context managing open/closed state of all menu and picker portals.
Exports `MenusProvider` (wraps app tree, manages local state for `contextMenu`,
`groupMenu`, and `iconPicker` overlays), `useMenus()` hook (must be used within a
`MenusProvider`, throws if not), and three state type interfaces: `ContextMenuState`
(per-app right-click menu, tracks `appName` + portal position `x`/`y`),
`GroupMenuState` (per-group header menu, tracks `groupId` + position + optional
`derived`/`members` flags for pseudo-groups), and `IconPickerState` (app icon
selector, tracks `appName` + position). `MenusContextValue` holds all six API
methods: `open{ContextMenu,GroupMenu,IconPicker}(args, x, y)` and their close
counterparts. Attaches a window `keydown` listener (via `useEffect`) that closes
any open menu when `Escape` is pressed, with priority: `groupMenu` > `contextMenu`
> `iconPicker`. Consumed by `AppContextMenu`, `GroupMenu`, `IconPicker` (which
read state and trigger open), and `GroupHeader` (which calls `openGroupMenu` on
"Group actions" click).

### `Popover.tsx`
Shared portal shell. Exports `Popover` (renders `children` via
`ReactDOM.createPortal(..., document.body)` into a `div` taking `innerRef`/
`className`/`style`), `popoverStyle` (the fixed-position, bordered, z-indexed
(`POPOVER_Z_INDEX = 9999`) base style every popover-family component spreads into
its own `style`), and `popoverItem(color?)` (shared per-row flex/padding/hover style
factory, consumed by `MenuItem.tsx`). Every other file in `portals/` that renders an
overlay (`AppContextMenu`, `GroupMenu`, `IconPicker`) wraps its content in this
`Popover`, not a bespoke portal call.

### `MenuItem.tsx`
Single menu-row primitive. Props (`MenuItemProps`): `icon: ReactNode`,
`label: ReactNode`, `danger?`, `disabled?`, `truncate?` (default `true` — set
`false` for rows like "Start group"/"Stop group" that must not ellipsis), `onSelect`,
`ariaDisabled?`. Owns its own hover state (`useState`) to swap background between
`transparent` and `HOVER.normal`/`HOVER.danger`; stops click propagation before
calling `onSelect` and no-ops when `disabled`. Built on `popoverItem` from
`Popover.tsx`. Consumed by `AppContextMenu`, `GroupMenu`, `IconPicker`.

### `MenuDivider.tsx`
Three-line component: a 1px `background: var(--popover-border)` divider `div`
with fixed margin. No props. Used between logical groups of `MenuItem`s in
`AppContextMenu` and `GroupMenu`.

### `InlineTextForm.tsx`
Shared "rename/create" inline text input + Save/Cancel button pair rendered
inside a popover in place of its normal menu items. Props
(`InlineTextFormProps`): `initialValue`, `placeholder`, `submitLabel`, `onSubmit(value)`,
`onCancel()`. Owns local `value` state seeded from `initialValue`; `submit()` only
fires `onSubmit` with the **trimmed** value when non-empty. `Enter` submits,
`Escape` cancels; both the input's `onKeyDown` and the buttons' `onClick` call
`e.stopPropagation()` so the keystroke/click doesn't also reach the popover's
outside-close or parent row handlers. Used by `AppContextMenu` (new-group name) and
`GroupMenu` (rename, both real and derived groups).

### `IconFallback.tsx`
Zero-prop fallback icon (`ImageOff`, size 14, dimmed) passed as `DynamicIcon`'s
`fallback` in `IconPicker.tsx`. The file's own comment explains why it must stay
zero-prop: `DynamicIcon` spreads `...props` only onto the *resolved* icon, never
onto the fallback component, so a local wrapper is the only way to size/style the
placeholder glyph shown while an icon chunk is still loading or unresolved.

### `IconPicker.tsx`
Popover for setting/clearing an app's `icon` config field, searching
`lucide-react/dynamic`'s full `iconNames` list. State: `query` (search text, capped
result list via `RESULT_CAP = 60`). Because this component is mounted for the
app's entire lifetime (`App.tsx` always renders it, returning `null` when closed
rather than unmounting), a `useState` initializer can't reseed `query` per app
session — instead a `useEffect` keyed on `iconPicker?.appName` (`openedFor`) resets
`query` on every *open*, deliberately excluding `cfg` from its dependency array
(commented) so a config reload mid-typing doesn't clobber the search box. `commit(icon)`
calls `api.patchApp(appName, { icon })`, dispatches `reloadConfig()`, then closes.
Renders an optional "Clear icon" `MenuItem` (danger, only when `cfg?.icon` is set),
a search `<input>`, then one `MenuItem` per matched icon name using `DynamicIcon`
with `IconFallback` as its fallback. Positioned via `usePopoverPosition(..., 'clamp')`;
closes via `useOutsideClose` scoped to `.iconPickerPortal`.

**Known pre-existing issue**: `npx tsc --noEmit` currently reports one error
in this file (a `DynamicIcon` call fed an unnarrowed `cfg.icon` string type).
Confirmed via `git stash` bisection during an unrelated plugin-system
fix-batch to predate that batch entirely (isolating this file alone reverts
to a clean compile) — it's leftover WIP from an in-progress icon-related
redesign, not caused by or related to any plugin-system change.

### `AppContextMenu.tsx`
Per-app right-click/context menu: group membership (create/add/remove) plus
plugin actions surfaced with `surface === 'menu'`. Reads `contextMenu` /
`closeContextMenu` from `MenusContext`, `groups`, `plugins.list`, `plugins.descriptors`,
`plugins.runningActions`, and `apps.busy[appName]` from the store. Local state:
`cmShowInput` (showing the "New group…" `InlineTextForm` instead of the menu list)
and `confirmingId` (which plugin action, if any, is in its post-click confirm
state, auto-reset after `CONFIRM_TIMEOUT_MS = 3000` via a tracked timeout ref
cleared on unmount). Menu rows, top to bottom: "New group…"; one "Add to `<group>`"
row per group the app isn't in; a divider + one danger "Remove from `<group>`" row
per group the app *is* in (only if any exist); a divider + one row per visible
menu-surface plugin control, resolving `desc.icon` through `ICON_MAP`/`FALLBACK_ICON`
(`lib/pluginIcons.ts`), disabling on `desc.disabledHint` or busy state, and — when
`desc.confirm` is set — requiring a second click within the timeout (label swaps to
`desc.confirm` text) before dispatching `invokePlugin`.

Below those, a **"General"** section (the label reads "General", not
"Settings") holds the per-app rows: a "Favorite" toggle whose `Star` glyph is
always tinted `var(--star-active)` and switches only its `fill` between
`currentColor` and `none` (previously the whole icon went untinted when
off, which read as a disabled control rather than an unchecked one); an
**"Open in terminal"** row (`SquareTerminal` icon) that calls the
`openTerminal(appName)` exported from `AppList/TerminalButton.tsx` — the same
implementation the row's own terminal button uses, not a second copy — and
then closes the menu; and the app-settings row. `.organizeRow` itself gained
a real hover affordance in `styles.css` (6px horizontal padding, 6px radius,
`--popover-item-hover` background on `:hover`) so these rows highlight like
`MenuItem`s do. Positioned via
`usePopoverPosition(..., 'clamp')`; closes via `useOutsideClose` scoped to
`.contextMenuPortal`, which also resets both local state flags.

### `GroupMenu.tsx`
Per-group-header menu: start/stop, rename, delete — for both real (user-created,
`groups.groups[groupId]`) and **derived** groups (version/"Other" pseudo-groups
identified by `groupMenu.derived`, whose membership is a computed app-name list
rather than a stored `GroupState`). Reads `groupMenu`/`closeGroupMenu` from
`MenusContext`, plus `groups`, `apps.config`, `apps.apps`. Local state: `gmRenaming`
(showing the rename `InlineTextForm`). For derived groups, `derivedMembers` falls
back to filtering `config.apps` by `groups.includes(groupMenu.groupId)` when
`groupMenu.members` isn't supplied. Rename/delete on a derived group don't touch a
`GroupState` (there isn't one) — `applyToDerivedMembers` instead PATCHes every
member app's `groups` array via `Promise.allSettled(api.patchApp(...))`, then
dispatches `reloadConfig()` regardless of outcome, and on partial failure calls
`setCfgMsg` naming the apps that failed so config stays the source of truth and the
user is told to retry rather than the UI silently reflecting an inconsistent
optimistic state. Real groups go through `renameGroup`/`deleteGroup`/`startGroup`/
`stopGroup` (store actions); derived groups use `startApps`/`stopApps` (`groupOps`)
against the member list directly. Positioned via `usePopoverPosition(..., 'anchorLeft')`;
closes via `useOutsideClose` scoped to `.groupMenuPortal`.

### `GitCheckoutConfirm.tsx`
Modal (not popover-positioned — a centered `document.body`-portaled overlay with
`.modalOverlay`/`.modalCard`) for confirming a git branch checkout or reporting an
unresolved conflict. Props (`GitCheckoutConfirmProps`): `variant: 'confirm' |
'conflict'`, `title`, `warnings?` (confirm-variant only, list of plain warning
rows — e.g. shared-repo-path warnings from `makeSelectAppsSharingRepoPath`),
`files?`/`message?` (conflict-variant only — conflicted file list and message,
defaulting to `DEFAULT_CONFLICT_MESSAGE`), `onConfirm?`, `onCancel`. `confirm`
variant renders Cancel/Confirm buttons; `conflict` variant renders a single OK
button (there's nothing to confirm — just an acknowledgement). Clicking the
overlay backdrop calls `onCancel`; clicking the card itself stops propagation so
it doesn't also dismiss.

## `pickers/`

### `constants.ts`
Shared numeric/string constants for the picker+popover family: `DROP_STASH_ITEM`
(the sentinel action-item string filtered specially by `useCombobox`/`Picker`),
`SEARCH_THRESHOLD = 9` (option count at/above which `Picker` renders a search
input — see `frontend-picker-selector-contracts`), `ROW_HEIGHT`/`MAX_VISIBLE_ROWS`/
`MENU_MIN_WIDTH`/`MENU_MAX_WIDTH`/`VIEWPORT_MARGIN` (menu sizing/positioning
inputs), and `PICKER_MENU_Z_INDEX = 9999` — pinned, per an inline comment, to match
`popoverStyle`'s z-index in `portals/Popover.tsx` because the picker menu is
portaled to the same `document.body` layer, not a locally-scoped stacking context.

### `Picker.tsx`
The shared combobox trigger+menu for the env picker (`variant: 'env'`) and git
branch picker (`variant: 'branch'`). Props (`PickerProps`): `value`, `options`,
`open`, `disabled?`, `onToggle`, `onSelect`, `variant`, `badges?`
(`{dirty?, stashAvailable?, conflict?}` — rendered as small trigger-chip dots),
`loading?`/`errorText?` (branch-variant only). Purely a rendering shell: all
interaction state (query, filtered options, active index, ARIA ids) comes from
`useCombobox` (`hooks/useCombobox.ts`); positioning comes from `useAnchoredPosition`.
Renders the trigger `<button>` (branch shows a `GitBranch` icon, env shows `Globe`)
and, when `open`, a `Popover`-wrapped listbox: an optional search `<input>` (only
when `cb.searchEnabled`), then one row per `cb.filtered` option (a `pickerSeparator`
inserted immediately before the `DROP_STASH_ITEM` row), then one of three
mutually-exclusive empty-state rows (`loading` / `errorText` / "No matches") — see
`frontend-picker-selector-contracts` for the full priority-order and ARIA-ownership
contract. `onClose` reuses the existing `onToggle` handler via a minimal
`{ stopPropagation: () => {} }` event stub rather than a dedicated close prop,
since `onToggle`'s only caller (`AppRow.tsx`) always calls `stopPropagation()` and
the toggle handler is idempotently-closing.

### `ToggleSwitch.tsx`
Checkbox-styled label/switch control. Props (`ToggleSwitchProps`): `label`,
`title`, `checked`, `disabled?`, `unmanaged` (adds an `.unmanaged` class variant —
visually distinguishes a toggle whose backing flag isn't under this tool's
management), `onChange(checked)`. A plain `<label className="switch">` wrapping a
real `<input type="checkbox">` (for native accessibility/keyboard behavior) plus
`.slider`/`.switchLabel` decoration spans. Consumed by `common/PluginSlot.tsx` for
`desc.action === 'toggle'` plugin controls.

## `common/`

### `PluginSlot.tsx`
The per-app renderer for a single plugin's `ControlDescriptor` (`../../api`),
shared across every surface that shows plugin controls inline (as opposed to
`AppContextMenu`'s `surface: 'menu'` rendering). Props (`PluginSlotProps`):
`pluginId`, `desc: ControlDescriptor`, `appName`, `busy?`, `iconSize`. Branches on
`desc.action`: `'toggle'` renders `pickers/ToggleSwitch` wired to dispatch
`invokePlugin({pluginId, appName, input: {checked}})` on change; anything else
renders a `<button>` resolving `desc.icon` via `ICON_MAP`/`FALLBACK_ICON`
(`lib/pluginIcons.ts`), with the same two-click confirm pattern as
`AppContextMenu`'s plugin rows (local `confirmingId` state, 3000ms auto-reset
timer cleared on unmount, label swaps to `desc.confirm` while confirming).
`disabled = !!desc.disabledHint || !!busy` in both branches.

## `Groups/`

### `GroupHeader.tsx`
Shared collapsible section header used by all three `Groups/` section
components below. Props (`GroupHeaderProps`): `groupId`, `name`, `members: string[]`,
`collapsed`, `onToggleCollapse`, `derived?` (default `false` — controls whether
start/stop dispatch `startGroup`/`stopGroup` (real group id) vs. `startApps`/
`stopApps` (raw member list) from `store/groupOps`), `readOnly?` (default `false` —
suppresses the start/stop/group-actions button row entirely; used only by
`OtherSection`, since "Other" isn't a real or manageable group). Renders a chevron
(rotates 90° when expanded), the group name, a running-count pill
(`{running}/{total}` when any member is running and not `readOnly`, else just the
total), and — unless `readOnly` — a conditional Start or Stop pill button plus a
"Group actions" `MoreVertical` button that opens `GroupMenu` via `useMenus()`'s
`openGroupMenu(groupId, x, y, {derived, members})`, or closes it if already open for
this group. The whole header row's `onClick` toggles collapse; the action buttons
stop propagation so clicking them doesn't also toggle collapse.

### `GroupSection.tsx`
Renders every user-created group (`state.groups.groups`) that has at least one
member still present in config, additionally filtered by `filterRunning` (hides
groups with zero running members when the running-only toggle is on — the file's
own filter, not routed through `selectVisibleNames`, since group membership is a
different axis than search/sort). For each group: resolves `members` (config-present
apps in the group), `rowMembers` (further filtered to `selectListNameSet` —
list-surface apps only, dock apps excluded from the group card), tracks expand/
collapse via `state.ui.collapsedGroups` + `toggleCollapsedGroup`, and renders a
`GroupHeader` plus (`renderRows(rowMembers, true)` — the `GroupSectionSharedProps`
render-prop from `components/AppList/types`) a `.groupCard` when expanded and
non-empty.

### `GroupSection.tsx`
Renders **derived** group sections (`selectGroupSections` — version-based/other
computed groupings, not user-created), one `GroupHeader` (`derived`) per section
label, filtered to list-surface names (`selectListNameSet`) and non-empty
after that filter. Simpler than `GroupSection`: no `filterRunning`
re-filtering here because `selectGroupSections` already composes the shared
filter pipeline described in `frontend-picker-selector-contracts`
(`selectSortedAll` → filter → per-section split).

### `OtherSection.tsx`
Renders the fixed "Other" catch-all section (`OTHER_ID` from `lib/constants`) for
apps not claimed by any group section — always `readOnly` and `derived` on its
`GroupHeader` (no start/stop/group-actions, since "Other" isn't a real group).
Builds its member list from `selectSortedAll` filtered to `selectListNameSet`,
then applies `makeSectionRows({config, apps, searchQuery, filterRunning})` — the
same shared running+search AND-composition factory `GroupSection`/
`GroupSection`'s sources ultimately trace back to (see
`frontend-picker-selector-contracts`'s `selectGroupSections`/`makeSectionRows`
section) — to get the actually-visible row list for the current filter/search
state.

## `Header/`

### `Header.tsx`
Top app-bar shell. Props (`HeaderProps`): `searchInputRef` (forwarded to
`SearchBar`, so `App.tsx`/keyboard-shortcut code can focus it programmatically).
Reads `state.ui.viewMode` and `state.ui.searchActive`. Three mutually-exclusive
render states: `viewMode === 'settings'` shows a clickable "← Settings" back-row
(`onBackToMenu()` usecase, whole header becomes a pointer-cursor click target);
else `searchActive` shows `SearchBar` in place of the title; else shows the
workspace title (`WORKSPACE_NAME` from `lib/constants`) plus `RunningSummary`,
`SessionsDropdown`, and a settings-gear button (`⬡`, dispatches
`onSettingsOpened()`).

### `SearchBar.tsx`
Inline search input swapped in for the title/summary row when search is active.
Props (`SearchBarProps`): `searchInputRef`. Controlled by `state.ui.searchQuery`,
dispatching `setSearchQuery` on change; a trailing `×` button dispatches
`clearSearch()`. No local state — pure controlled input over the store.

### `RunningSummary.tsx`
Clickable `{running}/{total} running` summary pill. Reads `selectRunningCount`/
`selectAppCount` and `state.ui.filterRunning`; renders nothing (`null`) when there
are zero apps total. Clicking it dispatches `toggleFilterRunning()` — this is the
one and only trigger for the running-only filter consumed throughout
`selectVisibleNames`/`Groups/*` (see `frontend-picker-selector-contracts`). Text
color highlights green when the filter is active.

### `SessionsDropdown.tsx`
tmux-session list dropdown in the header, gated on `state.sessions.sessions`
being non-empty (renders `null` otherwise). Toggle button (`TerminalSquare` icon)
dispatches `fetchSessions()` on open and `setShowSessions`; closes via
`useOutsideClose(showSessions, ...)` (no scoping selector/ref — closes on any
outside mousedown). Each session row shows a live/dead dot, label + optional port,
an "open in terminal" button (`openSessionTerminal` → `api.getAttachCommand` →
`openInTerminal` from `lib/tauri`, disabled when the session has no associated
managed `appName` — unmanaged sessions can't be attached to), and a stop button
(dispatches `stopApp`, then `refreshAll()` + `fetchSessions()` to resync both app
status and the session list after stopping). The whole dropdown wrapper stops
click propagation so opening it doesn't also trigger whatever it's rendered
inside.

## Coverage

All 21 files in scope are documented above: 10 in `portals/` (including
`MenusContext.tsx` at root `components/`), 3 in `pickers/`, 1 in `common/`, 4 in
`Groups/`, 4 in `Header/`.
