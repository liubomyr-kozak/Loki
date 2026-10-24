export * from './dashboardWindow'

// Tauri injects its IPC bridge on the window; every other wrapper here can just
// let the dynamic import fail in a plain browser, but the folder picker has no
// browser equivalent at all — callers need to know up front so they can render
// a typed-path fallback instead of a button that can never work.
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// Native directory picker. Returns null on cancel and on any failure — the
// caller treats both the same way (nothing was chosen).
export async function pickFolder(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false })
    return typeof picked === 'string' ? picked : null
  } catch (e) {
    console.error('pick folder failed:', e)
    return null
  }
}

export async function openConfigInEditor(path: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_config_in_editor', { path })
}

export async function openFolder(path: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('open_config_in_editor', { path })
}

/** Bring the terminal app that open_in_terminal uses to the front. */
export async function focusTerminal(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('focus_terminal')
  } catch (e) {
    console.error('focus terminal failed:', e)
  }
}

export async function openInTerminal(command: string): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('open_in_terminal', { command })
  } catch (e) {
    console.error('open terminal failed:', e)
    return ''
  }
}

export async function openUrl(url: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_url', { url })
  } catch (e) {
    console.error('open url failed:', e)
  }
}

export async function openBranch(repoUrl: string, branch: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_url', { url: `${repoUrl}/tree/${branch}` })
  } catch (e) {
    console.error('open branch failed:', e)
  }
}

export async function openAppSite(opts: { appUrl?: string; port?: number }): Promise<void> {
  const { appUrl, port } = opts
  const url = appUrl?.trim() || (port != null ? `http://localhost:${port}` : '')
  if (!url) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_url', { url })
  } catch (e) {
    console.error('open app url failed:', e)
  }
}

// Unlike the other wrappers here, errors are NOT swallowed — the caller
// (desktopSlice's restartLoki thunk) needs the rejection (e.g. packaged-build
// refusal) to drive its own failed state.
export async function restartBackend(): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('restart_backend')
}

export async function quitApp(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('quit_app')
  } catch (e) {
    console.error('Failed to quit:', e)
  }
}

export async function setTrayCount(n: number): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_tray_count', { n })
  } catch {
    /* ignore */
  }
}

export async function isAutostartEnabled(): Promise<boolean> {
  const { isEnabled } = await import('@tauri-apps/plugin-autostart')
  return isEnabled()
}

export async function enableAutostart(): Promise<void> {
  const { enable } = await import('@tauri-apps/plugin-autostart')
  await enable()
}

export async function disableAutostart(): Promise<void> {
  const { disable } = await import('@tauri-apps/plugin-autostart')
  await disable()
}


