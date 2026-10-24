import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import {
  loadThemeState,
  setTheme,
  setThemeStyle,
  setThemeTint,
} from '../store/slices/themeSlice'
import type { Theme, ThemeStyle } from '../store/slices/themeSlice'
import { STORAGE_THEME, STORAGE_THEME_STYLE, STORAGE_THEME_TINT } from '../lib/constants'
import { getWindowRole } from './windowRole'

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function applyTheme(t: 'light' | 'dark'): void {
  const html = document.documentElement
  if (t === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}

// Only macOS and Windows have a native blur behind a transparent webview.
// Elsewhere (Linux, a plain browser preview) Glass keeps its tint opaque so
// the desktop doesn't show through unblurred.
function nativeBlurPlatform(): 'macos' | 'windows' | null {
  if (getWindowRole() === 'browser') return null
  const ua = navigator.userAgent
  if (ua.includes('Mac')) return 'macos'
  if (ua.includes('Windows')) return 'windows'
  return null
}

async function applyWindowEffects(style: ThemeStyle, t: 'light' | 'dark'): Promise<boolean> {
  const platform = nativeBlurPlatform()
  if (!platform) return false
  try {
    const { getCurrentWindow, Effect, EffectState } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (style === 'solid') {
      await win.clearEffects()
      return false
    }
    const effect = platform === 'windows'
      ? Effect.Acrylic
      : t === 'dark' ? Effect.HudWindow : Effect.Popover
    await win.setEffects({ effects: [effect], state: EffectState.Active, radius: 10 })
    return true
  } catch (e) {
    console.error('window effects failed:', e)
    return false
  }
}

export function useTheme(): void {
  const dispatch = useAppDispatch()
  const { theme, style, tint } = useAppSelector((s) => s.theme)
  // Read via ref inside the media-query listener so the subscription below can be
  // set up once instead of tearing down/re-adding on every theme change.
  const themeRef = useRef(theme)
  themeRef.current = theme

  useEffect(() => {
    const effective = getEffectiveTheme(theme)
    applyTheme(effective)
    const html = document.documentElement
    html.setAttribute('data-style', style)
    html.setAttribute('data-tint', tint)
    // Glass is always tinted; Solid only when a tint other than the
    // original green is picked, so Solid + Green stays the classic theme.
    if (style === 'glass' || tint !== 'green') html.setAttribute('data-tinted', '')
    else html.removeAttribute('data-tinted')
    let cancelled = false
    void applyWindowEffects(style, effective).then((native) => {
      if (cancelled) return
      if (native) html.setAttribute('data-native-blur', '')
      else html.removeAttribute('data-native-blur')
    })
    return () => { cancelled = true }
  }, [theme, style, tint])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (themeRef.current === 'auto') applyTheme(getEffectiveTheme(themeRef.current))
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // The launcher and the Workspace window are separate webviews sharing one
  // localStorage, so a change made in one reaches the other as a storage event.
  useEffect(() => {
    const keys = [STORAGE_THEME, STORAGE_THEME_STYLE, STORAGE_THEME_TINT]
    const onStorage = (e: StorageEvent) => {
      if (e.key && !keys.includes(e.key)) return
      const next = loadThemeState()
      dispatch(setTheme(next.theme))
      dispatch(setThemeStyle(next.style))
      dispatch(setThemeTint(next.tint))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [dispatch])
}
