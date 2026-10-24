import { useEffect, useRef, useState } from 'react'
import { FolderOpen, FolderPlus } from 'lucide-react'
import { api } from '../../api'
import { isTauri, openFolder, pickFolder } from '../../lib/tauri'
import { SettingsRowMeta } from './SettingsRowMeta'

export interface PluginFoldersFieldProps {
  folders: string[]
  /** Called after the list was saved, so Settings and the Plugins tab reload. */
  onChanged: () => void
}

// One editable field listing every plugin folder, one per line (commas work
// too). Saved as `global.pluginFolders` in the config; the first folder is
// where plugins installed from the Plugins tab are copied.
function parseFolders(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

export function PluginFoldersField({ folders, onChanged }: PluginFoldersFieldProps) {
  const saved = folders.join('\n')
  const [draft, setDraft] = useState(saved)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (!editing) setDraft(saved) }, [saved, editing])
  useEffect(() => { if (editing) textareaRef.current?.focus() }, [editing])

  const save = async (next: string[]) => {
    setEditing(false)
    if (next.join('\n') === saved) {
      setDraft(saved)
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.patchGlobalConfig({ pluginFolders: next })
      onChanged()
    } catch (e) {
      setError((e as Error)?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const addPicked = async () => {
    const picked = await pickFolder()
    if (picked && !folders.includes(picked)) await save([...parseFolders(draft), picked])
  }

  return (
    <div className="settingsItem storageRow">
      <SettingsRowMeta
        label="Plugins folders"
        tip="Folders, not files: one per line (or separated by commas). Each is a folder of plugin folders, or a single plugin folder with its own manifest.json. Their plugins appear on the Plugins tab. Plugins you install are copied into the first folder."
      />
      <div className="settingsItemControl pluginFoldersControl">
        {editing ? (
          <textarea
            ref={textareaRef}
            className="storageRowInput pluginFoldersInput pluginFoldersInput--editing"
            rows={Math.max(1, draft.split('\n').length)}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { void save(parseFolders(draft)) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setDraft(saved); setError(''); setEditing(false) }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.blur()
            }}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          // At rest it reads like the other Storage paths: one line per
          // folder, clipped at the start so the meaningful tail stays visible.
          <div
            className="storageRowInput pluginFoldersInput"
            role="button"
            tabIndex={0}
            title="Click to edit: one folder per line, or separated by commas"
            onClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(true) } }}
          >
            {folders.length === 0
              ? <div className="pluginFoldersLine">—</div>
              : folders.map((f) => <div className="pluginFoldersLine" key={f}>{f}</div>)}
          </div>
        )}
        {isTauri() && (
          <button
            type="button"
            className="segBtn"
            title="Add folder"
            aria-label="Add folder"
            disabled={saving}
            onClick={() => { void addPicked() }}
          >
            <FolderPlus size={14} />
          </button>
        )}
        <button
          type="button"
          className="segBtn"
          title="Open folder"
          aria-label="Open folder"
          disabled={folders.length === 0}
          onClick={() => { void openFolder(folders[0] ?? '') }}
        >
          <FolderOpen size={14} />
        </button>
      </div>
      {error && (
        <div className="error">
          <span className="errText">{error}</span>
        </div>
      )}
    </div>
  )
}
