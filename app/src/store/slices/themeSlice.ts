import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { STORAGE_THEME, STORAGE_THEME_STYLE, STORAGE_THEME_TINT } from '../../lib/constants'

export type Theme = 'light' | 'dark' | 'auto'

// Solid is the original opaque look. Glass makes the window translucent
// (native blur where the OS has one) and tints it with one of the TINTS.
export type ThemeStyle = 'solid' | 'glass'

export const TINTS = ['green', 'ocean', 'cherry', 'orange', 'violet'] as const
export type ThemeTint = (typeof TINTS)[number]

export interface ThemeState {
  theme: Theme
  style: ThemeStyle
  tint: ThemeTint
}

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const saved = localStorage.getItem(key)
  return allowed.includes(saved as T) ? (saved as T) : fallback
}

export function loadThemeState(): ThemeState {
  return {
    theme: load(STORAGE_THEME, ['light', 'dark', 'auto'] as const, 'auto'),
    style: load(STORAGE_THEME_STYLE, ['solid', 'glass'] as const, 'solid'),
    tint: load(STORAGE_THEME_TINT, TINTS, 'green'),
  }
}

const initialState: ThemeState = loadThemeState()

const slice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload
    },
    setThemeStyle(state, action: PayloadAction<ThemeStyle>) {
      state.style = action.payload
    },
    setThemeTint(state, action: PayloadAction<ThemeTint>) {
      state.tint = action.payload
    },
  },
})

export const { setTheme, setThemeStyle, setThemeTint } = slice.actions
export default slice.reducer
