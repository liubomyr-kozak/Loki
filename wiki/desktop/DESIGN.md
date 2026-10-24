---
type: Design System
title: Desktop UI Design System
description: Design-token and style reference for the desktop launcher/popover — dark-first, flat-elevation, green-accent — extracted verbatim from styles.css and the Settings/Dashboard components.
tags: [desktop, design, tokens, css, styleguide]
timestamp: "2026-07-22T00:00:00Z"
---

# Desktop UI Design System

## Overview

The desktop app is a transparent, undecorated Tauri popover window (`.app` — `100vw × 100vh`, `border-radius: 10px`, no title bar) that hosts a launcher list, a Settings view, and a full-screen Dashboard overlay. **Dark is the default theme** — every token is defined first on `:root`, then overridden inside a single `html[data-theme="light"]` block. There is no light-first fallback anywhere: any new token must be added to both blocks or it silently renders wrong in one theme.

The system runs on the OS system-font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) at a 13px base size — no custom webfont, no display/body weight split. Hierarchy comes from size, weight, and color, not from a typeface change.

**HARD RULE — box-shadow is forbidden for elevation.** `styles.css` opens with a literal, repeated comment block prohibiting `box-shadow` anywhere in the file ("BOXSHADOW_IS_FORBIDDEN_PERMANENTLY_AND_COMPLETELY — IF YOU FEEL LIKE ADDING BOX-SHADOW, DELETE THIS FILE INSTEAD"). Elevation is entirely **flat**: separation between surfaces comes from background-on-background contrast (`--bg-primary` cards on `--bg-list`/`--bg-secondary` page) plus 1px hairline borders and dividers. (Two pre-existing `box-shadow` declarations survive in the file today as drop-shadows in violation of this rule — see Known Gaps.) There is exactly **one** sanctioned exception: an outset, zero-blur `box-shadow: 0 0 0 Npx` ring used as a focus/edit highlight (`.appConfigHeaderTitleEdit.inlineEditInput`) — see "State transitions must not shift layout" under Do's and Don'ts and the Elevation & Depth section for why a ring, specifically, is exempt.

The brand accent is **green** (`--accent-execution` / `--dot-running`, `#3ecf6b` dark / `#2fa650` light) — it marks "running", "execution", primary confirm actions, and the dominant dashboard gradient. Blue marks "environment" data (version/branch chips, the environment accent), teal marks "storage". Chips are color-coded per data type: version = blue, environment = green, branch = blue, and a purple `v2` variant.

**Key Characteristics:**
- Dark is the default and authoritative theme; light is a full parallel override block, never a fallback.
- No box-shadow for elevation/drop-shadows — flat elevation via contrast + 1px hairlines only. The one exception is a zero-blur outset ring on an edit/focus highlight, because a border there would grow the box and shift text.
- Green (`--accent-execution`) is the single primary/confirm accent; blue = environment, teal = storage.
- System font stack, 13px base — no custom typeface, no font-weight-driven brand voice.
- Controls standardize on 36px height / 7px radius; toggles are 30×17 pill switches with a 13px thumb.
- Uppercase, letter-spaced micro-labels (chip labels, group headers, settings-group titles) carry the "section" role instead of a heavier type ramp.
- The Dashboard overlay is the one place with a gradient surface (`--dashboard-shell`) — everywhere else is flat solid color.

## Colors

All tokens are CSS custom properties defined on `:root` (dark, default) and re-declared inside `html[data-theme="light"]`.

### Surface

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{surface.primary}` → `--bg-primary` | `#0e1a15` | `#ffffff` | Header, group card, row group, settings card row, modal card, dock bar |
| `{surface.secondary}` → `--bg-secondary` | `#16261f` | `#f5f5f5` | Session dropdown menu (`.sessionsDropdown`), drop-overlay text chip, inline-edit hover bg |
| `{surface.tertiary}` → `--bg-tertiary` | `#1c2f26` | `#eeeeee` | Segmented-control track, plugin button, modal button, catalog input |
| `{surface.list}` → `--bg-list` | `#242a28` | `#f3f7f3` | `.app` root background, scrollable list background |
| `{surface.settingsCard}` → `--bg-settings-card` | `#122019` | `#f0f5f3` | Provider card, plugin list, reset button (`.sectionCard` itself is now transparent — see Elevation & Depth) |

### Hairlines / Borders

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{border.primary}` → `--border-primary` | `#303035` | `#e0e0e0` | Header/group-card/dock border, all 36px control borders |
| `{border.secondary}` → `--border-secondary` | `#2a2a2f` | `#d5d5d5` | Row divider (`.row`, `.sessionsRow`) |
| `{border.settings}` → `--border-settings` | `#21342a` | `#d9e8e3` | Section-card / provider-card / plugin-list border |
| `{border.settingsItem}` → `--border-settings-item` | `#1b2b22` | `#e5ebe8` | Divider between stacked `.settingsItem` rows, config rows |
| `{border.tooltipBorder}` → `--tooltip-border` | `#45454d` | `#1f2430` | Branch tooltip bubble border |
| `{border.popover}` → `--popover-border` / `--popover-border-top` | `#2f4339` / `#3a5547` | `#d4dcd8` / `#ffffff` | Dependency-picker popover border; also the chip-picker menu (`.pickerMenuPortal`, `.pickerSeparator`, `.pickerSearchInput`) border |
| `{border.popoverRing}` → `--popover-ring` | `#0a1410` | `#eef2f0` | Outer 1px ring outside `--popover-border` |

### Text

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{text.primary}` → `--text-primary` | `#e6e6e6` | `#1a1a1a` | Body text, row label, settings item name, dashboard chrome |
| `{text.secondary}` → `--text-secondary` | `#9aa` | `#666` | Header summary, icon-button default, session label |
| `{text.muted}` → `--text-muted` | `#888` | `#999` | Placeholders, empty states, meta captions |
| `{text.label}` → `--text-label` | `#bbb` | `#555` | Picker menu item text, switch label |
| `{text.settingsGroup}` → `--text-settings-group` | `#6b8278` | `#5a7d6e` | Section-card description, settings-group title, config sub-title |
| `{text.groupHeader}` → `--text-group-header` | `#6b8278` | `#5a7d6e` | App-list group header label (same value as settingsGroup) |
| `{text.envCmd}` → `--env-cmd-text` | `#888` | `#6f6f6f` | Monospace environment command preview |
| `{text.error}` → `--error-text` | `#ff8a8a` | `#c03a3a` | Row error text, modal danger banner text |

### Semantic (status dots)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{semantic.dotInactive}` → `--dot-inactive` | `#666` | `#999` | Stopped-app status dot border |
| `{semantic.dotRunning}` → `--dot-running` | `#3ecf6b` | `#2fa650` | Running-app dot, active picker item, session dot, long-press pill bg |
| `{semantic.dotWarning}` → `--dot-warning` | `#e6b800` | `#d4a600` | Port-conflict dot, dirty-badge, unmanaged switch label |
| `{semantic.dotError}` → `--dot-error` | `#e65555` | `#d93a3a` | Unhealthy dot, conflict badge, provider-card reason text |

### Star / Toggle / Switch

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{control.starInactive}` → `--star-inactive` | `#555` | `#bbb` | Favorite star, off state |
| `{control.starActive}` → `--star-active` | `#f5c518` | `#f5c518` | Favorite star, on state (identical both themes) |
| `{control.toggleOff}` → `--toggle-off` | `#2f7d3a` | `#4a9d56` | "Stop"-styled toggle pill background when app is running (Start action) |
| `{control.toggleOn}` → `--toggle-on` | `#b13a3a` | `#d93a3a` | Toggle pill background when app is stopped (Stop action shown) |
| `{control.toggleText}` → `--toggle-text` | `#fff` | `#fff` | Text on the start/stop toggle pill |
| `{control.switchSliderOff}` → `--switch-slider-off` | `#3a3a42` | `#e0e0e0` | Legacy `.switch` slider track, off |
| `{control.switchSliderOn}` → `--switch-slider-on` | `#2f7d3a` | `#4a9d56` | Legacy `.switch` slider track, on |
| `{control.switchDot}` → `--switch-dot` | `#ddd` | `#fff` | Legacy `.switch` slider thumb |
| `{control.toggleTrackOff}` → `--toggle-track-off` | `#3a3a42` | `#e0e0e0` | `BooleanField`/`.switch` (Boolean checkbox) track, off |
| `{control.toggleTrackOn}` → `--toggle-track-on` | `#3ecf6b` | `#2fa650` | `BooleanField`/`.switch` (Boolean checkbox) track, on — reuses the running-green |
| `{control.toggleThumb}` → `--toggle-thumb` | `#ddd` | `#fff` | `BooleanField` switch thumb |

### Chips (version / environment / branch / v2)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{chip.versionText}` → `--chip-version-text` | `#7eb8d4` | `#2a7aaa` | Version-chip and branch-chip value text (both reuse this token) |
| `{chip.versionLabel}` → `--chip-version-label` | `#4a7d99` | `#6aaace` | Version-chip / branch-chip uppercase label |
| `{chip.versionHoverBg}` → `--chip-version-hover-bg` | `rgba(126,184,212,.07)` | `rgba(42,122,170,.07)` | Version/branch chip hover fill |
| `{chip.versionV2Text}` → `--chip-version-v2-text` | `#a78bfa` | `#7c3aed` | v2-variant version-chip value (purple accent) |
| `{chip.envText}` → `--chip-env-text` | `#8ecf8e` | `#2a8a2a` | Environment-chip value text |
| `{chip.envLabel}` → `--chip-env-label` | `#4a8a4a` | `#5aaa5a` | Environment-chip uppercase label |
| `{chip.envHoverBg}` → `--chip-env-hover-bg` | `rgba(142,207,142,.07)` | `rgba(42,138,42,.07)` | Environment-chip hover fill |

### Accents (execution / environment / storage)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{accent.execution}` → `--accent-execution` | `#3ecf6b` | `#2fa650` | Execution SectionCard icon/border, provider-card selected state, checkbox accent |
| `{accent.executionBg}` → `--accent-execution-bg` | `rgba(62,207,107,.12)` | `rgba(47,166,80,.1)` | Execution icon tile background, selected provider-card fill, running count-pill fill |
| `{accent.environment}` → `--accent-environment` | `#7eb8d4` | `#2b7fd1` | Environment SectionCard icon, stash badge dot |
| `{accent.environmentBg}` → `--accent-environment-bg` | `rgba(126,184,212,.12)` | `rgba(43,127,209,.08)` | Environment icon tile background |
| `{accent.storage}` → `--accent-storage` | `#4dd0c4` | `#0f9b8e` | Storage SectionCard icon |
| `{accent.storageBg}` → `--accent-storage-bg` | `rgba(77,208,196,.12)` | `rgba(15,155,142,.08)` | Storage icon tile background |

### Popover / Overlay

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{popover.bg}` → `--popover-bg` | `#16231d` | `#ffffff` | Dependency-editor popover background; also the chip-picker menu (`.pickerMenuPortal`) fill |
| `{popover.itemHover}` → `--popover-item-hover` | `#1d3026` | `#f0f5f3` | Popover list item hover |
| `{row.hover}` → `--row-hover` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.04)` | Dashboard list row hover, config row hover |
| `{icon.btnHover}` → `--icon-btn-hover` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.06)` | Generic `.iconBtn`/`.segBtn` hover fill |
| `{tooltip.bg}` / `{tooltip.fg}` → `--tooltip-bg` / `--tooltip-fg` | `#2c2c34` / `#f0f0f0` | `#1f2430` / `#ffffff` | Branch tooltip bubble |

### Dashboard shell

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{dashboard.shell}` → `--dashboard-shell` | `linear-gradient(160deg,#1c4a37,#0f2e22)` | `linear-gradient(45deg,#f3f7f3,#dcebe1)` | Full-bleed background behind the dashboard overlay — the one gradient surface in the system |
| `{dashboard.cardBg}` → `--dashboard-card-bg` | `#0e1a15` | `#ffffff` | Dashboard detail panel background |
| `{dashboard.tabTrack}` → `--dashboard-tab-track` | `rgba(255,255,255,.06)` | `rgba(0,0,0,.06)` | Tab-segment track background |
| `{dashboard.tabActiveBg}` → `--dashboard-tab-active-bg` | `rgba(255,255,255,.10)` | `#ffffff` | Active tab / selected list row fill |
| `{dashboard.closeHover}` → `--dashboard-close-hover` | `rgba(255,255,255,.08)` | `rgba(0,0,0,.08)` | Close-button hover fill |

### Buttons (force / quit / group)

| Token | Dark | Light | Usage |
|---|---|---|---|
| `{btn.forceBg}` / `{btn.forceText}` / `{btn.forceBorder}` → `--force-btn-*` | `#5a3a1a` / `#ffd28a` / `#7a531f` | `#f0e0cc` / `#8b5a00` / `#d4a600` | Force-kill inline confirm buttons |
| `{btn.groupInactive}` → `--group-btn-inactive` | `#4a5c55` | `#7a9a8e` | Group-header action icon, default |
| `{btn.groupHover}` → `--group-btn-hover` | `#7a9a8e` | `#5a7d6e` | Group-header action icon, hover |
| `{btn.groupActive}` → `--group-btn-active` | `#3ecf6b` | `#2fa650` | Group-header action icon, active/toggled |
| `{btn.groupActiveBg}` → `--group-btn-active-bg` | `rgba(62,207,107,.12)` | `rgba(47,166,80,.12)` | Group-header hover fill, summary hover |
| `{btn.quitText}` / `{btn.quitBorder}` → `--quit-btn-*` | `#c96a6a` / `#4a2727` | `#d93a3a` / `#e0b0b0` | Quit button, resting |
| `{btn.quitHover}` / `{btn.quitHoverBorder}` → `--quit-btn-hover*` | `#2a1818` / `#5a2f2f` | `#fce8e8` / `#e08888` | Quit button, hover |
| `{settings.itemHover}` → `--settings-item-hover` | `#15261d` | `#e8efe9` | Clickable settings-item / plugin-list / catalog row hover |
| `{settings.chevron}` → `--settings-chevron` | `#4f6359` | `#8a9a8e` | Settings-item disclosure chevron |
| `{cfg.status}` → `--cfg-status` | `#7fae8d` | `#4a7d6e` | Config status line, placeholder select text |

## Typography

### Font Family

The system runs the OS default UI stack only — no custom or licensed typeface:

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

Monospace contexts (env command preview, repo path, code chips) use:

```
ui-monospace, 'SF Mono', Menlo, monospace
```

Base body size is **13px** (`body` selector), set once at the root and inherited everywhere; every other size in the hierarchy below is a deviation from that base.

### Hierarchy

| Element | Size | Weight | Letter Spacing | Text Transform | Use |
|---|---|---|---|---|---|
| `.settingsHeaderTitle` | 21px | 700 | -0.01em | none | Settings page H1 ("Environment") |
| `.appConfigHeaderTitleEdit` | 16px | 600 | — | none | App-config detail panel header — inline-editable app title |
| `.dropOverlayText` | 15px | 600 | — | none | Drag-and-drop import overlay message |
| `.label` (row) | inherits 13px | 600 | — | none | App row name |
| `.sectionCardTitle` | 13px | 600 | — | none | SectionCard title (Execution/Environment/Storage) |
| `.settingsItem .name` | 13px | 500 | — | none | Settings-row field name |
| `.storageRowInput` / `.selectorRowSelect` / `.inlineEdit*` | 13px | 400 | — | none | Control text (36px-height inputs/selects) |
| `.providerCardTitle` | 13px | 600 | — | none | Provider radio-card title |
| `.pluginName` | inherits 13px | 500 | — | none | Installed-plugin name |
| `.configVersionTitle` | 12px | 600 | — | none | "Config Version N" title |
| `.summary` | 12px | 400 | — | none | Header summary text |
| `.configVal` | inherits 12px (from `.configRow`) | **400** | — | none | Config/settings detail-row value text — matches Settings field weight, never 500 |
| `.envCmd` | 12px (mono 10px variant on `.envCmd`) | 400 | — | none | Environment command preview |
| `.chipValue` | 12px | 500 | — | none | Chip value (version/env/branch number) |
| `.pickerItem` | 12px | 400 (600 active) | — | none | Chip dropdown menu item |
| `.settingsHeaderSubtitle` | 12px | 400 | — | none | Settings H1 subtitle |
| `.groupCountPill` | 11px | 600 | 0 | none | Group row count badge |
| `.sectionCardDesc` / `.settingsGroupTitle` label context | 11px | 600 | 0.6px | uppercase | Settings-group title |
| `.sectionCardDesc` | 11px | 400 | — | none | SectionCard description line |
| `.configSectionTitle` | 11px | 600 | 0.6px | uppercase | App-config detail section title |
| `.dockBar .appTileLabel` | 9px | 400 | — | none | Dock-tile caption |
| `.chipLabel` | 9px | 600 | 0.06em | uppercase | Chip micro-label ("VER"/"ENV") |
| `.providerBadge` | 9px | 700 | 0.4px | uppercase | "Recommended" provider badge |
| `.groupHeader` | 10px | 700 | 0.8px | uppercase | App-list group header ("ADMIN PAGES") |
| `.configSubTitle` | 10px | 600 | 0.5px | uppercase | Config-detail sub-heading ("Environments", "Details") |
| `.envCandidatesTitle` | 10px | 400 | 0.4px | uppercase | "From package.json (not added)" |
| `.configVersionBadge` | 10px | 600 | 0.3px | uppercase | Version pill badge |
| `.toggle` | 11px | inherits | — | none | Start/Stop pill button label |

### Principles
- **No custom typeface** — the OS system-UI stack does the whole job; hierarchy is carried entirely by size/weight/color, not font family.
- **Uppercase + letter-spacing marks a "section" role**, never body copy: chip labels (9px/0.06em), group headers (10px/0.8px), settings-group titles (11px/0.6px), config sub-titles (10px/0.5px). This is the system's only substitute for a heavier display weight.
- **600 is the dominant emphasis weight** — labels, titles, and pill text almost never go to 700 except uppercase micro-labels (group header, provider badge).
- **13px is the working size for controls** — every input/select/inline-edit box locks to 13px regardless of context, so mixed rows (text + select + button) read as one line.

### Note on Font Substitutes
Because the stack is already the OS default (`-apple-system` / `Segoe UI`), there is no substitute to document — this *is* the fallback-safe choice. No webfont loading, no FOUT/FOIT concerns.

## Layout

### Spacing System
- **Not a single fixed base unit** — the file uses a denser near-4px ladder tuned per control, not a strict 8px grid:
- **Tokens observed:** `4px` · `6px` · `8px` · `9px` · `10px` · `12px` · `14px` · `16px` · `18px`.
- `4px` — `.header`/`.list` outer margins, chip caret gap, groupHeader margin.
- `6px` — inline icon-to-label gaps (`.switch`, `.groupHeader`), sectionCard body gap sub-unit.
- `8px` — `.rowMain`/`.rowControls` column gap, `.settings` inter-section vertical padding baseline, `.appConfigDetail` internal row gaps.
- `9px`/`10px` — row vertical padding (`.row` 9px, `.settingsItem` 11px≈10px), sectionCardHeader gap.
- `12px` — `.sectionCard` gap, `.providerCards` gap, `.groupCard` bottom margin base.
- `14px` — `.header`/`.dockBar` horizontal padding, `.settings` outer padding.
- `16px` — `.groupCard` bottom margin, `.sectionCard` padding, `.list` vertical padding, `.appConfigDetail` gap.
- `18px` — `.settings` section gap, `.appConfigDetail` gap, list scroll mask-fade distance.

### Grid & Container
- **Popover window:** fixed viewport (`100vw × 100vh` inside the Tauri window frame — not a resizable browser layout).
- **`.rowControls` meta grid:** `grid-template-columns: 70px 1fr auto` — version/env column fixed at 70px, branch column flexible, trailing controls auto — keeps version/env aligned across every row in a group regardless of branch-name length.
- **`.sectionCard .settingsItem` grid:** `grid-template-columns: minmax(0,1fr) minmax(200px,440px)` — label column flexes, control column bounded 200–440px so long paths don't clip but short controls don't stretch full width.
- **Dashboard body:** `.dashboardList` fixed at `260px`, `.dashboardDetail` flexes to fill the remainder.

### Whitespace Philosophy
The popover is information-dense by design (a launcher, not a marketing page) — padding stays in the 8–18px band throughout, with **no** section ever reaching the kind of 60–80px breathing room a marketing site would use. Density is deliberate: rows are 44px min-height, section cards pack a header + body in 12px gap, and settings groups stack tightly at 18px apart. The one generous space is the dashboard's 16px detail-panel padding and 260px sidebar — still modest by comparison to a full desktop app.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | No shadow, no border, background-on-background contrast only | `.app` root, `.list`, `.dashboard` shell, `.sectionCard` (transparent since the horizontal-padding removal — see Components) |
| Hairline card | 1px `--border-primary`/`--border-settings` border, `--bg-primary`/`--bg-settings-card` fill | `.header`, `.groupCard`, `.dockBar`, `.settingsCard`, `.providerCard` |
| Hairline card (no clip) | 1px `--border-settings` border, **10px radius**, `--bg-primary` fill, explicitly **not** `overflow: hidden` (field `?` tooltips must pop above the first row and escape the card rather than clip) | `.settingsCardGroup` / `.providerConfigPanelBody` — child `.settingsItem`/`.configRow`/`.envRow` rows (`.settingsCardGroup > .configRow, .settingsCardGroup > .envRow`) get 14px left/right padding to seat inside the card, and `--border-settings-item` top-border dividers between them |
| Divider-only stack | No border around the group, 1px `--border-settings-item`/`--border-secondary` between children only | Stacked `.settingsItem` rows, `.configRow`/`.envRow` list, `.row` list inside a group |
| Overlay ring | 1px border + secondary 1px outline (`--popover-ring`) | `.depPopover` (double-ring instead of shadow to read as "floating") |
| Highlight ring (sanctioned box-shadow exception) | Outset, zero-blur `box-shadow: 0 0 0 1px var(--accent-execution), 0 0 0 4px var(--accent-execution-bg)`, no border | `.appConfigHeaderTitleEdit.inlineEditInput` — the edit-mode ring on the app-config header title |

The system explicitly rejects **drop shadows** — depth comes from (a) `--bg-primary`/`--bg-settings-card` cards sitting on the darker/lighter `--bg-list`/page background, and (b) 1px hairline borders and dividers marking every card and row boundary. Two `box-shadow: 0 1px 2px rgba(0,0,0,.06)` declarations remain on `.header` and `.dockBar` despite the rule — treat these as a bug to clean up, not a pattern to copy (see Known Gaps).

**The one carve-out is a highlight ring, not elevation.** A focus/edit affordance that must not shift layout (see "State transitions must not shift layout" in Do's and Don'ts) cannot use a border — a border adds to the box's rendered size and pushes the text inside it. `box-shadow` in its outset, zero-blur `0 0 0 Npx` form paints entirely outside the element's layout box, so it can ring a control without resizing it. This is the only place `box-shadow` is allowed in the file: reuse `--accent-execution` + `--accent-execution-bg` (`.appConfigHeaderTitleEdit.inlineEditInput`), never add blur, and never use it to fake a drop shadow.

### Decorative Depth
- **Dashboard gradient** (`--dashboard-shell`) — the one deliberate departure into a soft diagonal gradient, reserved for the full-screen dashboard overlay only; every other surface stays flat solid color.
- **List scroll mask-fade** — `.list` uses a `mask-image` linear gradient (18px fade top/bottom) instead of a shadow to signal "more content below the header/dock" — a non-shadow depth cue.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| 4px | `.pickerTrigger`, `.pluginInstallInput`, `.summary`, `.modalRow code` | Small inline chips/badges, code pill |
| 5px | `.pluginBtn`, `.groupActionPill`, `.depSearch`, `.groupBtn`/`.settingsBtn` (6px variant below), `.depListItem` | Compact action buttons |
| 6px | `.groupBtn`, `.settingsBtn`, `.summary` hover, `.iconBtn` (26px), `.configRefreshBtn` | Icon buttons, group actions |
| 7px | controls: `.storageRowInput`, `.selectorRowSelect`, `.inlineEdit*`, `.settingsResetBtn`, `.segmented`, `.settingsItemControl .segBtn`/`.iconBtn` | **Dominant control radius** — every 36px-height input/select/button |
| 8px | `.sectionCard` (moot — see Elevation & Depth), `.pluginList`, `.settingsCard`, `.providerCard`, `.providerConfigPanel`, `.modalCard`(10px)… `.depPopover` | Cards, panels |
| 9px | `.switch .slider`/`.booleanFieldLabel input` (pill track), `.groupCountPill`, `.depChip`/`.depAdd` | Pill-shaped toggle tracks and count/dep chips |
| 10px | `.app`, `.header`, `.groupCard`, `.dockBar`, `.dashboard`, `.groupHeader`, `.dashboardListRow`, `.modalCard`, `.appTileMain`, `.pickerMenuPortal`, `.settingsCardGroup`/`.providerConfigPanelBody` | **Window/major-surface radius** |
| 12px | `.dashboardDetail` | Dashboard detail panel — the single largest radius in the system |
| 50% | `.dot`, `.star` circle context, `.sessionDot`, `.envCheckbox`, `.providerCardDot`, `.appTileBadges .pluginBtn` | Circular status indicators, radio dots, avatar-style badges |

The radius hierarchy is functional, not decorative: **7px is the control unit** (every input/select/button that shares the 36px height also shares this radius), **10px is the surface unit** (window, header, cards, dashboard), and circular (`50%`) is reserved strictly for status/selection indicators — never for buttons or cards.

## Components

### App Row
Anatomy: `.row` (min-height 44px, 9px 14px padding) → `.rowMain` (flex, 8px gap) holding a status `.dot` (9×9px circle, 0.75px border colored by state) or a drag `.rowIconHandle`, the `.label` (flex-1, 600 weight, ellipsis), a `.star` favorite toggle, `.termBtn`/`.branchBtn` icon buttons — then `.rowControls` below (`grid-template-columns: 70px 1fr auto`) holding version/env/branch `.pickerTrigger` chips and the `.toggle` start/stop pill (`--toggle-off`/`--toggle-on` background, 4px radius, 2px 9px padding). Rows sit inside a `.groupCard` (10px radius, 1px `--border-primary`, `--bg-primary` fill) with only the last row's `border-bottom` removed.

### Chip Picker
Anatomy: `.pickerTrigger` (transparent button, 4px radius, 2px 5px padding) → `.chipLabel` (9px/600/0.06em uppercase, colored by variant — `--chip-version-label`/`--chip-env-label`) stacked above `.chipValue` (12px/500, `--chip-version-text`/`--chip-env-text`) with a `.chipCaret` (8px, 0.55 opacity) and an optional `.pickerBadge` (6px dot: dirty=amber, stash=blue, conflict=red). Hover fills with the variant's `*-hover-bg` token.

The dropdown's chrome lives on a **portaled wrapper**, not on the listbox itself — `Picker.tsx` renders `.pickerMenuPortal` as a top-level portal div that supplies all visual chrome: `--popover-bg` fill, `border: 1px solid --popover-border` + `border-top: 1px solid --popover-border-top`, **10px radius**, 5px padding, `min-width: 180px` / `max-width: 300px`, `overflow-y: auto; overflow-x: hidden`. It is the scroll container. Position/`left`/`top`/`max-height`/`z-index` are all set inline per instance via `useAnchoredPosition`, not in CSS.

Inside that portal, `.pickerMenu` is now a bare listbox: `display: flex; flex-direction: column; outline: none` — no background, border, or radius of its own. Its rows are `.pickerItem`: flex row, 8px gap, 30px height, `6px 10px` padding, 6px radius, 12px font, `--text-label` color, ellipsis-clipped. `.pickerItem.active` is `--dot-running` + 600 weight; `.pickerItem.cursor` — the keyboard-navigation highlight — is `--popover-item-hover`, a **distinct** state from the plain `:hover` fill (`--bg-tertiary`).

Supporting sub-classes: `.pickerItemLabel` (flex ellipsis text), `.pickerItemCheck` (trailing check icon slot), `.pickerItemDropStash` (`--text-muted` — the drop/stash action row), `.pickerSeparator` (1px `--popover-border` rule, `4px 6px` margin), `.pickerMenuEmpty` (centered `--text-muted` "no matches" state), `.pickerSearchInput` (flex row, `--bg-tertiary` fill, 1px `--popover-border`, 4px radius) wrapping a bare `.pickerSearchInput input` (transparent, `outline: none`, `font-size: 0.82rem`).

### Section Card
`SectionCard` (`components/Settings/SectionCard.tsx`) props: `icon`, `accent` (`'execution' | 'environment' | 'storage'`), `title`, `description?`, `action?`, `children`. `.sectionCard` is **transparent and borderless**: flex column, 12px gap, `padding: 16px 0` — horizontal padding was removed specifically so the section's content (icon, title, body) left-aligns flush with the page title instead of sitting indented inside its own card. The 8px `border-radius` is still declared but is moot with no border or fill to round. Anatomy above that flat shell: `.sectionCardHeader` (icon + title/desc + optional action, 10px bottom border) with a `.sectionCardIcon` (30×30px tile, 7px radius) colored per accent variant — `sectionCard--execution` (`--accent-execution` on `--accent-execution-bg`), `--environment` (blue), `--storage` (teal) — then `.sectionCardHeaderText` wrapping `.sectionCardTitle` (13px/600) + `.sectionCardDesc` (11px, `--text-settings-group`), and a `.sectionCardBody` (flex column, 10px gap) holding the section's rows/cards, which are the components that now carry the actual card chrome (see Elevation & Depth). Used for Execution/Environment/Storage on the Environment settings page (`EnvironmentSettings.tsx`) and for Environments/Details/Plugins on the App Config Detail panel (`AppConfigDetail.tsx` — see below).

**`action` prop — where section-scoped controls live.** When a section needs its own control (e.g. the Environments section's Refresh/rescan button), pass it as `action`; `SectionCard` renders it right-aligned in the header as `.sectionCardHeaderAction` (`flex-shrink: 0`, top-aligned). Rule: a control that only affects one section's content belongs in that section's `action` slot, never hoisted to a shared panel-level header — the panel header is reserved for identity (icon + title), not per-section actions.

### App Config Detail Panel
`AppConfigDetail.tsx` (the Dashboard's per-app detail view) is composed of `SectionCard`s, each wrapping a `.settingsCardGroup` bordered row card — the same language as the Settings page (see Hairline card (no clip) under Elevation & Depth). Rows inside (`.configRow`, `.envRow`) are transparent and divider-only — flat, no nested fill; only the outer `.settingsCardGroup` supplies background/border.

Anatomy of `.appConfigHeader`: a clickable icon **tile** (`.appConfigHeaderIcon`, a `<button>` that opens the icon picker — 30×30px, 7px radius, `--bg-tertiary` fill) + an inline-editable title (`.appConfigHeaderTitleEdit`, see Inline Edit / Editable Title below). Rule: identity (icon, label) is edited directly from the header — there is no separate "Label" or "Icon" field row inside a `SectionCard` body for it.

Panel sections: `SectionCard` "Environments" (`accent="execution"`, Refresh action in its header, see Section Card's `action` prop), "Details" (`accent="environment"` — repo path/URL, app URL, placement, depends-on, groups), "Plugins" (`accent="storage"`).

### Provider Config Panel
`.providerConfigPanel` is now minimal chrome — just `border-radius: 8px; overflow: hidden`. The old `border-left: 3px solid --accent-execution` accent stripe was **removed**, and the panel is **always open**: there is no collapse/expand chevron or toggle state in `ProviderConfigPanel.tsx` — `.providerConfigPanelHeader` is a static label row (icon + title/desc), not a disclosure button. Leading icons are green throughout: `.providerConfigPanelIcon` on the header, and per-row `.settingsItemIcon` on each advanced field, both `color: var(--accent-execution)`. Its body is the `.settingsCardGroup`/`.providerConfigPanelBody` hairline card documented under Elevation & Depth.

### Provider Radio-Card
Anatomy: `.providerCard` (`role="radio"`, flex row, 10px gap, 1px `--border-settings` border, `--bg-settings-card` fill, 8px radius, 11px 13px padding) → `.providerCardDot` (18×18px circle, 2px border, filled center when `--selected`) + `.providerCardIcon` + `.providerCardBody` (`.providerCardTitle` 13px/600 with an optional `.providerBadge` "Recommended" pill, `.providerCardDesc` 11px, `.providerCardBenefits` list with 4px accent dots). Selected state swaps border/background to `--accent-execution`/`--accent-execution-bg`; disabled drops to 0.6 opacity.

### Toggle Switch / Boolean Field
Two parallel implementations sharing the same geometry (30×17px track, 9px radius, 13px circular thumb, 2px inset, `translateX(13px)` on check): the legacy `.switch` (used for plugin/flag toggles, `--switch-slider-off/on` + `--switch-dot`) and `BooleanField`'s native `<input type="checkbox" role="switch">` styled via `.booleanFieldLabel input` (`--toggle-track-off/on` + `--toggle-thumb`) for provider boolean settings. Both transition `background 0.15s` / thumb `transform 0.15s`.

### Text & Select Controls
All 36px-height value controls share one box (36px/7px, matching the control radius unit) but differ slightly in border/background by role:
- `.storageRowInput` — read-only display box: 36px height, 34px line-height, `0 12px` padding, 7px radius, 1px `--border-primary`, `--bg-primary` fill, 13px font. It also sets **`direction: rtl`** as a deliberate start-ellipsis trick: long file paths (e.g. `…/project/state/logs`) need the *tail* visible, not the head, so flipping `direction` moves the browser's `text-overflow: ellipsis` clip to the front instead of the end, while the Latin path text itself keeps its normal left-to-right order under bidi.
- `.inlineEditText` / `.inlineEditInput` — share the identical box (`display:block; width:100%; height:36px; padding:0 12px; border-radius:7px; font-size:13px`), with `border: 1px solid transparent` at the base declaration so text/input can swap in place with zero layout shift; `line-height: 34px` is set *after* `font: inherit` in the CSS since the `font` shorthand resets `line-height` to `normal`.
- `.selectorRowSelect` — 36px/7px, 1px `--border-primary`, `--bg-primary` fill, 13px font.

**No focus ring in Details/config rows.** Text inputs and `<select>` dropdowns inside a `.configVal` cell (App Config Detail's Details rows) show no focus outline and no box-shadow on focus — only the caret plus the resting `--border-primary` border: `.configVal input:focus, .configVal select:focus, .configVal .inlineEditInput:focus, .configVal .selectorRowSelect:focus { outline: none; border-color: var(--border-primary); box-shadow: none; }`. This is a deliberate opt-out, scoped to `.configVal`, that coexists with the green-border focus canon `.settingsItemControl > select:focus, .settingsItemControl > input:focus` uses on the Settings page — don't "fix" one by copying the other; they're two different rows making two different choices.

### Inline Edit / Editable Title
Component: `InlineEdit` (`components/Dashboard/InlineEdit.tsx`). Props: `value`, `placeholder` (default `—`), `onSave`, `type` (`'text' | 'number'`), `className` (applied to **both** the resting `<span>` and the editing `<input>`), `editAffordance` (renders a trailing `<Pencil size={13} className="inlineEditPencil">`). Click enters edit; `Enter` or blur commits (`onSave` is skipped if the trimmed value is unchanged); `Escape` cancels and reverts the draft.

Rule: at rest, an editable field reads as **plain text** by default — no border, no fill. The one exception is the default (no-`className`) `.inlineEditText`, which still carries a link-style hover (dotted underline + `--bg-secondary` fill) for backward compatibility; any component that wants the "plain text, pencil-only" look must pass its own `className` and override that hover to `none`/`text-decoration: none` (as `.appConfigHeaderTitleEdit.inlineEditText:hover` and `.providerConfigPanelBody .inlineEditText:hover` / `.settingsCardGroup .inlineEditText:hover` already do). When `editAffordance` is set, the only "this is editable" signal is the pencil (`.inlineEditPencil`, `color: var(--text-muted)`, `opacity: 0` at rest) revealed on hover/focus-visible of the text (`.inlineEditText:hover .inlineEditPencil, .inlineEditText:focus-visible .inlineEditPencil { opacity: 0.8 }`).

The header-title usage (`InlineEdit` with `className="appConfigHeaderTitleEdit"` and `editAffordance`) is the reference implementation of both this pattern and "state transitions must not shift layout" below — see `.appConfigHeaderTitleEdit.inlineEditText, .appConfigHeaderTitleEdit.inlineEditInput` for the shared box metrics, and `.appConfigHeaderTitleEdit.inlineEditInput`'s `box-shadow` ring for the highlight (see Elevation & Depth).

### Segmented Control
Anatomy: `.segmented` (flex row, `--bg-tertiary` track, 7px radius, 2px padding/gap) of `.segBtn` (flex-1, 5px radius, 4px 10px padding, 14px font, `--text-muted` default) — active state fills `--bg-primary` and switches text to `--text-primary`. Reused for the theme picker and the dashboard's tab strip (`.dashboardTabs .segBtn`, active fills `--dashboard-tab-active-bg`).

### Group Action Pill / Count Pill
`.groupActionPill` (5px radius, 2px 9px padding, 11px/600, white text) comes in `.start` (`--toggle-off` bg) / `.stop` (`--toggle-on` bg) variants with a `brightness(1.12)` hover filter. `.groupCountPill` (9px radius, 1px 8px padding, 11px/600, `--bg-tertiary`/`--text-secondary`) turns green (`rgba(62,207,107,.14)` bg / `--dot-running` text) when `.running`.

### Settings Reset Button
`.settingsHeader .settingsResetBtn` breaks from the neutral `--bg-settings-card`/`--border-settings` button chrome most other settings buttons use by coloring its **text** `var(--accent-execution)` (green) at rest, and swapping `border-color` to the same green on hover — it's the one settings-chrome button that carries the primary accent instead of a neutral tone. It renders a `RefreshCw` icon (`lucide-react`) alongside the label.

### Icon Button
Two sizes on one pattern (transparent bg, `border-radius` scaled to size, `--text-secondary` default, hover fills `--icon-btn-hover` and text goes to `--text-primary`): `.iconBtn` at **26×26px / 6px radius**, no border (dashboard close, config-row copy) and the unified `.settingsItemControl .segBtn, .settingsItemControl .iconBtn` at **36×36px / 7px radius, 1px `--border-primary` border**, transparent at rest (folder-pick, redetect, open-folder — sits flush beside a 36px input). Hover swaps to `--icon-btn-hover` fill with a `--text-muted` border; `:focus-visible` gets a 2px `--border-primary` outline, 1px offset; `:disabled` drops to 0.5 opacity. The earlier `.sectionCard--storage .segBtn` teal-outline variant was removed — every trailing button in a settings row now shares this one neutral bordered-square look, regardless of which section it sits in.

### Tooltip Bubble
`.branchTip .tipBubble` — absolutely positioned above its trigger, `--tooltip-bg`/`--tooltip-fg` fill, 1px `--tooltip-border`, 5px radius, 4px 7px padding, 11px text, a 4px CSS-triangle arrow, `opacity` transition on hover/focus-within (no shadow — the border is the only depth cue). Used for the branch-name tooltip and every `.fieldTip`/`.fieldTipTrigger` "?" help affordance in Settings rows.

### Dashboard Overlay
Anatomy: `.dashboard` (`position: fixed; inset: 0`, `--dashboard-shell` gradient fill, 10px radius, `z-index: 1000`) → `.dashboardHead` (workspace title + `.dashboardTabs` segmented control + `.dashboardClose`) then `.dashboardBody` (flex row, 4px gap) split into `.dashboardList` (260px fixed sidebar, `.dashboardListRow` items at 10px radius, hover = `--row-hover`, selected = `--dashboard-tab-active-bg`) and `.dashboardDetail` (flex-1, `--dashboard-card-bg` fill, **12px radius — the largest in the system**, 16px padding) which hosts `AppConfigDetail`/`PluginsPanel` content.

## Do's and Don'ts

### Do
- **State transitions must not shift layout.** When a control swaps between states (rest text ↔ edit input, idle ↔ focus), the two states MUST share identical box metrics — same `height`, `line-height`, `font-size`/`font-weight`, `padding`, `box-sizing` — so nothing moves. Implement by putting the shared metrics on a selector list that covers both states, e.g. `.appConfigHeaderTitleEdit.inlineEditText, .appConfigHeaderTitleEdit.inlineEditInput { box-sizing: border-box; height: 24px; line-height: 24px; font-size: 16px; font-weight: 600; padding: 0 8px; }`. Acceptance check: the rest element's and the edit element's bounding boxes have zero top/left/height delta.
- Build elevation from `--bg-primary`/`--bg-settings-card` cards sitting on `--bg-list`/page background plus 1px hairline borders/dividers — that combination *is* the depth system. `box-shadow` stays banned for this — see the next rule for the one exception.
- **Never use `box-shadow` for elevation or drop-shadows.** Not as a subtle 1px accent, not on hover, not anywhere — the file's own top-of-file comment says to delete the file before adding one back. The single sanctioned exception is a focus/edit **highlight ring**: because a `border` there would grow the box and shift text (violating the rule above), use an outset, zero-blur ring via the `0 0 0 Npx` form instead, reusing `--accent-execution` + `--accent-execution-bg` — reference implementation `.appConfigHeaderTitleEdit.inlineEditInput { border-radius: 6px; box-shadow: 0 0 0 1px var(--accent-execution), 0 0 0 4px var(--accent-execution-bg); }`. Do not generalize this exception to any other box-shadow use.
- **Create spacing with padding (or the parent's `gap`), never with a negative margin that pulls a box under a neighbor.** A highlight ring or focus box positioned that way will collide with the adjacent element. `.appConfigHeaderTitleEdit` uses `padding: 0 8px` as the gap between the icon tile and the title's edit ring — there is no negative margin anywhere in that pattern.
- Use `--accent-execution` (green) as the single primary/confirm accent; reserve blue for environment data and teal for storage — don't invent a fourth accent color for a new feature without a reason.
- Define every new custom property in **both** `:root` and `html[data-theme="light"]` in the same edit — a dark-only token silently breaks light mode.
- Reach for uppercase + letter-spacing (9–11px, 0.06–0.8px tracking) when you need a "section label" role instead of bumping font-weight or size.
- Keep new controls (inputs, selects, icon-buttons that sit beside them) at **36px height / 7px radius** so they line up with existing `.settingsItemControl` rows.
- Keep editable value/field text at **`font-weight: 400`** (matches Settings fields) — never 500 — the reference is `.configVal`.
- Focus a value control (text input / select / inline-edit) with `border-color: var(--accent-execution)` and **no outline** — the canonical pattern implemented at `.settingsItemControl > select:focus, .settingsItemControl > input:focus`. Icon buttons and checkboxes may use a 2px ring instead, but new text/select controls should follow the green-border canon, not a grey outline (see Known Gaps for where existing controls still drift from this). The one deliberate opt-out is `.configVal` (App Config Detail's Details rows): inputs/selects/`.inlineEditInput`/`.selectorRowSelect` there show **no** focus ring at all — `outline: none; box-shadow: none; border-color: var(--border-primary)` — because those rows read as plain data fields, not settings controls. Don't collapse this opt-out into the green canon; both are intentional.

### Don't
- Don't add a drop shadow to a new card "just for definition" — add a 1px border or increase bg contrast instead.
- Don't reach for the highlight-ring box-shadow exception for anything other than a same-size focus/edit ring — it is not a general permission to use box-shadow.
- Don't introduce a new accent hue for a status/feature that already maps to execution (green), environment (blue), or storage (teal).
- Don't hardcode a hex color inline when an existing `--*` token already covers the surface/text/accent role — grep the token tables above first.
- Don't mix control heights on one row — a 36px select next to a 26px icon button reads broken; match `.settingsItemControl`'s 36px pairing.
- Don't skip the light-theme override when adding a token — even if the new UI is dark-only today, an untouched token will render as `unset`/inherit in light mode later.
- Don't add a background/fill/border to a rest-state editable text element "so users notice it's editable" — the pencil affordance (`editAffordance` on `InlineEdit`) is the only signal; a background reads as a button, not plain text.

## Responsive Behavior

The app is a **fixed-size popover window**, not a resizable web page — there are no documented breakpoints. "Responsive" behavior instead means:

- **List scrolling**: `.list` uses `flex:1; min-height:0` with negative top/bottom margins so it scrolls under the fixed `.header` and `.dockBar`, with an 18px `mask-image` fade on each edge instead of a hard clip.
- **Row meta alignment**: `.rowControls`'s `70px 1fr auto` grid keeps version/env columns pinned even as branch names vary in length — the flexible column absorbs overflow via `text-overflow: ellipsis` on `.chipText`, never by shifting sibling columns.
- **Settings control column**: `.sectionCard .settingsItem` bounds its control column to `minmax(200px, 440px)` so long file paths get room without breaking the label column.
- **Dock bar**: `.dockBar` scrolls horizontally (`overflow-x: auto`, hidden scrollbar) when more app tiles are pinned than fit the window width.
- **Provider cards**: `.providerCards` wraps (`flex-wrap: wrap`, `flex: 1 1 260px`) so cards reflow to a single column in the settings pane's available width.

## Iteration Guide

1. Before adding any new color, scan the token tables above for an existing `--*` variable that already covers the surface/text/accent role you need — this system has ~90 tokens and most new UI can reuse one.
2. Add new tokens to **both** `:root` and `html[data-theme="light"]` in the same commit; never ship a dark-only or light-only variable.
3. Match control geometry to the closest existing component: 36px/7px for form controls, 26px/6px for bare icon buttons, 10px for window-level cards, 7px for chip-scale elements.
4. Never write `box-shadow` — if you're trying to signal "this floats above other content," reach for a 1px border (`--popover-ring` double-border pattern) or a background-contrast step instead.
5. New section-style groupings (à la Execution/Environment/Storage) should pick one of the three existing accent roles (execution/environment/storage) rather than inventing a fourth, unless the feature genuinely doesn't map to any of them.
6. Reuse `.settingsItem` / `.sectionCard` / `.pickerTrigger` class patterns rather than one-off markup — most new Settings rows are a `FieldRow`-shaped dispatch over `SettingField`/`BooleanField`/`SelectorRow`, not new components.
7. Keep new uppercase labels inside the established 9–11px / 0.06–0.8px tracking band so they read as the same "section label" family as existing ones.

## Known Gaps

- **Box-shadow rule is violated twice**: `.header` and `.dockBar` both carry `box-shadow: 0 1px 2px rgba(0,0,0,0.06)`, directly contradicting the file's own hard-rule comment at the top. These should be removed (replaced with the border-only pattern already used everywhere else) rather than copied into new components. (approx. lines 215, 3006 — verify before editing)
- **`.configVersionBadge` uses fallback values instead of real tokens**: `background: var(--bg-success-subtle, rgba(52, 199, 89, 0.14))` and `color: var(--text-success, #34c759)` reference custom properties (`--bg-success-subtle`, `--text-success`) that are **never defined** in either `:root` or the light-theme block — the component always falls through to the hardcoded `rgba(52,199,89,.14)` / `#34c759` literals in both themes. This badge is effectively untokenized and doesn't adapt between dark/light at all. (approx. lines 2241–2250 — verify before editing)
- **Hardcoded link-hover color**: `.label[style*="pointer"]:hover` and its `.siteIcon` hardcode `#2196f3` (a Material-blue) instead of referencing any existing `--chip-version-text`/`--accent-environment` blue token — it doesn't match either theme's blue exactly and won't re-theme with the rest of the app. (approx. lines 1880–1901 — verify before editing)
- **Hardcoded white**: `.groupActionPill` and `.longMenuBtn` hardcode white (`#fff` / `#ffffff`) instead of using `--toggle-text` (which is already `#fff` in both themes and is used for the equivalent role on `.toggle`) — functionally harmless today since white is theme-invariant here, but inconsistent with the rest of the token discipline. (approx. lines 888, 1966 — verify before editing)
- **Two parallel toggle-switch implementations** (`.switch`/`--switch-slider-*`/`--switch-dot` vs. `.booleanFieldLabel input`/`--toggle-track-*`/`--toggle-thumb`) exist side by side with near-identical geometry and near-duplicate token sets — a future cleanup could likely collapse these to one component + one token trio.
- **`--text-group-header` and `--text-settings-group` are defined as identical values in both themes** (`#6b8278`/`#5a7d6e`) — they may be intentionally separate roles (app-list group vs. settings sub-label) that happen to share a color today, or a token that should simply be merged; not verified against design intent.
- **Focus rings inconsistent outside the two documented, intentional patterns** (to resolve in a later CSS pass): the canonical pattern is a green `--accent-execution` border with no outline (`.settingsItemControl > select/input:focus`), and `.configVal`'s no-ring opt-out (`.configVal input:focus, .configVal select:focus, .configVal .inlineEditInput:focus, .configVal .selectorRowSelect:focus`) is deliberate (see Do's and Don'ts) — neither of those is a gap. What's still unresolved: `.selectorRowSelect:focus` *outside* `.configVal` uses a grey `--border-primary` 2px outline instead of the green canon, and a bare `.inlineEditInput:focus`/`.inlineEditText:focus-visible` outside both `.settingsItemControl` and `.configVal` shows **no** focus indicator by default (neither the green canon nor a declared opt-out — just an omission). Ring *color* also splits green vs. grey elsewhere: `.envCheckbox:focus-visible` uses a green outline while the `.settingsItemControl .segBtn`/`.iconBtn` focus ring uses a grey one. These remaining cases should converge on the green-border canon or get an explicit opt-out like `.configVal`'s. (approx. lines 1176, 2588, 2548, 2558, 2479, 1609 — verify before editing)
- **Two bordered group-card patterns** (to resolve in a later CSS pass): `.settingsCard` / `.pluginList` (8px radius, `--bg-settings-card` fill, `overflow: hidden`) vs. `.settingsCardGroup` / `.providerConfigPanelBody` (10px radius, `--bg-primary` fill, no clip — see Elevation & Depth). Both wrap the same shape — stacked `.settingsItem` rows inside a bordered card — with different radius/fill/clip conventions; a later pass should unify them.
- **`.inlineEditText:hover` has three identities** (to resolve in a later CSS pass): the default rule styles it like a link — dotted underline + `--bg-secondary` fill; inside settings cards (`.providerConfigPanelBody .inlineEditText:hover` / `.settingsCardGroup .inlineEditText:hover`) it's overridden to look like a static input instead — no underline, `--bg-primary` fill; and the header-title usage (`.appConfigHeaderTitleEdit.inlineEditText:hover`) overrides again to no background/no underline at all (pure plain-text — see Inline Edit / Editable Title). Same component, three different hover treatments depending on which container it's rendered in — each new consumer of `InlineEdit` should pick one of these explicitly via its own `className` rather than relying on the link-style default. (approx. lines 2542, 1476 — verify before editing)
