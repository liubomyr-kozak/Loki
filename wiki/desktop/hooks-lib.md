---
type: concept
title: Desktop hooks, lib, and app entry (DZ6)
timestamp: "2026-07-30T12:00:00Z"
---

# Desktop hooks, lib, and app entry (DZ6)

Custom React hooks (`app/src/hooks/*.ts`), standalone lib helpers
(`app/src/lib/*.ts` — Tauri bridge, dashboard-window animation, app-icon
resolution, position math, grouping/ordering, key sanitizing, plugin icon
map, clipboard, small constants), the typed HTTP client (`app/src/api.ts`),
and the two app-entry files (`app/src/App.tsx`, `app/src/main.tsx`).
This page covers every file in that set (DZ6 zone) at its current state —
no history, no pre-refactor comparison. For component-level contracts built
on top of these (`useAppRow`, `useEnvironmentSettings`, Settings row
components, group/menu components, `store/groupOps.ts`) see
[`frontend-component-contracts`](../entities/frontend-component-contracts.md).
For the full HTTP endpoint table `api.ts` implements, see
[`api-client`](api-client.md). For the Rust/Tauri commands the `lib/tauri.ts`
wrappers invoke, see [`tauri-shell`](tauri-shell.md).

## Hooks (`app/src/hooks/`)

### `useAnchoredPosition.ts`
Positions a dropdown/menu relative to a trigger element, choosing
above-vs-below placement and clamping to viewport. Exports
`useAnchoredPosition(triggerRef, menuRef, open, deps): AnchoredPos | null`.
Delegates the actual geometry to `lib/position.ts`'s `anchorBelowOrAbove`,
using sizing constants from `components/pickers/constants` (`MAX_VISIBLE_ROWS`,
`MENU_MAX_WIDTH`, `MENU_MIN_WIDTH`, `ROW_HEIGHT`, `VIEWPORT_MARGIN`).
Recomputes in a `useLayoutEffect` on open, and re-subscribes to `resize`/
`scroll` (capture phase) while open so the menu tracks a moving/resizing
trigger. Returns `null` when closed or the trigger isn't mounted, signaling
"don't render the menu yet." Relationship: consumed by picker/combobox-style
menu components; pairs with `useCombobox` for keyboard-driven pickers.

### `useAutostart.ts`
Bridges the Redux `ui.autostart` flag to the native login-item registration.
Exports `useAutostart(): { autostart: boolean; toggle: () => Promise<void> }`.
On mount, calls `isAutostartEnabled()` (from `lib/tauri.ts`) and dispatches
`setAutostart` into `store/slices/uiSlice`; on `toggle()`, calls
`enableAutostart()`/`disableAutostart()` then re-reads and re-dispatches the
authoritative state rather than optimistically flipping the boolean — the
native OS setting is the source of truth, not the toggle click. Errors are
caught and logged (`console.error`), falling back to `false` on the initial
read. Relationship: only consumer-facing entry point for autostart in the UI;
the actual Tauri plugin calls live in `lib/tauri.ts`.

### `useCombobox.ts`
A full keyboard-driven combobox/listbox controller shared across the app's
various pickers (env/branch/version selectors). Exports `UseComboboxArgs`,
`UseCombobox`, and `useCombobox(args): UseCombobox`. Owns: free-text `query`
state, `activeIndex`, a locally-computed `filtered` list (normal matches
first, "action items" — e.g. an "Add new…" entry identified via
`isActionItem`— pushed to the end regardless of query match), ARIA wiring
(`listboxId`, `optionId(i)`, `activeId`) for a `role="listbox"` pattern, and
`onKeyDown` handling Arrow keys/Home/End/Enter/Escape plus type-to-search
(single printable keys append to `query` and refocus the search input once
`searchEnabled` — gated by `options.length >= searchThreshold` (default
`SEARCH_THRESHOLD` from `components/pickers/constants`)). `registerItem(el, i)`
is how row components register their DOM node for `scrollIntoView({block:
'nearest'})` on `activeIndex` change. On reopen (`open` transitions false→true),
resets `query` and seeks `activeIndex` to the current `value`'s position in
the fresh (unfiltered) list. Contract: purely local UI state — no Redux, no
network; parent owns `value`/`onSelect`/`onClose` and the actual option list.

### `useFolderDrop.ts`
Wires OS drag-and-drop of a folder onto the app window (project add-by-drop
flow). Exports `useFolderDrop(): { dropPath: string | null; dragging:
boolean; clear: () => void }`. Dynamically imports
`@tauri-apps/api/webview` and subscribes to `getCurrentWebview()
.onDragDropEvent(...)`; `enter`/`over` set `dragging=true`, `leave` clears it,
`drop` clears dragging and sets `dropPath` to the first path in the event
payload. The dynamic-import + `.catch(() => {})` guard is the same
no-op-outside-Tauri pattern used throughout `lib/tauri.ts` (documented as a
shared idiom in `frontend-component-contracts`'s "Native/Tauri event
semantics" section) — this hook is a no-op when run in a plain browser.
`cancelled`/`unlistenRef` guard against a race where the component unmounts
before the dynamic import resolves (the returned unlisten function is called
immediately instead of stored). `clear()` resets `dropPath` to `null` after
the caller has consumed it.

### `useKeyboardSearch.ts`
Owns type-to-search plus Escape/blur dismissal for the main apps view only
(explicitly not shared with portal/context-menu Escape handling — see
`frontend-component-contracts`). Exports `useKeyboardSearch(): {
searchInputRef: RefObject<HTMLInputElement> }`. A global `keydown` listener
is a no-op unless `viewMode === 'apps'`; while a search is already active,
only `Escape` is handled (dispatches `clearSearch`); otherwise a single
printable key (no modifier, and not while focus is already in an
input/textarea) activates search (`setSearchActive(true)` +
`setSearchQuery(e.key)`) — same seed-with-first-keystroke pattern as
`useCombobox`. A second effect auto-focuses `searchInputRef` whenever
`searchActive` flips true. A third effect clears search on window `blur` (app
loses focus). All three effects dispatch into `store/slices/uiSlice`.

### `useOutsideClose.ts`
Generic "close on outside interaction" primitive. Exports
`useOutsideClose(active, onClose, opts?: { selector?, ref?, event? })`.
Only active while `active` is true. Resolution order: if `opts.ref` is
given, closes unless the event target is contained within that ref; else if
`opts.selector` is given, closes unless the target matches
`.closest(selector)`; else closes unconditionally on any matching event
(default event type `'click'`, overridable to `'mousedown'`). Contract:
stateless — callers own whatever `open`/`onClose` state this drives; this is
the shared building block behind popovers/menus that need outside-click
dismissal (distinct from the portal-specific Escape handling called out in
`useKeyboardSearch`'s doc above).

### `usePolling.ts`
The app's central data-refresh heartbeat. Exports `usePolling(): void` (no
return value — pure side-effect hook, mounted once in `App.tsx`). Until the
config has loaded, it dispatches an initial burst of thunks and repeats it
every `STARTUP_RETRY_MS` (one second), so a backend that comes up late is
picked up at once instead of on the next 5-minute tick. The burst is: `fetchConfig`, `fetchFavorites`,
`fetchOrder`, `fetchPlugins`, `refreshAll`, `fetchDescriptors`,
`fetchSessions`, `fetchGroupSelections`, `fetchInstances` (`fetchFavorites`/`fetchGroupSelections`
are mount-only — not part of the recurring set below; everything else is
also re-dispatched on the timer/focus paths). A `setInterval` at `POLL_MS`
(from `lib/constants.ts`, `300000` = 5 minutes) re-dispatches `refreshAll`,
`fetchDescriptors`, `fetchSessions`, `fetchPlugins`, `fetchConfig`,
`fetchOrder`, and `refreshScripts` (from `gitSlice`); a
`window.addEventListener('focus', ...)` handler re-dispatches the exact same
seven immediately when the window regains focus (catches state that went
stale while the app was backgrounded, without waiting for the next
5-minute tick). Cleanup clears the interval and removes the focus listener.

`fetchPlugins()` was added to both the interval and the focus handler as a
should-fix from a prior plugin-system audit — it used to be dispatched only
once at mount, so a plugin activated/deactivated/enabled-toggled from
another window (the desktop app can have more than one open) never synced
into a window that wasn't the one that made the change, indefinitely.

Relationship: the only hook that touches the
`appsSlice`/`favoritesSlice`/`orderSlice`/`pluginsSlice`/`sessionsSlice`/
`gitSlice` fetch thunks directly on a timer — all other hooks read/write
narrower slice state.

### `usePopoverPosition.ts`
Simpler positioning sibling to `useAnchoredPosition`, for popovers anchored
to a point (`{x, y}`) rather than a trigger element's rect. Exports
`usePopoverPosition(anchor, ref, deps, mode): Pos | null`. `mode` selects
between `lib/position.ts`'s `clampToViewport` (default `'clamp'` — keeps the
popover on-screen near the anchor point) and `anchorLeftOf` (positions the
popover to the left of the anchor, still viewport-clamped) — used for
menus that open from a specific click point (e.g. context menus) rather than
a persistent trigger element. Recomputes in `useLayoutEffect`; returns `null`
while `anchor` is `null` or the ref isn't mounted yet.

### `useTheme.ts`
Applies the current Redux theme (`store.theme.theme`, type `Theme` from
`store/slices/themeSlice`) to `<html data-theme>` and keeps it in sync with
the OS `prefers-color-scheme` media query while the theme is `'auto'`.
Exports `useTheme(): void`. `getEffectiveTheme` resolves `'auto'` to
`'light'`/`'dark'` via `matchMedia`; `applyTheme` sets
`data-theme="light"` explicitly or removes the attribute entirely for dark
(dark is the attribute-absent default). Two effects: one re-applies theme
whenever the Redux `theme` value changes; the other subscribes to the media
query's `change` event exactly once (empty deps) and reads the current theme
through a `ref` (`themeRef`, updated every render) inside the listener —
this is the documented pattern in `frontend-component-contracts` ("subscribe
once, read via ref") specifically so the media-query subscription isn't
torn down and re-added on every theme change. Persistence to `localStorage`
is explicitly not this hook's job — that's `store/listeners.ts` per the
component-contracts page.

### `useTrayCount.ts`
One-line bridge: whenever `selectRunningCount` (from `store/selectors.ts`)
changes, calls `setTrayCount(runningCount)` (`lib/tauri.ts`) to update the
native tray icon's badge/title. Exports `useTrayCount(): void`. No local
state; purely reactive to the Redux-derived running-app count.

### `useTrayNavigationSync.ts`
Resets the UI to the main apps view whenever the Rust side emits `tray:shown`
— fired only when a tray-icon click reveals the compact popover from fully
hidden (never on a Workspace focus/activate click, never on hide, per
`frontend-component-contracts`'s "Native/Tauri event semantics"). Exports
`useTrayNavigationSync(): void`. Dynamically imports `@tauri-apps/api/event`,
subscribes with `listen('tray:shown', () => dispatch(setViewMode('apps')))`,
and unwinds via the same `cancelled`/`unlisten` race guard as
`useFolderDrop.ts` — identical no-op-outside-Tauri shape.

## Lib (`app/src/lib/`)

### `appIcon.ts`
Single source of truth for resolving an `AppConfig['icon']` value into a
renderable form — see `frontend-component-contracts`'s "Icon resolution"
section for why this must not be re-implemented at call sites. Exports
`IconName` (derived from `lucide-react/dynamic`'s `iconNames` tuple),
`ICON_NAME_SET` (a `ReadonlySet<IconName>` for O(1) membership checks),
`isIconName(v): v is IconName`, `EffectiveIcon` (`{kind:'library', name} |
{kind:'placeholder'}`), and `resolveAppIcon(icon)` — returns `placeholder`
for an unset or unrecognized icon name, otherwise `library` with the
validated name. Consumed by `AppTile.tsx` and `useAppRow.ts`.

### `clipboard.ts`
`copyText(text): Promise<void>` — tries `navigator.clipboard.writeText`
first, falling back to a hidden `<textarea>` + `document.execCommand('copy')`
when the async Clipboard API throws (e.g. insufficient permissions/non-secure
context). The fallback element is appended, selected, copied, then removed
synchronously in the same call.

### `constants.ts`
Four standalone app-wide constants with no shared theme: `OTHER_ID =
'__other__'` (sentinel group id for the "Other" section, see
`frontend-component-contracts`'s `OtherSection` entry), `WORKSPACE_NAME =
'🜃 Loki'` (display name for the Workspace/dashboard view), `POLL_MS =
300000` (5-minute refresh interval consumed by `usePolling.ts`), and
`STORAGE_THEME = 'theme'` (the `localStorage` key theme persistence writes
to, per `store/listeners.ts`).

### `dashboardWindow.ts`
Owns the native window animation state machine for entering/exiting the
Workspace/Dashboard overlay — re-exported through `lib/tauri.ts` (`export *
from './dashboardWindow'`) so existing `tauri.*` call sites are unaffected.
`animateProgress(invoke, from, to)` runs a `requestAnimationFrame` loop over
`DASH_ANIM_MS` (420ms) with an `easeInOutCubic` easing curve, firing
`set_dashboard_progress` on the Rust side every frame (fire-and-forget,
ordering preserved by the single-threaded rAF loop) — this per-frame invoke
is what makes the popover→dashboard transition read as smooth rather than a
native snap, per `frontend-component-contracts`. A module-level
`dashboardAnimating` flag (read via `isDashboardAnimating()`) tracks whether
the rAF loop currently owns the NSWindow frame, so `startWindowDrag()` can
refuse to fire `startDragging()` while an animation is in flight (would
race the same window). `enterDashboard()` invokes Rust's `enter_dashboard`
command (clears size constraints, stashes start/target frames) then runs
`animateProgress(0→1)`; `exitDashboard()` runs the reverse animation then
invokes `exit_dashboard`. `resetDashboardFrame()` calls `exit_dashboard`
directly with no animation — used when the window is already hidden, so the
next reveal starts from a freshly-reset popover frame rather than replaying
a visible animation nobody would see. All four exported functions wrap their
Tauri `invoke` calls in try/catch with `console.error` on failure, and reset
`dashboardAnimating = false` in a `finally`.

### `errors.ts`
`errMsg(e: unknown): string` — normalizes any caught value to a display
string: `e.message` if `e instanceof Error`, otherwise `String(e)`. The
smallest file in the zone (3 lines); used wherever a catch block needs to
surface an error to the UI without knowing the throw's shape.

### `grouping.ts`
Ordering and grouping helpers operating on `FullConfig`/`AppStatus` (from
`../../api`). `effectiveOrder(order, config)` reconciles a persisted
`order: string[]` against the current config's app keys: known apps in
`order` keep their position, apps in config but missing from `order` are
appended in config's own key order, and `order` entries no longer in config
are dropped — returns `[...order]` unchanged if `config` is `null` (not yet
loaded). `sortByOrder(names, effOrder)` sorts an arbitrary name list by
position in `effOrder`, pushing anything not found in `effOrder` to the end
(`Infinity` index). `selectAllGroups(config)` collects the deduplicated,
first-seen-order union of every app's `groups[]` tags across the config —
this is the "derived group" list referenced in `GroupMenu`'s doc in
`frontend-component-contracts` (a derived group is computed from this tag,
not from a persisted `groups.groups` record). `isRunning(st)` is the
canonical "is this app up" predicate: true for `process === 'running'` or
`process === 'port-conflict'` (a conflicting port still counts as "the
process is up," just contending) — any UI code deciding whether to show an
app as active should use this rather than re-checking `process` directly.

### `keys.ts`
`sanitizeKey(raw: string): string` — normalizes a raw string (typically a
user-entered environment/group label) into a config-safe key: lowercase,
non `[a-z0-9-]` runs collapsed to a single `-`, leading dashes stripped; if
the result doesn't start with a letter/digit (e.g. an all-symbol input
collapsed to empty string), it's prefixed with `env-` to guarantee a valid,
non-empty key. Single-purpose 4-line file.

### `pluginIcons.ts`
`ICON_MAP: Record<string, LucideIcon>` — a fixed name→icon lookup
(`play`, `square`, `rotate-ccw`, `external-link`, `terminal`, `zap`, `flag`,
`wrench`, `git-branch`) for plugin-declared control descriptors that specify
an icon by string key rather than importing `lucide-react` directly (plugins
are data, not code). `FALLBACK_ICON = Puzzle` is exported separately for
callers to fall back to when a descriptor's icon key isn't in `ICON_MAP`
(e.g. an unrecognized/future icon name from a plugin manifest).

### `position.ts`
Pure geometry helpers with no Tauri/React dependency — the shared math layer
under `useAnchoredPosition.ts` and `usePopoverPosition.ts`. `Pos = {left,
top}`. `clampToViewport(x, y, rect)` keeps a `{x,y}`-positioned box fully
on-screen with an 8px margin on all sides. `anchorLeftOf(x, y, rect)`
positions a box's right edge at `x` (i.e. flush to the left of the anchor
point) then clamps the same way. `AnchoredPos = {left, top, maxHeight,
placement: 'below'|'above'}`; `anchorBelowOrAbove(triggerRect, menuSize,
viewport, opts?)` picks `'above'` only when below-space is insufficient for
the desired height (`maxRows * rowH`) **and** above-space exceeds
below-space — otherwise defaults to `'below'`. The chosen height is clamped
between a 3-row minimum and whatever space is actually available in the
chosen direction, so a menu overflowing the viewport shrinks (with its own
internal scroll) rather than getting clipped or pushed off-screen.

### `tauri.ts`
The dynamic-import wrapper contract for every Tauri native-command call
outside the dashboard-window state machine (see
`frontend-component-contracts`'s "`lib/tauri.ts` — dynamic-import wrapper
contract" section). Re-exports everything from `./dashboardWindow` via
`export *`, then adds: `openConfigInEditor(path)` and `openFolder(path)`
(both currently invoke the same Rust `open_config_in_editor` command —
`openFolder` is not yet a native file-picker, matching the note on
`SettingField`'s folder button in `frontend-component-contracts`),
`openInTerminal(command)` (returns the produced terminal command string, or
`''` on failure), `openUrl(url)`, `openBranch(repoUrl, branch)` (builds a
`{repoUrl}/tree/{branch}` URL and opens it), `openAppSite({appUrl, port})`
(prefers an explicit `appUrl`, falls back to `http://localhost:{port}`, no-op
if neither resolves to a URL), `quitApp()`, `setTrayCount(n)` (silently
swallows errors — a tray-badge failure shouldn't surface to the user),
`isAutostartEnabled()` / `enableAutostart()` / `disableAutostart()` (thin
wrappers over `@tauri-apps/plugin-autostart`, consumed by
`useAutostart.ts`), and `hideWindow()`. Every wrapper (except the
autostart trio, which let errors propagate to their caller, `useAutostart`)
follows the same shape: dynamic `import('@tauri-apps/api/core')` → `invoke`
→ catch-and-log-or-swallow, so each function is safely callable outside a
Tauri runtime (plain `npm run dev` in a browser) without special-casing at
every call site.

## Top-level entry (`app/src/`)

### `App.tsx`
The application's root component. Mounts the always-on hooks
(`usePolling`, `useTheme`, `useTrayCount`, `useTrayNavigationSync`) plus
`useKeyboardSearch` (whose `searchInputRef` is threaded down to `Header`).
Reads three top-level Redux flags: `apps.configLoaded` (gates a
"Connecting to orchestrator…" loading state — nothing else renders until the
initial config fetch resolves), `ui.viewMode` (`'apps'` renders `AppList`,
anything else renders `SettingsView`), and `ui.dashboardOpen` (conditionally
mounts `Dashboard`, the Workspace overlay). Always renders `Header`, the
three portal components (`AppContextMenu`, `GroupMenu`, `IconPicker` — all
render `null` until their own open-state fires), and `DockBar` only in
`'apps'` view mode. Everything is wrapped in `MenusProvider`
(`components/MenusContext`), which the portal components and rows depend on
for shared open/close menu coordination. Contract: `App.tsx` itself owns no
business logic — it is purely a hook-mount + view-mode switch.

### `main.tsx`
The Vite/React entry point. Creates the React root on `#root`, wraps `App`
in React's `<StrictMode>` and Redux's `<Provider store={store}>`
(`./store`), and imports `./styles.css` as the only global stylesheet
import in the codebase. 15 lines — no logic beyond bootstrapping.

### `api.ts`
The desktop frontend's only HTTP boundary — see
[`api-client`](api-client.md) for the full endpoint table (method, path,
purpose) and the `BASE = 'http://127.0.0.1:9999'` port-matching note shared
with `tauri-shell.md`. This pass adds: two JSON-unwrap helpers, `j<T>(r)`
(throws `Error(msg)` built from the response's parsed `error` field or raw
text on `!r.ok`, otherwise resolves `r.json()`) and `jv<S>(r, schema)` (same
error path, but parses the JSON body through a Zod schema — used for
`getConfig` via `ConfigSchema`, `getPluginDescriptors` via a `record` of
`ControlDescriptorSchema`, `getPlugins` via `PluginMetaSchema.extend(...)`,
and `getCatalog` via `CatalogEntrySchema.extend(...)` — the four endpoints
whose shape is runtime-validated rather than trusted as cast). Re-exports
backend domain types (`AppConfig`, `WorkspaceConfig`,
`AppStatus`, `ScanResult`, `ComponentCandidate`, `PluginMeta`,
`MarketplacePlugin`, `ControlDescriptor`, `TemplateContext`, `GlobalConfig`,
`Surface`, `AppSurface`, `DetectedComponent`,
`DetectedRuntime`, `DetectedComponentId`) plus local-only response/request
shapes not owned by the backend: `SessionInfo`, `PluginPreview`,
`ProviderSettingFieldKind`/`ProviderSettingField`/`ProviderMeta`,
`GlobalConfigResponse`, `GitStashRecord`/`GitBranchesResponse`/
`GitCheckoutResponse`, `CatalogEntry`. The exported `api` object has one
method per endpoint in the table linked above. The mutation shape most tied to
the grouping/settings components documented in `frontend-component-contracts`
is `patchApp`'s patch object (`label`, `repoPath`, `repoUrl`, `appUrl`,
`dependsOn`, `surface`, `icon`, `groups`, `plugins`, `environmentFilter`):
group membership travels on the app itself via that `groups` array, so there
is no separate group-map endpoint.

# Citations

[1] `app/src/hooks/useAnchoredPosition.ts`
[2] `app/src/hooks/useAutostart.ts`
[3] `app/src/hooks/useCombobox.ts`
[4] `app/src/hooks/useFolderDrop.ts`
[5] `app/src/hooks/useKeyboardSearch.ts`
[6] `app/src/hooks/useOutsideClose.ts`
[7] `app/src/hooks/usePolling.ts`
[8] `app/src/hooks/usePopoverPosition.ts`
[9] `app/src/hooks/useTheme.ts`
[10] `app/src/hooks/useTrayCount.ts`
[11] `app/src/hooks/useTrayNavigationSync.ts`
[12] `app/src/lib/appIcon.ts`
[13] `app/src/lib/clipboard.ts`
[14] `app/src/lib/constants.ts`
[15] `app/src/lib/dashboardWindow.ts`
[16] `app/src/lib/errors.ts`
[17] `app/src/lib/grouping.ts`
[18] `app/src/lib/keys.ts`
[19] `app/src/lib/pluginIcons.ts`
[20] `app/src/lib/position.ts`
[21] `app/src/lib/tauri.ts`
[22] `app/src/App.tsx`
[23] `app/src/main.tsx`
[24] `app/src/api.ts`
