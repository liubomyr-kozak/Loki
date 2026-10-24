import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { GlobalConfig, GlobalConfigResponse } from '../../api'
import type { FieldStatusValue } from './FieldStatus'

const FIELD_STATUS_RESET_MS = 2000
const RESET_CONFIRM_TIMEOUT_MS = 4000

export function useEnvironmentSettings() {
  const [data, setData] = useState<GlobalConfigResponse | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [redetectingComponent, setRedetectingComponent] = useState<'tmux' | 'node' | 'shell' | null>(null)
  const [resetConfirming, setResetConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [fieldStatus, setFieldStatus] = useState<Record<string, FieldStatusValue>>({})
  const resetTimerRef = useRef<number | null>(null)
  const fieldStatusTimers = useRef<Record<string, number>>({})
  const loadSeqRef = useRef(0)

  useEffect(() => () => {
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current)
    Object.values(fieldStatusTimers.current).forEach((t) => window.clearTimeout(t))
  }, [])

  const setFieldStat = (key: string, s: FieldStatusValue) => {
    setFieldStatus((prev) => ({ ...prev, [key]: s }))
    if (fieldStatusTimers.current[key] != null) window.clearTimeout(fieldStatusTimers.current[key])
    if (s === 'ok' || s === 'error') {
      fieldStatusTimers.current[key] = window.setTimeout(() => {
        setFieldStatus((prev) => ({ ...prev, [key]: 'idle' }))
      }, FIELD_STATUS_RESET_MS)
    }
  }

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const res = await api.getGlobalConfig()
      if (seq !== loadSeqRef.current) return
      setData(res)
      setStatus('')
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      setStatus(`Load failed: ${(e as Error)?.message ?? e}`)
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const patch = async (partial: Partial<GlobalConfig>, fieldKey?: string) => {
    const key = fieldKey ?? Object.keys(partial)[0]
    if (key) setFieldStat(key, 'saving')
    try {
      await api.patchGlobalConfig(partial)
      if (key) setFieldStat(key, 'ok')
      await load()
    } catch (e) {
      if (key) setFieldStat(key, 'error')
      console.error('patch failed:', e)
    }
  }

  // Client-side pre-check before the round trip: an empty string is valid
  // (means "no filter, show all scripts"), so only non-empty values are
  // tested against RegExp. This gives instant feedback for a malformed
  // pattern without waiting on the backend's own regex validation (which
  // still applies and surfaces via the normal 'error' FieldStatus path).
  const patchEnvironmentFilterRegex = async (value: string) => {
    const key = 'environmentFilterRegex'
    if (value) {
      try {
        new RegExp(value)
      } catch {
        setFieldStat(key, 'error')
        return
      }
    }
    await patch({ environmentFilterRegex: value }, key)
  }

  const redetect = async (component: 'tmux' | 'node' | 'shell') => {
    const seq = ++loadSeqRef.current
    setRedetectingComponent(component)
    setStatus('')
    try {
      const res = await api.redetect(component)
      if (seq === loadSeqRef.current) setData(res)
    } catch (e) {
      if (seq === loadSeqRef.current) setStatus(`Detect failed: ${(e as Error)?.message ?? e}`)
    } finally {
      setRedetectingComponent(null)
    }
  }

  const doReset = async () => {
    const seq = ++loadSeqRef.current
    setResetting(true)
    setStatus('')
    try {
      const res = await api.resetGlobalConfig()
      if (seq === loadSeqRef.current) {
        setData(res)
        setStatus('Reset to defaults')
      }
    } catch (e) {
      if (seq === loadSeqRef.current) setStatus(`Reset failed: ${(e as Error)?.message ?? e}`)
    } finally {
      setResetting(false)
    }
  }

  const handleResetClick = () => {
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    if (!resetConfirming) {
      setResetConfirming(true)
      resetTimerRef.current = window.setTimeout(() => setResetConfirming(false), RESET_CONFIRM_TIMEOUT_MS)
      return
    }
    setResetConfirming(false)
    void doReset()
  }

  return {
    data, status, loading, redetectingComponent, resetConfirming, resetting, fieldStatus,
    load, patch, redetect, handleResetClick, patchEnvironmentFilterRegex,
  }
}
