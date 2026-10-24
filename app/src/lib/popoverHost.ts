// Popup open-state lives in the component that owns the popup. This module
// only coordinates: it remembers the single close-callback of whatever popup
// is currently open, so opening a second one closes the first, and
// onLauncherReset can close everything from outside the React tree (the
// launcher window is hidden, never unmounted).
let current: (() => void) | null = null

export function claimPopover(close: () => void): void {
  if (current && current !== close) current()
  current = close
}

export function releasePopover(close: () => void): void {
  if (current === close) current = null
}

export function closeAllPopovers(): void {
  const c = current
  current = null
  c?.()
}
