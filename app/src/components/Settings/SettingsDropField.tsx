import { useEffect, useState } from 'react'
import { FolderInput } from 'lucide-react'
import { api } from '../../api'
import { isTauri, pickFolder } from '../../lib/tauri'
import { GitCheckoutConfirm } from '../portals/GitCheckoutConfirm'
import { SettingsRowMeta } from './SettingsRowMeta'

export interface SettingsDropFieldProps {
  // Raw dropPath from the shared useFolderDrop() instance in Dashboard,
  // already scoped to the `environment` tab by the caller — null on every
  // other tab so this component never reacts to a drop made elsewhere.
  incomingDropPath: string | null
  // Consumes `incomingDropPath` — called right after every inspect
  // (success AND error) so a repeat drop of the identical path re-triggers
  // inspect instead of no-op'ing on React's unchanged-state bailout.
  onClearDrop: () => void
  // Called once Apply (merge or replace) has succeeded, so callers can
  // refresh whatever reads config (Settings panel, Dashboard app list).
  onImported: () => void
}

export function SettingsDropField({ incomingDropPath, onClearDrop, onImported }: SettingsDropFieldProps) {
  const [manualPath, setManualPath] = useState('')
  const [inspecting, setInspecting] = useState(false)
  const [error, setError] = useState('')
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [appsCount, setAppsCount] = useState(0)
  const [applying, setApplying] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  const inspect = async (folderPath: string) => {
    setError('')
    setInspecting(true)
    try {
      const res = await api.inspectConfigImport(folderPath)
      setPendingPath(folderPath)
      setAppsCount(res.appsCount)
    } catch (e) {
      setError((e as Error)?.message ?? String(e))
    } finally {
      setInspecting(false)
    }
  }

  useEffect(() => {
    if (!incomingDropPath) return
    setDropActive(true)
    void inspect(incomingDropPath).finally(() => setDropActive(false))
    onClearDrop()
    // Only re-run when a new drop actually arrives — `inspect`/`onClearDrop`
    // are freshly created every render (same pattern as ImportProposal).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingDropPath])

  const submitManualPath = () => {
    const trimmed = manualPath.trim()
    if (!trimmed) return
    void inspect(trimmed)
  }

  // Native picker is the only path in the desktop build; the typed-path row
  // below exists solely for the browser build, where no picker exists.
  const nativePicker = isTauri()

  const choosePath = async () => {
    const picked = await pickFolder()
    if (picked) await inspect(picked)
  }

  const closeConfirm = () => {
    setPendingPath(null)
    setAppsCount(0)
  }

  const apply = async (mode: 'merge' | 'replace') => {
    if (!pendingPath) return
    setApplying(true)
    setError('')
    try {
      await api.applyConfigImport(pendingPath, mode)
      closeConfirm()
      onImported()
    } catch (e) {
      setError((e as Error)?.message ?? String(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="settingsItem storageRow settingsDropField">
      <SettingsRowMeta
        label="Import settings"
        tip="Pick a folder, not a file: the folder that contains the config file you want to import (for example another machine's config folder). Its apps are merged into, or replace, the current config."
      />
      <div className="settingsItemControl settingsDropFieldControl">
        <div className={`settingsDropZone${dropActive || inspecting ? ' active' : ''}`}>
          <FolderInput size={14} />
          <span className="settingsDropZoneHint">Drop the folder that contains your config file here</span>
          {nativePicker && (
            <>
              <span className="settingsDropZoneOr">or</span>
              <button
                type="button"
                className="segBtn"
                disabled={inspecting}
                onClick={() => { void choosePath() }}
              >
                {inspecting ? 'Checking…' : 'Choose…'}
              </button>
            </>
          )}
        </div>
        {!nativePicker && (
          <div className="settingsDropFieldManualRow">
            <input
              className="storageRowInput"
              type="text"
              placeholder="Or type a folder path…"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitManualPath() }}
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              className="segBtn"
              disabled={inspecting || !manualPath.trim()}
              onClick={submitManualPath}
            >
              Continue
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="error">
          <span className="errText">{error}</span>
        </div>
      )}
      {pendingPath && (
        <GitCheckoutConfirm
          variant="confirm"
          title="Import settings"
          warnings={[`Found ${appsCount} app${appsCount === 1 ? '' : 's'} in ${pendingPath}.`]}
          confirmLabel="Merge"
          confirmTone="primary"
          secondaryLabel="Replace"
          secondaryTone="destructive"
          onConfirm={() => { if (!applying) void apply('merge') }}
          onSecondary={() => { if (!applying) void apply('replace') }}
          onCancel={closeConfirm}
        />
      )}
    </div>
  )
}
