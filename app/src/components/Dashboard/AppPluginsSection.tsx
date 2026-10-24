import { Puzzle } from 'lucide-react'
import { api, type AppConfig, type MarketplacePlugin } from '../../api'
import { PluginsEditor } from './PluginsEditor'
import { SectionCard } from '../Settings/SectionCard'
import { FlagToggleSettings } from './FlagToggleSettings'

export function AppPluginsSection({
  cfg,
  name,
  plugins,
  savePatch,
}: {
  cfg: AppConfig
  name: string
  plugins: MarketplacePlugin[]
  savePatch: (patch: Parameters<typeof api.patchApp>[1]) => void
}) {
  return (
    <SectionCard icon={<Puzzle size={18} />} accent="storage" title="Plugins">
      <div className="settingsCardGroup">
        <div className="configRow">
          <span className="configKey">Add plugin</span>
          <span className="configVal">
            <PluginsEditor
              plugins={cfg.plugins ?? {}}
              allPlugins={plugins.filter((p) => p.activated && p.enabled).map((p) => ({ id: p.id, name: p.name }))}
              onChange={(next) => savePatch({ plugins: next })}
            />
          </span>
        </div>
      </div>

      {Object.keys(cfg.plugins ?? {}).map((pluginId) => {
        const pluginName = plugins.find((p) => p.id === pluginId)?.name ?? pluginId
        return (
          <div className="pluginSettingsGroup" key={pluginId}>
            <div className="pluginSettingsGroupTitle">{pluginName}</div>
            <div className="settingsCardGroup">
              {pluginId === 'flag-toggle' ? (
                <FlagToggleSettings cfg={cfg} name={name} savePatch={savePatch} />
              ) : (
                <div className="configRow">
                  <span className="configVal configEmpty">No settings</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </SectionCard>
  )
}
