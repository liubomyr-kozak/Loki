import { useEffect, useRef } from 'react'
import { Filter } from 'lucide-react'
import type { GlobalConfig, ProviderSettingField } from '../../api'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearSettingsScrollTarget } from '../../store/slices/uiSlice'
import { fetchCatalog, fetchPlugins } from '../../store/slices/pluginsSlice'
import { reloadConfig } from '../../store/slices/appsSlice'
import { useEnvironmentSettings } from './useEnvironmentSettings'
import { SettingsHeader } from './SettingsHeader'
import { ExecutionSection } from './ExecutionSection'
import { EnvironmentRuntimeSection } from './EnvironmentRuntimeSection'
import { StorageSection } from './StorageSection'
import { SectionCard } from './SectionCard'
import { SettingField } from './SettingField'

const environmentFilterRegexField: ProviderSettingField = {
  key: 'environmentFilterRegex',
  label: 'Environment filter regex',
  desc: 'Regular expression to filter which scripts appear as environments. Empty = all scripts.',
  kind: 'text',
}

export interface EnvironmentSettingsProps {
  // Raw dropPath from Dashboard's single useFolderDrop(), already scoped to
  // the `environment` tab by the caller (null on every other tab).
  incomingDropPath?: string | null
  onClearDrop?: () => void
}

export function EnvironmentSettings({ incomingDropPath = null, onClearDrop = () => {} }: EnvironmentSettingsProps) {
  const dispatch = useAppDispatch()
  const {
    data, status, loading, redetectingComponent, resetConfirming,
    resetting, fieldStatus, load, patch, redetect, handleResetClick,
    patchEnvironmentFilterRegex,
  } = useEnvironmentSettings()

  // Two independent read channels feed off config: the local Settings-panel
  // state (`load()`, from useEnvironmentSettings) and the Redux apps slice
  // that backs the Dashboard app list (`reloadConfig` thunk). Both must
  // refresh after a Merge/Replace apply, since `apps` can change.
  const onImported = async () => {
    await load()
    void dispatch(reloadConfig())
  }

  // The folder button on the Plugins tab lands here: scroll Storage into view
  // once settings have loaded (the section isn't rendered before that).
  const scrollTarget = useAppSelector((s) => s.ui.settingsScrollTarget)
  const storageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollTarget !== 'storage' || !data || !storageRef.current) return
    storageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    dispatch(clearSettingsScrollTarget())
  }, [scrollTarget, data, dispatch])

  const heading = (
    <SettingsHeader confirming={resetConfirming} resetting={resetting} onReset={handleResetClick} />
  )

  if (!data) {
    return (
      <div className="settings">
        {heading}
        {loading ? (
          <div className="empty">Loading…</div>
        ) : (
          <div className="empty">
            {status || 'Failed to load settings.'}
            <div className="emptyRetry">
              <button onClick={() => { void load() }}>Retry</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const { global, providers, activeProvider, recommendedId, detected } = data

  return (
    <div className="settings">
      {heading}

      <ExecutionSection
        providers={providers}
        activeProvider={activeProvider}
        recommendedId={recommendedId}
        global={global}
        detected={detected}
        patch={patch}
        fieldStatus={fieldStatus}
        redetectingComponent={redetectingComponent}
        onRedetect={redetect}
      />

      <EnvironmentRuntimeSection
        global={global}
        detected={detected}
        fieldStatus={fieldStatus}
        redetectingComponent={redetectingComponent}
        patch={patch}
        redetect={redetect}
      />

      <SectionCard
        icon={<Filter size={18} />}
        accent="environment"
        title="Environment Filter"
        description="Default filter used when an app's environment filter is set to use the global value."
      >
        <div className="settingsCardGroup">
          <SettingField
            field={environmentFilterRegexField}
            global={global}
            patch={(partial: Partial<GlobalConfig>) =>
              patchEnvironmentFilterRegex(partial.environmentFilterRegex ?? '')}
            status={fieldStatus.environmentFilterRegex}
          />
        </div>
      </SectionCard>

      <div ref={storageRef}>
      <StorageSection
        detected={detected}
        onPluginFoldersChanged={() => {
          void load()
          void dispatch(fetchPlugins())
          void dispatch(fetchCatalog())
        }}
        incomingDropPath={incomingDropPath}
        onClearDrop={onClearDrop}
        onImported={() => { void onImported() }}
      />
      </div>

      <div className="cfgStatus">{status}</div>
    </div>
  )
}
