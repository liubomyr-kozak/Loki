import { useEffect, useState } from 'react'
import { FileWarning, Loader2, X } from 'lucide-react'
import { useAppDispatch } from '../../store/hooks'
import { reloadConfig } from '../../store/slices/appsSlice'
import { api } from '../../api'
import type { AppConfig, ScanResult } from '../../api'

function sanitizeKey(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+/, '')
  return /^[a-z0-9]/.test(cleaned) ? cleaned : `app-${cleaned}`
}

interface ScanResponse {
  project: ScanResult
  match: { appName: string } | null
  existingStartCommands: string[]
}

export function ImportProposal({ path, onClose }: { path: string; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [scan, setScan] = useState<ScanResponse | null>(null)
  const [manualCommand, setManualCommand] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.scanProject(path)
      .then(async (res) => {
        if (cancelled) return
        setScan(res)
        if (res.match) return
        const candidates = res.project.scripts.filter((s) => !res.existingStartCommands.includes(s.startCommand))
        const selected = candidates.find((s) => s.isRunLike) ?? candidates[0]
        if (!selected) return
        const app: AppConfig = {
          label: res.project.name,
          repoPath: path,
          startCommand: selected.startCommand,
        }
        await api.addApp(sanitizeKey(res.project.name), app)
        await dispatch(reloadConfig())
        if (!cancelled) onClose()
      })
      .catch((e) => { if (!cancelled) setError(String((e as Error)?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // `onClose` is an inline arrow in Dashboard — depending on it re-runs the
    // effect every render and re-scans right after a successful import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, dispatch])

  const isMerge = !!scan?.match
  const needsManualCommand = !loading && scan != null && !isMerge && scan.project.hasPackageJson === false
  const noScripts = !loading && scan != null && !isMerge && scan.project.hasPackageJson !== false &&
    scan.project.scripts.every((s) => scan.existingStartCommands.includes(s.startCommand))

  const addManual = async () => {
    if (!scan || !manualCommand.trim()) return
    setSaving(true)
    try {
      const app: AppConfig = {
        label: scan.project.name,
        repoPath: path,
        startCommand: manualCommand.trim(),
      }
      await api.addApp(sanitizeKey(scan.project.name), app)
      await dispatch(reloadConfig())
      onClose()
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
      setSaving(false)
    }
  }

  return (
    <div className="importOverlay" onClick={onClose}>
      <div className="importProposal" onClick={(e) => e.stopPropagation()}>
        <div className="importHead">
          <span className="importTitle">
            {loading ? 'Importing…' : isMerge ? `Already imported as ${scan!.match!.appName}` : 'Import new app'}
          </span>
          <button className="dashboardClose" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        {loading && <div className="importLoading"><Loader2 size={16} className="spin" /></div>}

        {isMerge && (
          <div className="importBody">
            <div className="configEmpty">
              This project's start command is already configured on {scan.match!.appName}. Environments are now
              derived from the branch, so there is nothing more to import.
            </div>
          </div>
        )}

        {needsManualCommand && (
          <div className="importBody">
            <div className="configEmpty">
              No package.json found — enter the command that starts this app.
            </div>
            <input
              className="importCommandInput"
              type="text"
              placeholder="e.g. python main.py"
              value={manualCommand}
              onChange={(e) => setManualCommand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void addManual() }}
              autoFocus
            />
            <button className="importCommandAdd" onClick={() => void addManual()} disabled={saving || !manualCommand.trim()}>
              {saving ? 'Adding…' : 'Add app'}
            </button>
          </div>
        )}

        {noScripts && (
          <div className="importBody">
            <div className="configEmpty">No new scripts found in this project.</div>
          </div>
        )}

        {error && (
          <div className="importBody">
            <div className="importError">
              <FileWarning size={16} />
              <div className="importErrorText">
                <span className="importErrorTitle">
                  {/No package\.json/i.test(error)
                    ? 'This folder is not a Node project — no package.json found.'
                    : 'Import failed.'}
                </span>
                <span className="importErrorDetail">
                  {/No package\.json/i.test(error) ? path : error}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
