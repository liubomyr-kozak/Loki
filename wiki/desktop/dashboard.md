---
type: concept
title: Dashboard components (desktop)
timestamp: "2026-07-30T12:00:00Z"
---

# Dashboard components (desktop)

The Dashboard is the app-config surface of the desktop app: the expanded
window (as opposed to the compact tray popover) where a user browses
configured apps, edits their per-app detail (identity, environments,
details, plugins), manages installed/catalog plugins, and imports new
projects by dropping a folder. Every file in
`app/src/components/Dashboard/*.tsx` and `*.ts` is documented below.

Cross-references: `frontend-component-contracts` (general component/hook
architecture, including the `Dashboard.tsx` close animation state machine
and Settings component contracts this page's `SectionCard`/`InlineEdit`
usage builds on), `flag-toggle-platform-app-model` (the platform/app split
`FlagToggleSettings.tsx` implements), `config-read-write-contract` (the
read-lenient/write-strict schema split that `savePatch`/`api.patchApp` and
`api.addApp` sit in front of).

## `Dashboard.tsx`

Top-level Dashboard shell. Reads `config`/`apps`/`dashboardTab` from the
store, renders the head bar (Workspace name, `DASHBOARD_TABS` segmented
control — apps/plugins/settings — and a close button) plus a body that
switches between three panels: the apps master/detail view
(`dashboardList` + `AppConfigDetail`), `PluginsPanel`, and
`EnvironmentSettings` (from `../Settings`). Also owns the folder-drop
import flow via `useFolderDrop()`, rendering a `dropOverlay` while dragging
and `ImportProposal` once a folder is dropped. `close()` guards against a
fast double-close mid-teardown via `tauri.isDashboardAnimating()`, hides
the window instantly, and resets the native frame — see
`frontend-component-contracts`'s "`Dashboard.tsx` close animation state
machine" section for the full rationale. `onHeadMouseDown` starts a native
window drag (`tauri.startWindowDrag()`) when the mousedown lands on the
head bar background itself (not a button/tab). No props — reads/dispatches
entirely through Redux (`useAppSelector`/`useAppDispatch`).

## `AppConfigDetail.tsx`

Per-app detail composition root, rendered by `Dashboard.tsx`'s apps tab for
the currently selected app. Props: `{ name: string }`. Delegates all state
to `useAppConfigDetail(name)` and composes four sections in order:
`AppIdentityRow` (icon + label header), `EnvironmentsSection` (scan/toggle
scripts), `AppDetailsForm` (repo path/URL, app URL, placement, depends-on,
groups), and `AppPluginsSection` (installed plugins + their settings).
Renders `"App not found."` when `s.cfg` is undefined (app removed from
config while selected). Pulls `openIconPicker` from `useMenus()` (from
`../MenusContext`) and threads it into `AppIdentityRow`.

## `useAppConfigDetail.ts`

The single hook backing `AppConfigDetail` — composes every selector, local
state slice, and derived value the detail view needs, per the same
one-hook-per-composition-root pattern documented for `useAppRow` in
`frontend-component-contracts`. Reads `cfg` (`s.apps.config?.apps[name]`),
`allApps`, `allGroups` (via `selectAllGroups`), and `plugins`
(`s.plugins.list`, kept fresh via a `fetchPlugins()` dispatch on mount).
`otherApps` excludes the current app from `allApps` (for the depends-on
picker). Owns:
- `savePatch(patch)` — wraps `api.patchApp(name, patch)` + `reloadConfig()`
  dispatch, surfacing failures into `cfgError` via `errMsg(e)`.
- `refreshPreview()` — re-reads the repo's `package.json` scripts for the
  current `previewRef` and recomputes which of them the env filter matches,
  exposed as `previewScripts` (all) and `previewMatched` (those passing the
  filter), with `previewLoading`/`previewError` around the call.
- `filterDraft`/`setFilterDraft` — the editable per-app `environmentFilter`
  override, saved through `savePatch`; `globalFilterRegex` carries
  `global.environmentFilterRegex` for comparison.

There are deliberately no add/remove/toggle-environment actions: environments
are **derived**, not stored (see below), so the only thing the user edits is
the filter, and the preview shows the effect immediately.

Returns a flat object combining `cfg`/`allApps`/`allGroups`/`plugins`/
`otherApps`, the preview/filter state, and `savePatch`.

## `AppIdentityRow.tsx`

Header row: icon button (opens the icon picker via `onOpenIconPicker(name,
x, y)` positioned at the click point) plus an `InlineEdit` for the app's
label (`editAffordance` shows the pencil icon since this is the primary
title field). Props: `{ name, label, icon, onOpenIconPicker, onSaveLabel
}`. Resolves the icon through `resolveAppIcon(icon)` (the single-source-of-
truth icon resolver documented in `frontend-component-contracts`) — renders
`DynamicIcon` for a `'library'`-kind result or `AppIconPlaceholder`
otherwise.

## `AppIconPlaceholder.tsx`

Trivial 5-line component: `<CircleDashed size={13} />`, the no-icon-yet
stand-in used by `AppIdentityRow` both as the button's own display and as
`DynamicIcon`'s `fallback` while a library icon chunk loads.

## `EnvironmentsSection.tsx`

`SectionCard`-wrapped list of an app's `environments` (script name →
enabled checkbox + `startCommand` display), plus a "from package.json (not
added)" candidates sub-list (checkbox-picked, added via one "Add selected"
button) and a scan status line. Fully prop-driven/presentational — no
internal fetching; state and handlers (`scanning`, `scanMsg`, `pendingEnv`,
`candidates`, `picked`, `adding`, `onRefresh`, `onToggleEnv`, `onPick`,
`onAddSelected`) all come from `useAppConfigDetail` via `AppConfigDetail`.
The refresh button in the `SectionCard`'s `action` slot spins a
`Loader2`/`RefreshCw` icon based on `scanning` and is disabled while
scanning.

## `AppDetailsForm.tsx`

`SectionCard`-wrapped "Details" form: Repo path (`InlineEdit` + mono
styling + `CopyButton` when set), Repo URL, App URL (both `InlineEdit` +
`CopyButton`), Placement (native `<select>` over `AppSurface` — `'list'` /
`'dock'`), Depends on (`DependsEditor`), and Groups (`GroupsEditor`). Every
field patches through the passed-down `savePatch`. Props: `{ cfg,
otherApps, allGroups, cfgError, savePatch }`; renders `cfgError` as a
`cfgStatus--error` line at the bottom when a prior patch failed.

## `AppPluginsSection.tsx`

`SectionCard`-wrapped "Plugins" section for one app: a `PluginsEditor` chip
list to attach/detach plugins by id (patches `cfg.plugins`), followed by
one `pluginSettingsGroup` per attached plugin id. Only `'flag-toggle'` has
a real per-plugin settings component (`FlagToggleSettings`) wired in today
— every other plugin id renders a static "No settings" row. This is the
extension point where future plugins would add their own settings
component behind an `pluginId === '...'` branch. Props: `{ cfg, name,
plugins, savePatch }` (`plugins` is the full marketplace-plugin list, used
both to resolve `pluginId` → display name and, since fix, to build the
addable list).

`allPlugins` (the "add a plugin" chip picker's addable options, passed to
`PluginsEditor`) is filtered to `plugins.filter((p) => p.activated && p.enabled)`
(`AppPluginsSection.tsx:26`) — a plugin the user hasn't installed, or has
installed-but-toggled-off, can no longer be attached to an app in the first
place. Previously this list was unfiltered (every marketplace plugin, any
state), which let a deactivated plugin get attached with no error surfaced
anywhere — `pluginDescriptorService.ts`'s `activated && enabled` filter
would just silently skip it (`continue`, no descriptor), in contrast to
`/api/plugins/:id/invoke[/:appName]`'s explicit 400 "plugin is not
activated"/"plugin is disabled" for the identical condition. Already-
attached-but-since-deactivated plugin ids are **not** hidden by this filter
— `PluginsEditor`'s selected chips/remove affordance reads straight from
`cfg.plugins` (the app's own config), not from the filtered `allPlugins`,
so an attachment that predates a later deactivation stays visible/removable
(its chip label just falls back to the raw id, since `plugins.find(...)`
no longer matches it for a name lookup).

## `FlagToggleSettings.tsx`

Frontend field-editing surface for the flag-toggle plugin's per-app
config, implementing the platform/app split documented in full in
`flag-toggle-platform-app-model`. `isFlagTogglePlatform(cfg, name)` treats
an app as platform if `cfg.plugins?.['flag-toggle']?.file` is already a
string, or the app name contains `-platform-` — either signal alone is
sufficient. Non-platform apps render a single "Flag-toggle key" row
(`InlineEdit`, patched via `patchFlagToggle({ key: v })`); platform apps
render "Flag-toggle file" and "Flag-toggle strategy" rows instead — never
both sets on the same app. `patchFlagToggle` merges the patch into
`cfg.plugins['flag-toggle']` and calls the passed-in `savePatch`. Props:
`{ cfg, name, savePatch }`.

## `PluginsEditor.tsx`

Thin `ChipListEditor` wrapper for attaching plugins to one app: selected
keys are `Object.keys(plugins)`, addable options come from `allPlugins`
filtered to exclude already-attached ids, chip label resolves id → plugin
name. `onAdd` sets `plugins[id] = {}` (empty settings object seeding a new
attachment); `onRemove` deletes the key. No create-new-plugin affordance
(`allowCreate` unset) — plugins must already be installed to appear in
`allPlugins`. Props: `{ plugins, allPlugins, onChange }`.

## `DependsEditor.tsx`

Thin `ChipListEditor` wrapper for an app's `dependsOn` list: addable
options are every other app not already in `names`, labeled by
`allApps[k]?.label ?? k`. No create affordance — dependencies must
reference an existing app. Props: `{ names, allApps, onChange }`.

## `GroupsEditor.tsx`

Thin `ChipListEditor` wrapper for an app's `groups` list, the one editor of
the three that sets `allowCreate` — typing a group name not already in
`allGroups` shows a "Create "&lt;query&gt;"" row via `createLabel`, and
`hasExactMatch` suppresses that row once the typed text matches an
existing group exactly. Props: `{ groups, allGroups, onChange }`.

## `ChipListEditor.tsx`

The shared generic chip-list widget backing `DependsEditor`, `GroupsEditor`,
and `PluginsEditor` — the one place chip-add/remove/search/keyboard-nav
logic lives, so the three thin wrappers above only supply per-domain
`chipLabel`/`addable`/`onAdd`/`onRemove` and stay free of duplicated popover
mechanics. Renders selected chips (each with an `X` remove button) plus an
"add" button that opens a search popover (`useOutsideClose` closes it on
outside mousedown; `openUp` flips the popover above the trigger when there
isn't 240px of room below). The popover supports arrow-key navigation
(`activeIndex`), Enter-to-commit (including committing a free-typed value
when `allowCreate` and there are no matching rows), and Escape-to-close.
`hideAddWhenEmpty` hides the add button entirely when `addable` is empty
(used by `DependsEditor`/`PluginsEditor`, not `GroupsEditor` since it can
always create). Exports `ChipOption` and `ChipListEditorProps` interfaces
alongside the component.

## `InlineEdit.tsx`

Shared click-to-edit text/number field used throughout the Dashboard
(labels, repo path/URL, app URL, flag-toggle fields, etc.) and reused
outside it (Settings' `SettingField`/`StorageRow`, per
`frontend-component-contracts`). Non-editing state renders a clickable span
(role="button", Enter/Space also enters edit mode) showing `value` or
`placeholder` (default `'—'`), plus a `Pencil` icon when `editAffordance`
is set. Editing state renders a focused `<input>` seeded from a `valueRef`
(so the effect that seeds the draft only fires on the editing on/off edge,
never on every `value` prop change while mid-edit — this is the same
footgun class as the effect-dependency notes elsewhere in
`frontend-component-contracts`). `commit()` trims the draft, skips the
`onSave` call entirely if the trimmed value is unchanged from the trimmed
current `value`, and tracks a `saving` flag that disables the input while
`onSave` (which may be async) is in flight. Enter commits, Escape reverts
the draft and exits without saving; blur also commits. Props: `{ value,
placeholder?, onSave, type?, className?, editAffordance? }`.

## `ImportProposal.tsx`

Modal overlay shown by `Dashboard.tsx` after a folder is dropped
(`useFolderDrop`). On mount, calls `api.scanProject(path)` and derives
`candidates` (scripts not already present as a `startCommand` on any
existing app), defaulting each candidate's checkbox to its `isRunLike`
flag. Two modes based on `scan.match` (an existing app whose repoPath
matches the dropped folder):
- **Merge** (`scan.match` present): the matched app already picks up the
  repo's scripts through the env filter, so there is nothing to add — the
  proposal only reports the match.
- **New app** (`scan.match` absent): also shows Key/Label input fields
  (`key` pre-filled via local `sanitizeKey(project.name)`, validated
  against `/^[a-z0-9][a-z0-9-]*$/` before submit) and creates the app via
  `api.addApp(key, app)` with `startCommand` taken from the first checked
  script.

Both paths build an `environments` map via `buildEnvironments` (keyed by
its own local `sanitizeKey`, distinct from — but equivalent in shape to —
the shared `lib/keys.ts` `sanitizeKey` used in `useAppConfigDetail.ts`) and
finish with `dispatch(reloadConfig())` then `onClose()`. Props: `{ path,
onClose }`. Clicking the overlay background (not the card itself) also
closes it.

## `PluginsPanel.tsx`

The "Plugins" dashboard tab body (rendered by `Dashboard.tsx` when
`dashboardTab === 'plugins'`). Top: a path/URL input + "Install" button
that dispatches `previewPlugin(src)` (opens `PluginInstallPreview` in
install mode for a manually-typed source). Below that, two lists driven by
one source of truth (`config.plugins`/`config.disabledPlugins`, surfaced
per-plugin as `MarketplacePlugin.activated`/`.enabled` — see
[Backend plugin system](../backend/plugins.md)):

- **Installed** (`plugins.filter((p) => p.activated)`, `PluginsPanel.tsx:26`)
  — each row clickable (`showPluginDetails`) with a `ToggleSwitch` bound to
  `p.enabled` (`setPluginEnabled`, the independent on/off flag —
  *not* the same thing as un-installing) and a trash-icon button titled
  "Remove — moves back to the marketplace list" that dispatches
  `removePlugin(p.id)`. `removePlugin` (both the Redux thunk and the
  `api.ts` method) only **deactivates** the plugin server-side
  (`DELETE /api/plugins/:id` → `setPluginActivated(config, id, false)`) —
  nothing is deleted or renamed on disk, the plugin's `marketplace/<id>/`
  directory is untouched, and it reappears in the Marketplace list below
  since `installed` there tracks the same `activated` flag. The name is a
  holdover from an earlier framing; the button's own tooltip text is
  accurate about what actually happens. Empty-state text ("No plugins
  installed.") is gated on `installed.length > 0`.
- **Marketplace** (`catalog.filter((e) => !e.installed)`, i.e. not yet
  activated) — one `CatalogRow` per entry, loading-gated by
  `catalogLoading`; fetched on mount via `dispatch(fetchCatalog())`. There
  is no separate "Examples" sub-section any more — every catalog entry
  (bundled example or not) that isn't yet activated renders in this one
  list.

Always renders `PluginInstallPreview` at the end (a modal that opens itself
based on Redux `preview` state rather than being conditionally mounted). No
props — fully Redux-driven (`store/slices/pluginsSlice`).

## `PluginInstallPreview.tsx`

Modal shown whenever `s.plugins.preview` is set — today that's only the
manual path/URL "Install" flow in `PluginsPanel.tsx`
(`CatalogRow.tsx` installs directly without opening this modal, see below)
or `showPluginDetails` for an already-listed plugin. Two modes
distinguished by `previewSource` (falsy = `detailsOnly`, i.e. opened via
"show details" on an already-known plugin rather than an install-from-
source flow): details-only shows just a "Close" button; the install flow
shows Cancel + Install (styled `danger` if `manifest.risk` is set),
replaced by a disabled "Installed" button once
`list.some((p) => p.id === manifest.id && p.activated)` (`PluginInstallPreview.tsx:28`
— checks `activated` specifically, not just presence in `list`, since every
marketplace plugin is always present in `list` regardless of activation
state). `install()` dispatches `installPlugin(previewSource)` then, once
that resolves, `fetchCatalog()` so the catalog's `installed` flag state
stays in sync. Escape key (window listener, only attached while `preview`
is truthy) also closes it. No props — reads
`s.plugins.{preview, previewSource, installing, list}`.

## `CatalogRow.tsx`

Single marketplace-catalog entry row: name + description, **not clickable**
(only the explicit "Install" button installs — the row itself deliberately
can't trigger a network install just from reading its description). The
button dispatches `installPlugin(entry.manifestUrl)` directly, then
`fetchCatalog()` once that resolves — it no longer goes through
`previewPlugin`/`PluginInstallPreview` first (an earlier version routed
catalog installs through the preview modal the same way the manual
source/URL input still does; that extra confirm step was dropped for
catalog-sourced installs specifically). Props: `{ entry: CatalogEntry }`.
Used by the single "Marketplace" section in `PluginsPanel.tsx`.
