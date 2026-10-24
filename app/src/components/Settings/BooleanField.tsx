import type { ReactNode } from 'react'
import type { GlobalConfig, ProviderSettingField } from '../../api'
import { FieldStatusIndicator, type FieldStatusValue } from './FieldStatus'
import { SettingsRowMeta } from './SettingsRowMeta'

export function BooleanField({ field, global, patch, status, icon }: {
  field: ProviderSettingField
  global: GlobalConfig
  patch: (partial: Partial<GlobalConfig>, fieldKey: string) => void | Promise<void>
  status?: FieldStatusValue
  icon?: ReactNode
}) {
  const value = Boolean((global as Record<string, unknown>)[field.key])
  return (
    <div className="settingsItem">
      <SettingsRowMeta label={field.label} icon={icon} tip={field.desc} />
      <div className="booleanFieldControls">
        <label className="booleanFieldLabel">
          <input
            type="checkbox"
            role="switch"
            aria-checked={value}
            aria-label={field.label}
            checked={value}
            onChange={(e) => { void patch({ [field.key]: e.target.checked } as Partial<GlobalConfig>, field.key) }}
          />
          <span>Enabled</span>
        </label>
        <FieldStatusIndicator status={status} />
      </div>
    </div>
  )
}
