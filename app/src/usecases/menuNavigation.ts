import type { AppDispatch } from '../store/index'
import { clearSearch, setShowSessions, setViewMode } from '../store/slices/uiSlice'
import { fetchConfig } from '../store/slices/appsSlice'
import { fetchOrder } from '../store/slices/orderSlice'
import { refreshScripts } from '../store/slices/gitSlice'
import { closeAllPopovers } from '../lib/popoverHost'
import * as tauri from '../lib/tauri'

let animInFlight = false

export function onSettingsOpened() {
  return (dispatch: AppDispatch) => {
    dispatch(setViewMode('settings'))
  }
}

export function onBackToMenu() {
  return (dispatch: AppDispatch) => {
    dispatch(setViewMode('apps'))
  }
}

// INVARIANT (user requirement): the launcher popover has NO view memory —
// every time it appears via the tray icon it must show the main apps list,
// even if the user left it on Settings before it was hidden/closed. Rust
// calls this via direct webview eval (window.__launcherReset, registered in
// useTrayNavigationSync) from every show AND hide path, so the view is
// already reset the moment the popover hides and again on reveal.
export function onLauncherReset() {
  return (dispatch: AppDispatch) => {
    dispatch(setViewMode('apps'))
    // Transient popups/search must not survive a hide either — the sessions
    // dropdown, a row's environment/branch dropdown and the terminal
    // long-press menu all stayed open across launcher close/reopen. Those
    // popups keep their open flag in component-local `useState`; reaching them
    // from here (outside the React tree) goes through the popoverHost
    // singleton, which holds the close callback of whatever is currently open.
    dispatch(setShowSessions(false))
    closeAllPopovers()
    dispatch(clearSearch())
    // Config can change while the popover is hidden (apps imported/removed in
    // the Workspace window) — refetch so the list is current on reveal.
    dispatch(fetchConfig())
    dispatch(fetchOrder())
    // Env lists depend on that config (environmentFilter) but live in their
    // own per-(app, ref) cache that no row refires on its own — refresh them
    // here too, or an edit made in the Workspace window stays invisible in
    // the launcher's environment pickers.
    dispatch(refreshScripts())
  }
}

// `app` preselects a row in the Workspace apps tab — the launcher's row menu
// ("App settings…") jumps straight to that app's configuration.
export function onWorkspaceOpened(tab?: 'apps' | 'plugins' | 'environment', app?: string) {
  return async (dispatch: AppDispatch) => {
    if (animInFlight) return
    animInFlight = true
    try {
      await tauri.enterDashboard(tab, app)
    } finally {
      animInFlight = false
    }
  }
}
