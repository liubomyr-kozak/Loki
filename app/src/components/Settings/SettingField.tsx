import type { ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { GlobalConfig, ProviderSettingField } from '../../api'
import { InlineEdit } from '../Dashboard/InlineEdit'
import { openFolder } from '../../lib/tauri'
import { CopyButton } from './CopyButton'
import { FieldStatusIndicator, type FieldStatusValue } from './FieldStatus'
import { SettingsRowMeta } from './SettingsRowMeta'

export function SettingField({ field, global, patch, placeholder, status, icon }: {
  field: ProviderSettingField
  global: GlobalConfig
  patch: (partial: Partial<GlobalConfig>, fieldKey: string) => Promise<void>
  placeholder?: string
  status?: FieldStatusValue
  icon?: ReactNode
}) {
  const value = (global as Record<string, string | undefined>)[field.key] ?? ''
  return (
    <div className="settingsItem">
      <SettingsRowMeta label={field.label} icon={icon} tip={field.desc} />
      <div className="settingsItemControl">
        <InlineEdit
          value={value}
          placeholder={placeholder ?? '—'}
          onSave={(v) => patch({ [field.key]: v } as Partial<GlobalConfig>, field.key)}
        />
        {field.kind === 'path' && (
          <button
            className="segBtn settingsFieldFolderBtn"
            title="Choose folder"
            onClick={async () => {
              await openFolder(value || '')
            }}
          >
            <FolderOpen size={14} />
          </button>
        )}
        {field.copyable && value && <CopyButton value={value} label={field.label} />}
        <FieldStatusIndicator status={status} />
      </div>
    </div>
  )
}
