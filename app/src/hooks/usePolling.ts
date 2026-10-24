import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchConfig, refreshAll } from '../store/slices/appsSlice'
import { fetchFavorites } from '../store/slices/favoritesSlice'
import { fetchOrder } from '../store/slices/orderSlice'
import { refreshScripts } from '../store/slices/gitSlice'
import { fetchPlugins, fetchDescriptors } from '../store/slices/pluginsSlice'
import { fetchSessions } from '../store/slices/sessionsSlice'
import { fetchGroupSelections } from '../store/slices/groupSelectionsSlice'
import { fetchInstances } from '../store/slices/instancesSlice'
import { POLL_MS } from '../lib/constants'

// Retry delay for the first load while the backend is still starting.
const STARTUP_RETRY_MS = 1000

export function usePolling(): void {
  const dispatch = useAppDispatch()
  const configLoaded = useAppSelector((s) => s.apps.configLoaded)

  // The packaged app spawns the backend at the same moment the window loads,
  // so the first requests can hit a port nobody listens on yet. Repeat the
  // initial load until the config arrives instead of waiting POLL_MS (5 min)
  // on "Connecting to orchestrator…".
  useEffect(() => {
    if (configLoaded) return
    const loadAll = () => {
      dispatch(fetchConfig())
      dispatch(fetchFavorites())
      dispatch(fetchOrder())
      dispatch(fetchPlugins())
      dispatch(refreshAll())
      dispatch(fetchDescriptors())
      dispatch(fetchSessions())
      dispatch(fetchGroupSelections())
      dispatch(fetchInstances())
    }
    loadAll()
    const t = setInterval(loadAll, STARTUP_RETRY_MS)
    return () => clearInterval(t)
  }, [dispatch, configLoaded])

  useEffect(() => {
    // The Workspace window mounts once and lives across hide/show, and only
    // the launcher refetches the config on reveal (onLauncherReset) — so
    // without this the Workspace app list was a snapshot from its first open
    // and silently missed apps imported/renamed since.
    const t = setInterval(() => {
      dispatch(refreshAll())
      dispatch(fetchDescriptors())
      dispatch(fetchSessions())
      dispatch(fetchPlugins())
      dispatch(fetchConfig())
      dispatch(fetchOrder())
      dispatch(fetchInstances())
      dispatch(refreshScripts())
    }, POLL_MS)
    const onFocus = () => {
      dispatch(refreshAll())
      dispatch(fetchDescriptors())
      dispatch(fetchSessions())
      dispatch(fetchPlugins())
      dispatch(fetchConfig())
      dispatch(fetchOrder())
      dispatch(refreshScripts())
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [dispatch])
}
