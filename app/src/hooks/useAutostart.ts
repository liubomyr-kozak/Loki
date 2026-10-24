import { useEffect, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { setAutostart } from '../store/slices/uiSlice'
import { isAutostartEnabled, enableAutostart, disableAutostart } from '../lib/tauri'

export function useAutostart() {
  const dispatch = useAppDispatch()
  const autostart = useAppSelector((s) => s.ui.autostart)

  useEffect(() => {
    isAutostartEnabled()
      .then((v) => dispatch(setAutostart(v)))
      .catch(() => dispatch(setAutostart(false)))
  }, [dispatch])

  const toggle = useCallback(async () => {
    try {
      const on = await isAutostartEnabled()
      if (on) await disableAutostart()
      else await enableAutostart()
      dispatch(setAutostart(await isAutostartEnabled()))
    } catch (e) {
      console.error('autostart toggle failed:', e)
    }
  }, [dispatch])

  return { autostart, toggle }
}
