// The Workspace open/close transitions are fully native now: enter_dashboard
// creates the "main" window and drives the grow animation from a Rust thread
// (see animate_dashboard_grow in main.rs — a webview rAF driver freezes when
// the driving webview gets occluded), exit_dashboard closes it and restores
// the launcher popover.

export async function enterDashboard(
  tab?: 'apps' | 'plugins' | 'environment',
  app?: string,
): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    // Single-word arg names only — Tauri maps JS camelCase to Rust snake_case,
    // so an `app_name` param would have to be sent as `appName`.
    await invoke('enter_dashboard', { tab: tab ?? null, selected: app ?? null })
  } catch (e) {
    console.error('enter dashboard failed:', e)
  }
}

export async function exitDashboard(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('exit_dashboard')
  } catch (e) {
    console.error('exit dashboard failed:', e)
  }
}

export async function startWindowDrag(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
  } catch {
    // no-op outside Tauri / if unsupported
  }
}
