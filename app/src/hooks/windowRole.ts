export type WindowRole = 'launcher' | 'workspace' | 'browser'

// Resolved synchronously from the `window` query param each Tauri window is
// created with (`?window=launcher` in tauri.conf.json, `?window=workspace`
// in enter_dashboard), so the very first render already knows which UI to
// mount — the async getCurrentWindow().label lookup this replaces defaulted
// to "not launcher" for a frame, flashing the Dashboard overlay inside the
// launcher popover on every mount. A plain browser preview has no param and
// falls back to 'browser', which renders the normal popover UI.
export function getWindowRole(): WindowRole {
  const w = new URLSearchParams(window.location.search).get('window')
  return w === 'launcher' ? 'launcher' : w === 'workspace' ? 'workspace' : 'browser'
}
