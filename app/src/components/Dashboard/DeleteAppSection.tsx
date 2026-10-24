import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { useAppDispatch } from '../../store/hooks'
import { reloadConfig } from '../../store/slices/appsSlice'
import { api } from '../../api'
import { errMsg } from '../../lib/errors'

export function DeleteAppSection({ name }: { name: string }) {
  const dispatch = useAppDispatch()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const remove = async () => {
    setBusy(true)
    setError('')
    try {
      await api.removeApp(name)
      await dispatch(reloadConfig())
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="deleteAppSection">
      {confirming
        ? (
          <>
            <span className="deleteAppHint">Stops the app if running and removes it from the workspace.</span>
            <button className="scanConfirmBtn" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
            <button className="dangerBtn" onClick={() => void remove()} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : `Delete ${name}`}
            </button>
          </>
          )
        : (
          <button className="dangerBtn ghost" onClick={() => setConfirming(true)}>
            <Trash2 size={14} />
            Delete app
          </button>
          )}
      {error && <span className="cfgStatus">{error}</span>}
    </div>
  )
}
