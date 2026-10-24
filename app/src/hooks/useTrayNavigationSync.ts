import { useEffect } from 'react'
import { useAppDispatch } from '../store/hooks'
import { onLauncherReset } from '../usecases/menuNavigation'

declare global {
  interface Window {
    __launcherReset?: () => void
  }
}

// Keeps the launcher popover free of view memory (see onLauncherReset):
// Rust calls window.__launcherReset via direct webview eval from every code
// path that shows OR hides the popover (tray toggle, click-outside blur,
// Workspace open/close) — see reset_launcher_view in main.rs. Direct eval is
// used instead of the Tauri event bus because targeted event delivery into a
// hidden NSPanel webview proved unreliable (popover kept reopening on
// Settings).
export function useTrayNavigationSync() {
  const dispatch = useAppDispatch()
  useEffect(() => {
    window.__launcherReset = () => dispatch(onLauncherReset())
    return () => {
      delete window.__launcherReset
    }
  }, [dispatch])
}
