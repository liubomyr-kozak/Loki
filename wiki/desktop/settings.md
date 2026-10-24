---
type: concept
title: Desktop Settings components
timestamp: "2026-07-24T08:16:30Z"
---

# Desktop Settings components

Every component and hook in `app/src/components/Settings/`. Two distinct
screens live in this folder: **`EnvironmentSettings`** (provider/execution,
environment runtime, storage config — backed by `useEnvironmentSettings` and
the `/config` API) and **`SettingsView`** (app-level prefs — Workspace entry,
config file actions, autostart, theme, quit). The bulk of the folder is the
Environment screen's composition tree: a page (`EnvironmentSettings`) built
from three `SectionCard`s (execution / environment / storage), each rendering
rows (`SelectorRow`, `SettingField`, `BooleanField`, native `<select>`,
`StorageRow`) that share a common left-hand meta block (`SettingsRowMeta`)
and a common per-field save indicator (`FieldStatusIndicator`). All state,
load/patch/redetect/reset network calls, and per-field save status for that
screen are centralized in `useEnvironmentSettings.ts`, keeping every
presentational component here free of its own fetch logic.

See also `wiki/entities/frontend-component-contracts.md` (general component
contracts, including a prior pass over several of these same files) and
`wiki/entities/session-providers-effective-config.md` (the provider/global
config shape these components read and patch).

## Page-level components

### `EnvironmentSettings.tsx`
Top-level page for the Environment/execution settings screen. Calls
`useEnvironmentSettings()` for all state and handlers, renders
`SettingsHeader`, then — once `data` has loaded — `ExecutionSection`,
`EnvironmentRuntimeSection`, and `StorageSection` in sequence, plus a
page-level `.cfgStatus` line reserved for load failures/reset feedback (not
per-field status, which is `FieldStatus`'s job). Shows a loading/empty state
with a Retry button when `data` is `null`.

### `SettingsView.tsx`
The other, unrelated settings screen: general app preferences (not
provider/environment config). Renders three `settingsGroup` blocks —
**Configuration** (open Workspace via `onWorkspaceOpened()`, open config file
in editor via `openConfigInEditor()`, reload config via `reloadConfig()`,
each a `SettingsRowMeta` row), **General** (autostart toggle via
`useAutostart()`), **Appearance** (theme segmented control dispatching
`setTheme`) — plus a `Quit App` button calling `quitApp()`. Reads
`cfgMsg`/`theme` from Redux via `useAppSelector`.

### `useEnvironmentSettings.ts`
The hook backing `EnvironmentSettings`. Owns: `data` (`GlobalConfigResponse`),
`status` (page-level message), `loading`, `redetectingComponent`
(`'tmux' | 'node' | 'shell' | null`), `resetConfirming`/`resetting`, and
`fieldStatus` (per-field `FieldStatusValue` map, FR-17). Exposes `load`,
`patch`, `redetect`, `handleResetClick`. `load()` is wrapped in `useCallback`
with empty deps and guarded by `loadSeqRef` so an overlapping/stale response
can't clobber a newer one; `redetect()` keeps last-known data on screen
during the poll and only swaps in the fresh response if `loadSeqRef` still
matches. `patch(partial, fieldKey?)` marks the field `'saving'`, calls
`api.patchGlobalConfig`, sets `'ok'`/`'error'`, and reloads. `handleResetClick`
implements a two-step confirm (no `window.confirm`, which blocks the WKWebView
main thread): first click arms `resetConfirming` with a 4s auto-disarm timer,
second click within that window calls `doReset()` via `api.resetGlobalConfig`.
Field-status entries auto-idle after 2s (`FIELD_STATUS_RESET_MS`) on
`'ok'`/`'error'`.

## Section components (Environment screen)

### `SectionCard.tsx`
Pure chrome wrapper: icon + title + optional description header, optional
header `action` slot, and a body slot for children. `SectionAccent` is a
closed union (`'execution' | 'environment' | 'storage'`) driving only the
`sectionCard--<accent>` class — one accent per section on the page. Carries
no data or state of its own.

### `ExecutionSection.tsx`
Renders the "Execution" `SectionCard` (icon `SquareTerminal`): a
`role="radiogroup"` of `ProviderCard`s (one per available `ProviderMeta`,
skipping unavailable ones) plus the active provider's `ProviderConfigPanel`.
Implements roving-tabindex arrow-key navigation (`moveSelection`) across only
the *selectable* (available) provider indices, patching
`sessionProvider` and refocusing the newly-selected card. `ProviderConfigPanel`
is remounted via `key={activeMeta?.id}` on provider switch — deliberately, per
an inline `KEEP` comment, because different providers can reuse the same
field `key` with a different `kind`, and remounting avoids React trying to
reconcile a row in place across a kind change.

### `EnvironmentRuntimeSection.tsx`
Renders the "Environment" `SectionCard` (icon `Globe`): two `SelectorRow`s for
Shell (`defaultShell`, redetect id `'shell'`) and Runtime (`nodePath`, redetect
id `'node'`), each sourced from `detected.components` by id lookup
(`shellComponent`, `nodeComponent`). `needsRuntime()` currently always returns
`true` — a hook point for a future runtime-visibility condition, not yet
gating anything.

### `StorageSection.tsx`
Renders the "Storage" `SectionCard` (icon `Folder`): two read-only
`StorageRow`s for the config folder (`detected?.stateDir`) and logs
folder (`detected?.sessionsDir`). Neither row passes `onSave`, so both stay
plain display + "Open folder", not editable.

## Row components

### `FieldRow.tsx`
Dispatches a single provider setting field to the right row/control by
`field.kind`: `'boolean'` → `BooleanField`; `'select'` → an inline native
`<select>` over `field.options` (with its own `SettingsRowMeta`-style meta
block built manually rather than via the shared component, plus
`FieldStatusIndicator`); text/path fields are matched against
`detected.components` by camelCase-prefix (e.g. `tmuxBin` ~ `tmux`,
`nodePath` ~ `node`) and routed to `SelectorRow` if a match is found,
otherwise to `SettingField`. The camelCase-prefix match (exact id match, or
id followed by an uppercase letter) is called out in an inline comment as a
genuine footgun, kept deliberately explicit rather than a plain substring
match, to stop an unrelated future field from silently rerouting to the
wrong detected component. Also owns `fieldIcon(key)`, a keyword-based icon
picker (restart/stale → `RotateCw`, bin/tmux → `SquareTerminal`,
prefix/session → `Tag`, socket → `Podcast`, attach → `Link2`, else `Cog`).

### `SelectorRow.tsx`
Row for a path-with-candidates field (Shell, tmux binary, Runtime): native
`<select>` over `candidates` plus a `"Custom path…"` sentinel option
(`CUSTOM_OPTION`) that swaps the row into `InlineEdit` custom-entry mode; a
per-field redetect button (spinner while `redetecting`); a found/missing
status badge (`CheckCircle2`/`XCircle`) driven by `found` (falls back to
`candidates.length > 0`). Documented constraint (inline comment): `SelectorRow`
does **not** attach its own arrow-key handling — it relies on the native
`<select>`'s built-in keyboard cycling — so callers must render it as a
sibling of other `.settingsItem` rows, outside any
`.providerCards[role=radiogroup]` container, or its roving-tabindex
`moveSelection` handler (see `ExecutionSection`) would fight the native
select's arrow keys.

### `SettingField.tsx`
Inline-edit row (`InlineEdit`) for a plain text/path provider field. Renders
a "Choose folder" button (`openFolder`) only when `field.kind === 'path'`,
and a `CopyButton` only when `field.copyable && value`. Per
`frontend-component-contracts.md`, the folder button reuses `openFolder`
(opens the path in the OS file manager/editor) rather than a native
file-picker dialog — that's the deliberate design, not a placeholder.

### `BooleanField.tsx`
Native checkbox styled as a switch (`role="switch"`, `aria-checked`) for a
boolean provider field (e.g. tmux's "Restart stale sessions"). Patches the
raw boolean value directly — no string coercion.

### `StorageRow.tsx`
Displays a detected storage path: read-only text input plus an "Open folder"
button (disabled when `path` is falsy). When `onSave` is supplied, the path
input becomes editable via `InlineEdit` instead of the plain read-only
`<input>` — currently unused by `StorageSection`'s two calls, but supported
by the component.

## Shared primitives

### `SettingsRowMeta.tsx`
The shared `.meta` cell (icon → name → optional tip-bubble → optional desc)
used by every settings row (`SelectorRow`, `SettingField`, `BooleanField`,
`StorageRow`, and the Configuration rows in `SettingsView`). Only the
left-hand meta block is extracted here — the control side (select /
`InlineEdit` / switch / chevron) differs per row and stays owned by each
caller. `tip` renders a `?`-trigger with a `role="tooltip"` bubble;
`tipAriaLabel` overrides the accessible name when `label` isn't a plain
string.

### `FieldStatus.tsx`
Exports `FieldStatusValue` (`'idle' | 'saving' | 'ok' | 'error'`) and
`FieldStatusIndicator`, a small check/spinner/x shown next to a field's
control right after a patch. Renders `null` while `'idle'` — this is the
per-row counterpart to the page-level `.cfgStatus` line in
`EnvironmentSettings`, which stays reserved for load failures and reset
feedback.

### `ProviderConfigPanel.tsx`
Always-visible sub-section for a provider's advanced settings — every field
on the active `ProviderMeta` with `field.advanced === true`. Returns `null`
when there are no advanced fields for that provider (nothing to show, no
empty section chrome). Renders a header (icon, provider label +
"configuration", `activeMeta.advancedDescription` or a generic fallback
description) followed by one `FieldRow` per advanced field, keyed by
`field.key`.

### `ProviderCard.tsx`
One selectable card in `ExecutionSection`'s radiogroup: `role="radio"`,
`aria-checked`, roving `tabIndex` (0 for the selected card, -1 otherwise, set
by the caller). Renders `ProviderIcon`, label, an optional "Recommended"
badge, description, and a benefits list (`CheckCircle2` bullets when
`recommended`, plain dots otherwise). `disabled` (from `!meta.available`)
suppresses the `onClick`.

### `ProviderIcon.tsx`
Maps a provider's `icon` string (or its `id` as fallback) to a `lucide-react`
icon via a lowercase keyword switch: terminal/tmux → `SquareTerminal`,
layers/detached/process → `Layers`, settings-2/init-service/service/
systemd/launchd → `Cog`, app-window/windows-service/windows → `MonitorCog`,
else a generic `Box`. Pure presentational lookup, no state.

### `SettingsHeader.tsx`
Page header for `EnvironmentSettings`: title + subtitle, plus the "Reset to
defaults" button. Implements the visible half of the two-step confirm
described under `useEnvironmentSettings` — an inline `"Confirm reset?"` label
swap rather than `window.confirm` (documented in the component's own comment
as blocking the WKWebView main thread if used). All confirm/resetting state
is owned by the parent hook, not this component, so it can be reverted from
a single timer and disabled while the request is in flight.

### `CopyButton.tsx`
Copy-to-clipboard affordance shared by copyable settings fields
(`SettingField`, gated on `field.copyable`) and usable elsewhere for
storage-path-style rows. Shows a checkmark for ~1.5s after a successful
`navigator.clipboard.writeText`, then reverts to the copy icon; logs (does
not surface) failures via `console.error`.

## File inventory (19 files documented)

`BooleanField.tsx`, `CopyButton.tsx`, `EnvironmentRuntimeSection.tsx`,
`EnvironmentSettings.tsx`, `ExecutionSection.tsx`, `FieldRow.tsx`,
`FieldStatus.tsx`, `ProviderCard.tsx`, `ProviderConfigPanel.tsx`,
`ProviderIcon.tsx`, `SectionCard.tsx`, `SelectorRow.tsx`, `SettingField.tsx`,
`SettingsHeader.tsx`, `SettingsRowMeta.tsx`, `SettingsView.tsx`,
`StorageRow.tsx`, `StorageSection.tsx`, `useEnvironmentSettings.ts` — all
under `app/src/components/Settings/`.
