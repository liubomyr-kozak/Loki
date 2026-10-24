import { configureStore } from '@reduxjs/toolkit'
import appsReducer from './slices/appsSlice'
import favoritesReducer from './slices/favoritesSlice'
import orderReducer from './slices/orderSlice'
import sessionsReducer from './slices/sessionsSlice'
import uiReducer from './slices/uiSlice'
import themeReducer from './slices/themeSlice'
import pluginsReducer from './slices/pluginsSlice'
import gitReducer from './slices/gitSlice'
import groupSelectionsReducer from './slices/groupSelectionsSlice'
import desktopReducer from './slices/desktopSlice'
import instancesReducer from './slices/instancesSlice'
import { listenerMiddleware } from './listeners'

export const store = configureStore({
  reducer: {
    apps: appsReducer,
    favorites: favoritesReducer,
    order: orderReducer,
    sessions: sessionsReducer,
    ui: uiReducer,
    theme: themeReducer,
    plugins: pluginsReducer,
    git: gitReducer,
    groupSelections: groupSelectionsReducer,
    desktop: desktopReducer,
    instances: instancesReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listenerMiddleware.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
