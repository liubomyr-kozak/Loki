---
type: React Application
title: Desktop Frontend App
description: The React 19 + Redux Toolkit UI (App.tsx/main.tsx) that renders inside the Tauri window.
tags: [desktop, react, redux, frontend]
timestamp: "2026-07-21T00:00:00Z"
---

## Entry point

`index.html` mounts `<div id="root">` and loads `src/main.tsx` as a module.
`main.tsx` creates the React root, wraps the tree in Redux's `<Provider store={store}>`
(store defined under `src/store/`, not read in this pass) and `<React.StrictMode>`,
and imports `./styles.css` globally.

## App.tsx composition

`App.tsx` is a thin composition root, not where logic lives — it wires together
hooks and components from `src/hooks/` and `src/components/` (contents of those
folders were not read in this documentation pass; unknown in detail):

- `usePolling()` — presumably drives periodic refresh against the backend (name
  only observed, body not read)
- `useTheme()`, `useKeyboardSearch()`, `useTrayCount()`, `useTrayNavigationSync()`
  — theme, search-focus, and native-tray-integration hooks
- Redux selectors read `s.apps.configLoaded` and `s.ui.viewMode` /
  `s.ui.dashboardOpen` to gate rendering: while `!configLoaded` it renders only a
  `"Connecting to orchestrator…"` placeholder (class `.loading`); once loaded it
  renders `Header`, then either `AppList` or `SettingsView` depending on
  `viewMode`, a `DockBar` (apps view only), three portal components
  (`AppContextMenu`, `GroupMenu`, `IconPicker`), and conditionally a `Dashboard`
  overlay when `dashboardOpen` is true.
- Everything is wrapped in `MenusProvider` (from `components/MenusContext`).

This confirms the app is backend-driven: it does nothing until `configLoaded`
becomes true, which happens once `/desktop/api-client.md`'s `getConfig()` (or
equivalent store logic) succeeds against the orchestrator backend.

## Styling (`styles.css`)

For the full extracted color/typography/spacing/component token reference, see [DESIGN.md](./DESIGN.md).

Single global stylesheet (~2700 lines), no CSS modules/CSS-in-JS. Structure:

- CSS custom properties on `:root` (dark palette, the default) and an
  `html[data-theme="light"]` override block — this is what `useTheme()` almost
  certainly toggles.
- A hard, repeated top-of-file comment prohibits `box-shadow` anywhere in this
  file ("BOXSHADOW_IS_FORBIDDEN_PERMANENTLY_AND_COMPLETELY") — a house rule to
  respect if editing this file.
- `body { background: transparent; overflow: hidden }` and `.app { width:
  100vw; height: 100vh; border-radius: 10px }` — consistent with the
  transparent, undecorated, rounded popover window Tauri configures (see
  `/desktop/tauri-shell.md`).
- Covers every UI surface referenced from `App.tsx`: list rows, version/env/branch
  picker chips, group headers, the settings view (section cards, provider
  radio-cards, plugin list), the dashboard overlay, tooltips, and a sessions
  dropdown.

# Citations

[1] `desktop/index.html`
[2] `app/src/main.tsx`
[3] `app/src/App.tsx`
[4] `app/src/styles.css`
