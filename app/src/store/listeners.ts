import { createListenerMiddleware } from '@reduxjs/toolkit'
import { setTheme, setThemeStyle, setThemeTint } from './slices/themeSlice'
import { fetchConfig } from './slices/appsSlice'
import { STORAGE_THEME, STORAGE_THEME_STYLE, STORAGE_THEME_TINT } from '../lib/constants'
import { arraysEqual } from '../lib/grouping'
import { api } from '../api'
import type { RootState } from './index'

export const listenerMiddleware = createListenerMiddleware()

listenerMiddleware.startListening({
  actionCreator: setTheme,
  effect: (action) => {
    localStorage.setItem(STORAGE_THEME, action.payload)
  },
})

listenerMiddleware.startListening({
  actionCreator: setThemeStyle,
  effect: (action) => {
    localStorage.setItem(STORAGE_THEME_STYLE, action.payload)
  },
})

listenerMiddleware.startListening({
  actionCreator: setThemeTint,
  effect: (action) => {
    localStorage.setItem(STORAGE_THEME_TINT, action.payload)
  },
})

// Persists the reconciled groupOrder back to disk, but only when the reducer
// actually changed it. `action.payload.groupOrder` stays pristine (see the
// Immer note in appsSlice's fetchConfig.fulfilled), so diffing it against the
// post-reducer state is a reliable "did reconciliation do anything" check.
// Fire-and-forget: no pending/error state dispatched on failure.
listenerMiddleware.startListening({
  actionCreator: fetchConfig.fulfilled,
  effect: (action, listenerApi) => {
    const raw = action.payload.groupOrder ?? []
    const reconciled = (listenerApi.getState() as RootState).apps.config?.groupOrder ?? []
    if (!arraysEqual(raw, reconciled)) {
      api.setGroupOrder(reconciled).catch(() => {})
    }
  },
})
