import { Cog } from 'lucide-react'
import type { DetectedRuntime, GlobalConfig, ProviderMeta } from '../../api'
import { FieldRow } from './FieldRow'
import type { FieldStatusValue } from './FieldStatus'

export function ProviderConfigPanel({
  activeMeta,
  global,
  detected,
  patch,
  fieldStatus,
  redetectingComponent,
  onRedetect,
}: {
  activeMeta?: ProviderMeta
  global: GlobalConfig
  detected?: DetectedRuntime
  patch: (partial: Partial<GlobalConfig>, fieldKey: string) => Promise<void>
  fieldStatus: Record<string, FieldStatusValue>
  redetectingComponent: string | null
  onRedetect: (componentId: 'tmux' | 'node' | 'shell') => Promise<void>
}) {
  const advancedFields = activeMeta?.settings.filter(f => f.advanced) ?? []

  if (!activeMeta || advancedFields.length === 0) return null

  return (
    <div className="providerConfigPanel">
      <div className="providerConfigPanelHeader">
        <span className="providerConfigPanelIcon"><Cog size={16} /></span>
        <div className="providerConfigPanelHeaderText">
          <div className="providerConfigPanelTitle">{activeMeta.label} configuration</div>
          <div className="providerConfigPanelDesc">
            {activeMeta.advancedDescription ?? 'Advanced settings for this provider.'}
          </div>
        </div>
      </div>
      <div className="providerConfigPanelBody">
        {advancedFields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            global={global}
            detected={detected}
            patch={patch}
            status={fieldStatus[field.key]}
            redetectingComponent={redetectingComponent}
            onRedetect={onRedetect}
          />
        ))}
      </div>
    </div>
  )
}
