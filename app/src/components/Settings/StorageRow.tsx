import { FolderOpen } from 'lucide-react'
import { openFolder } from '../../lib/tauri'
import { InlineEdit } from '../Dashboard/InlineEdit'
import { SettingsRowMeta } from './SettingsRowMeta'

export function StorageRow({ label, desc, path, onSave }: {
  label: string
  desc?: string
  path?: string
  onSave?: (value: string) => Promise<void> | void
}) {
  const hasPath = Boolean(path)
  return (
    <div className="settingsItem storageRow">
      <SettingsRowMeta label={label} tip={desc} />
      <div className="settingsItemControl">
        {onSave ? (
          <InlineEdit value={path ?? ''} placeholder="—" onSave={onSave} />
        ) : (
          <input
            className="storageRowInput"
            type="text"
            readOnly
            value={path ?? ''}
            placeholder="—"
            title={path}
            onFocus={e => e.currentTarget.select()}
            onClick={e => e.currentTarget.select()}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoComplete="off"
          />
        )}
        <button
          type="button"
          className="segBtn"
          title="Open folder"
          aria-label="Open folder"
          disabled={!hasPath}
          onClick={() => { void openFolder(path ?? '') }}
        >
          <FolderOpen size={14} />
        </button>
      </div>
    </div>
  )
}
