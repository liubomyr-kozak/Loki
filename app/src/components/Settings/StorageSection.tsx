import { Folder } from 'lucide-react'
import type { DetectedRuntime } from '../../api'
import { SectionCard } from './SectionCard'
import { StorageRow } from './StorageRow'
import { SettingsDropField } from './SettingsDropField'
import { PluginFoldersField } from './PluginFoldersField'

export interface StorageSectionProps {
  detected?: DetectedRuntime
  /** Called after the extra plugin folders changed. */
  onPluginFoldersChanged: () => void
  incomingDropPath: string | null
  onClearDrop: () => void
  onImported: () => void
}

export function StorageSection({ detected, onPluginFoldersChanged, incomingDropPath, onClearDrop, onImported }: StorageSectionProps) {
  return (
    <SectionCard
      icon={<Folder size={18} />}
      accent="storage"
      title="Storage"
      description="Folders where configuration, state and plugins live. Every path here is a folder, not a file."
    >
      <div className="settingsCardGroup">
        <StorageRow
          label="Config folder"
          desc="A folder, not a file. It holds the config file (loki-config.json) together with state and session logs."
          path={detected?.stateDir}
        />
        <PluginFoldersField
          folders={detected?.pluginFolders ?? []}
          onChanged={onPluginFoldersChanged}
        />
        <SettingsDropField
          incomingDropPath={incomingDropPath}
          onClearDrop={onClearDrop}
          onImported={onImported}
        />
      </div>
    </SectionCard>
  )
}
