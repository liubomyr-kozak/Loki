import { useEffect } from 'react'
import { useAppDispatch } from '../store/hooks'
import { restartLoki } from '../store/slices/desktopSlice'

// Cmd/Ctrl+R rebuilds and restarts Loki itself (distinct from the native
// webview reload, which this hook's preventDefault() suppresses). Stays
// registered in a packaged build too — restartLoki's own thunk surfaces the
// "not available in a packaged build" failure instead of silently no-op'ing.
export function useRestartHotkey() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r' && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        dispatch(restartLoki())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])
}
