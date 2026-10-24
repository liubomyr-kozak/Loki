---
type: concept
title: Frontend component contracts
timestamp: "2026-08-02T00:00:00Z"
---

# Frontend component contracts

General component, hook, and lib architecture rationale that isn't specific
to pickers/selectors (`frontend-picker-selector-contracts`) or config
read/write (`config-read-write-contract`). Grouped by concern.

## Icon resolution — single source of truth

`lib/appIcon.ts` (`resolveAppIcon`, `isIconName`, `ICON_NAME_SET`) is the
**single source of truth** for resolving `AppConfig.icon` into a renderable
form. `AppTile.tsx` and `useAppRow.ts` (backing `AppRow`) both call
`resolveAppIcon(cfg.icon)` instead of re-checking icon-name validity/library
membership themselves. This duplication-avoidance rule exists because
re-testing the same predicate in multiple call sites is exactly what caused
a prior regression — the parallel case is `selectListNameSet` in
`store/selectors.ts` (see `frontend-picker-selector-contracts`), which is
cited directly in the source comments as the precedent for why this
duplication is a regression risk.

`components/AppList/NoIconFallback.tsx` (`DynamicIcon`'s fallback while its
icon chunk loads) renders `null` rather than a stand-in glyph — a
placeholder would flash on every cold icon load, and an icon-less row is
meant to show nothing at all while resolving.

## Row layout: `.rowIconHandle` and `.rowMetaCell`

In `AppRowStatus.tsx`, when an app has a configured icon (or the
`CircleDashed` placeholder when none is set), that icon takes over the
row's leftmost slot in place of the plain status dot — both render inside
`.rowIconHandle` so every row's icon sits on the same horizontal line
regardless of which one is showing, and the icon still carries the
drag-start handling the dot used to provide (`onMouseDown` triggers
`onDragStart`).

`useAppRow.ts` adds the complementary rule: non-neutral process states
(`running`, or `st?.process === 'unhealthy'`, tracked as `hasActiveStatus`)
must **always** surface the colored status dot, even for apps with a
configured icon. The icon only takes over the leftmost slot while the app
is neutral (stopped/unknown) — active/warning states must stay visible
regardless of icon configuration.

See `frontend-picker-selector-contracts` for the related `.rowMetaCell`
grid-alignment rule in `AppRowPickers.tsx`.

## `AppTile` / `DockBar` — the dock's rendering contract

`AppTile.tsx` is the dock counterpart to `AppRow` (list rendering); several
plugins may each contribute one dock descriptor for the same app, so
`dockControls` is filtered/mapped as an N-length list of plugin badges on
one tile — never assumed to be exactly one.

`DockBar.tsx` is a core-UI strip rendering one `<AppTile>` per dock-placed
app — explicitly **not** a plugin-control strip. It consumes
`selectDockNames`, which is already partitioned from `selectVisibleNames`
(see `frontend-picker-selector-contracts`), so the dock obeys the same
`filterRunning`/search filters as the `.list` surface without re-filtering
itself; favorites only affect sort order there, not filtering.

## `AppList/types.ts` — shared shapes to avoid circular imports

`PickerTarget` (the version/env/branch picker currently open in `AppList`)
is kept in its own module specifically so `AppList`, `AppRow`, and `Picker`
can all import it without creating a circular dependency between
`AppList` and `AppRow`.

`AppRowProps` keeps a single row's shared local UI state (open picker,
long-press menu, drag source) lifted to `AppList` and threaded down as
props, so individual rows stay presentational rather than each owning
duplicate state.

`GroupSectionSharedProps` (`renderRows`) is the shared contract for section
components (custom groups / version groups / "Other") that need to render a
list of app rows via a callback owned by `AppList`, rather than each section
re-implementing row rendering.

## `useAppRow` — one hook, one row

`useAppRow.ts` composes every selector, memoized selector instance, local
state, and derived value a single `AppRow` needs into one hook, so
`AppRow.tsx` itself stays a thin JSX-only composition layer. Notably:

- `selectAppsSharingRepoPath` (from `makeSelectAppsSharingRepoPath`) is
  built via `useMemo(..., [])` **inside** the hook so each row instance gets
  its own stable memoized selector — hoisting the factory call to module
  scope would break reselect's per-instance memoization across rows (see
  the `store/selectors.ts` factory-vs-shared-selector KEEP comment, which
  covers the same failure mode).
- Pending branch-switch/drop-stash state (`pendingBranch`,
  `pendingDropStash`) exists because those actions route through an
  explicit confirm modal (FR-5) rather than firing immediately.
- `canDropStash` requires `branchInfo?.stash` to still be truthy — reconcile
  may have just cleared a stale stash record out from under an
  as-yet-unrefreshed `hasStashForBranch` poll badge, so the "Drop stash…"
  action is only offered while the record is still present.

## `Dashboard.tsx` close animation state machine

`close()` guards against a fast double-click re-entering mid-teardown via
`tauri.isDashboardAnimating()`. On a clean close it hides the window
instantly (no reverse-shrink animation — the user closing the popup isn't
watching it animate back) and only then resets the native frame, so the
window is off-screen while its frame resets and the next reveal starts from
a fresh compact popover rather than the dashboard-sized one.

## `lib/dashboardWindow.ts` — native window animation

The rAF-driven `animateProgress` loop invokes the Rust `set_dashboard_progress`
command each frame with `animate: false`, so the WKWebView re-layouts (grows
width) on every intermediate step instead of the native window snapping once
at the end of a native `setFrame` animation — the per-frame invoke is what
makes the transition visually smooth rather than a jump-cut.

`enterDashboard()` calls the Rust `enter_dashboard` command first, which
clears the window's size constraints and stashes the start/target frames;
only then does the frontend rAF loop grow the window from popover to
dashboard size using those stashed frames.

`resetDashboardFrame()` resets the native frame/chrome/constraints back to
the compact popover **without** the reverse-shrink animation — used
specifically when the window is already hidden, so the next reveal starts
from a freshly-reset popover frame instead of replaying a visible animation
no one would see.

## `lib/tauri.ts` — dynamic-import wrapper contract

`lib/tauri.ts` re-exports thin wrappers around Tauri `invoke` calls, all
dynamic-imported (mirroring `App.tsx`'s own import pattern) so the module
stays side-effect free when running outside Tauri (e.g. plain `npm run dev`
in a browser). The dashboard-window transition/animation state machine
itself lives in `./dashboardWindow` and is re-exported here so existing
`tauri.*` call sites are unaffected by the split.

## Native/Tauri event semantics

`useTrayNavigationSync.ts`: the Rust side emits the `tray:shown` event
**only** when a tray-icon click reveals the compact popover from fully
hidden — never on a Workspace focus/activate click, and never on hide. This
is the one case where the view must reset to the main menu, since Settings
no longer has its own icon-driven memory of view state.

`useFolderDrop.ts` listens for OS drag-drop of a folder onto the window via
Tauri's webview drag-drop event, mirroring the same dynamic-import guard
pattern used throughout `lib/tauri.ts` and `useTrayNavigationSync.ts` so it
is a no-op outside Tauri.

## `useTheme` — subscription lifecycle

Applies the current theme to `<html>` and re-applies whenever the OS
`prefers-color-scheme` media query changes while `theme === 'auto'`.
Persistence to `localStorage` is handled separately by `store/listeners.ts`,
not here — this hook only owns DOM application. The current theme value is
read via a `ref` inside the media-query listener specifically so the
subscription is set up **once** rather than being torn down and re-added on
every theme change.

## `useKeyboardSearch` scope

Owns type-to-search plus Escape/blur handling for the main apps view only.
Context-menu and group-menu Escape handling is deliberately kept local to
those portal components rather than centralized here — the two concerns
have different lifecycles and dismissal semantics.

## Text inputs: browser assistance is off everywhere

Every free-text `<input>` in the desktop UI carries the same four
attributes — `autoCorrect="off"`, `autoCapitalize="off"`,
`spellCheck={false}`, `autoComplete="off"`. These inputs take identifiers,
not prose: app/group names, env keys, branch and script names, file paths,
plugin ids, search queries. WebKit's autocorrect/autocapitalize would
rewrite a typed identifier mid-entry (capitalizing a lowercase app name,
"correcting" a hyphenated branch name), spellcheck would underline every one
of them as a misspelling, and autofill would offer unrelated saved values
over a picker's own filtered list.

Applied consistently across all nine text inputs: `Dashboard/InlineEdit.tsx`,
`Dashboard/ChipListEditor.tsx`, `Dashboard/EnvironmentsSection.tsx`,
`Dashboard/PluginsPanel.tsx`, `Header/SearchBar.tsx`,
`Settings/StorageRow.tsx`, `pickers/Picker.tsx`, `portals/IconPicker.tsx`,
`portals/InlineTextForm.tsx`. A new text input should carry the same four —
the convention is "all of them", so an input without them is the exception
that needs justifying, not the default.

## Settings component contracts

- **`SectionCard`** (`components/Settings/SectionCard.tsx`): `SectionAccent`
  is a closed union (`'execution' | 'environment' | 'storage'`) driving only
  the `sectionCard--<accent>` class — one accent per section on the
  Environment settings page. The component itself is pure chrome (icon +
  title + description header plus a body slot) and carries no data/state of
  its own.
- **`FieldRow`** (`components/Settings/FieldRow.tsx`): dispatches a single
  provider setting field to the right row component by `field.kind` — a
  text/path field with a detected component matching by id substring of the
  field key (e.g. `tmuxBin` ~ `tmux`) routes to `SelectorRow` (candidates +
  redetect); text/path otherwise routes to `SettingField` (inline-edit);
  `select` routes to a native `<select>` over `field.options`; `boolean`
  routes to `BooleanField` (native switch). The camelCase-prefix match used
  for the id-substring routing is a genuine footgun and is kept as an inline
  `KEEP` comment next to the match logic itself (not migrated here) — see
  `FieldRow.tsx:79`.
- **`BooleanField`**: native checkbox styled as a switch (`role="switch"`)
  for boolean provider settings (e.g. tmux's "Restart stale sessions").
  Patches the real boolean value — no string coercion.
- **`StorageRow`**: displays a detected storage path (config/logs folder) —
  a text input showing the path plus an "Open folder" action, disabled/no-op
  when the path hasn't resolved yet. When `onSave` is provided the path
  becomes editable via `InlineEdit` instead of staying a read-only display.
- **`SettingsRowMeta`**: the shared `.meta` cell (icon → name → tip/desc)
  used across every Settings field row. Only the left-hand meta block is
  extracted into this component — the control side (select / InlineEdit /
  switch / chevron) differs per row and stays owned by each caller.
- **`FieldStatus`** (`FieldStatusIndicator`): a small check/x/spinner shown
  next to a field's control after a patch — the per-row counterpart to the
  page-level `.cfgStatus` line, which is reserved for load failures and
  reset. Renders nothing while idle. `FieldStatusValue` (`'idle' | 'saving'
  | 'ok' | 'error'`) is keyed by `field.key` in the owning page.
- **`ProviderConfigPanel`**: always-visible sub-section for a provider's
  advanced settings (everything with `field.advanced === true` on the
  active `ProviderMeta`). Returns `null` when the provider has no advanced
  fields — nothing to show, no empty section chrome.
- **`SettingField`**'s folder button reuses `openFolder` (which currently
  opens the path in the OS file manager/editor) as the folder-pick
  affordance, per design — it is not a native file-picker dialog.
- **`useEnvironmentSettings`**: `load()` is wrapped in `useCallback` with
  empty deps (setState setters are stable) so the mount effect can list
  `load` in its dependency array honestly instead of disabling
  `exhaustive-deps`; this is also why `load()` needs `loadSeqRef`-based
  race-safety against overlapping calls (a slower earlier call finishing
  after a newer one must not clobber the newer result). Per-field save
  status (FR-17) exists so a single patched field's outcome shows as a
  check/x next to its own control via `fieldStatus`, instead of routing
  through the global `.cfgStatus` line, which stays reserved for load
  failures and reset. `redetect()` keeps last-known data on screen during
  the redetect poll (no flicker) — the fresh response only swaps in once it
  lands, and only if `loadSeqRef` still matches, i.e. nothing newer
  (load/patch/reset) started after this call.

## Group / menu components

- **`GitCheckoutConfirm`**: uses the same portal pattern as `Popover.tsx`
  (`createPortal` straight to `document.body`), but renders as a centered
  modal via the shared `.modalOverlay`/`.modalCard` classes rather than an
  anchored popover, because this dialog has no trigger element to anchor
  to. Two variants, both reached from `AppRow`'s branch `Picker`: `confirm`
  (running-app / shared-repoPath warnings, either or both, shown as one
  bullet list gated behind an explicit Confirm) and `conflict` (blocking
  unresolved-conflict / checkout-failure banner, dismiss-only, no confirm
  action; `message` overrides the default copy for e.g. a backend
  409/`ok:false` error string that isn't a stash-apply conflict).
- **`GroupMenu`**: derived (version/apex) groups have no entry in
  `groups.groups` — they're computed from each app's
  `config.apps[name].groups` tag rather than being a persisted group
  record. `applyToDerivedMembers` patches every derived-group member's
  `groups[]` and deliberately issues every `patchApp` call rather than
  aborting on first failure, collecting results via `Promise.allSettled` so
  the UI always reloads from disk truth afterward — but if any single patch
  failed, that failure is surfaced through the existing `cfgMsg` channel
  instead of being silently swallowed. This matters because a rename or
  delete across members could otherwise leave disk half-applied (one
  logical group split into old+new name, or only partially deleted).
- **`GroupSection`**: a group's existence (header, rename/delete,
  Start/Stop) depends only on whether it still has members that exist in
  config — not on those members' `surface`. Whether a member renders as a
  row is a separate, later filtering concern. Separately, while the running
  filter is active, a group with zero running members hides its entire
  header+card shell, not just its (empty) rows.
- **`OtherSection`**: "Other" means the full list of all list-surface apps,
  always — not just apps with no group membership ("orphans"). Apps may
  render in both their own group section(s) **and** in Other; that
  duplication is intentional (per product decision), matching the
  multi-membership model used elsewhere in the grouping system.
- **`InlineTextForm`**: shared create/rename inline form used by both
  `AppContextMenu` (create group) and `GroupMenu` (rename). `onSubmit` is
  always called with the **trimmed** value, mirroring both original call
  sites which trimmed before dispatch. All inline style objects are copied
  byte-for-byte from the two original near-identical blocks with no CSS
  class backing them, to guarantee pixel-identical output post-extraction.
- **`MenuItem`**: shared popover row used by `AppContextMenu` / `GroupMenu`
  / `IconPicker`. Hover is driven by local React state rather than the
  original's imperative `e.currentTarget.style.background` mutation, but it
  still reuses `popoverItem()` (the shared base style factory in
  `Popover.tsx`) so the 0.1s background transition and all other pixel
  values stay identical to the pre-refactor behavior.
- **`CopyButton`**: copy-to-clipboard affordance shared by copyable settings
  fields and storage-path rows. Shows a checkmark for ~1.5s after a
  successful copy before reverting.

## `store/groupOps.ts` — one start path for every "start" affordance

The component contract here is about **which entry point a component is
allowed to call**, not about what the thunks do internally (that lives in
[Desktop Redux store](../desktop/store.md)'s `app/src/store/groupOps.ts`
section).

Every start affordance goes through `startGroupExclusive` — the group Start
pill (`Groups/GroupHeader.tsx`), the group menu's "Start group"
(`portals/GroupMenu.tsx`), the conflict dialog's resolve action
(`Groups/GroupStartConflictDialog.tsx`), and, crucially, a **single row's own
start inside a group section** (`AppList/useAppRow.ts`'s `runGroupStart`,
which passes `names: [name]`). A row start deliberately does *not* call
`applyGroupIntentAndStart` directly even though it starts exactly one app:
routing it through `startGroupExclusive` is what makes a single row still
stop the group's foreign rivals and still defer to the conflict dialog when
a group-mate is running on drifted intent. Bypassing it would silently give
one-row starts different exclusivity semantics from a group start.

Stop is the asymmetric case: components call `stopApps(members)` directly
(`GroupHeader`, `GroupMenu`) — there is no exclusivity or intent to apply
when stopping, so there is no `stopGroup`-shaped wrapper to route through.

## Menu navigation (tray routing + drop-not-queue guard)

`app/src/usecases/menuNavigation.ts` handles manual screen transitions
(main menu / Settings / Workspace) triggered by component clicks. The tray
icon no longer routes through here at all — it's handled natively in Rust
(see `main.rs`'s `on_tray_icon_event`): a plain show/hide toggle for the
compact popover, and focus/activate for Workspace.

`onWorkspaceOpened`'s `animInFlight` flag guards the native enter/exit
dashboard animation (~420ms) against a double-click racing the animation.
A second call while one is in flight is **dropped, not queued** — this is
deliberately not a naive debounce (which would delay-then-fire the second
call); it simply no-ops until the in-flight animation finishes.

