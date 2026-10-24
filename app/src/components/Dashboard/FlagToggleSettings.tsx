import { api, type AppConfig } from '../../api'
import { InlineEdit } from './InlineEdit'

function isFlagTogglePlatform(cfg: AppConfig, name: string): boolean {
  return typeof cfg.plugins?.['flag-toggle']?.file === 'string' || name.includes('-platform-')
}

export function FlagToggleSettings({
  cfg,
  name,
  savePatch,
}: {
  cfg: AppConfig
  name: string
  savePatch: (patch: Parameters<typeof api.patchApp>[1]) => void
}) {
  const flagToggle = cfg.plugins?.['flag-toggle']
  const patchFlagToggle = (patch: Record<string, unknown>) =>
    savePatch({ plugins: { ...cfg.plugins, 'flag-toggle': { ...flagToggle, ...patch } } })

  if (!isFlagTogglePlatform(cfg, name)) {
    return (
      <div className="configRow">
        <span className="configKey">Flag-toggle key</span>
        <span className="configVal">
          <InlineEdit
            value={(flagToggle?.key as string | undefined) ?? ''}
            onSave={(v) => patchFlagToggle({ key: v })}
          />
        </span>
      </div>
    )
  }

  return (
    <>
      <div className="configRow">
        <span className="configKey">Flag-toggle file</span>
        <span className="configVal">
          <InlineEdit
            value={(flagToggle?.file as string | undefined) ?? ''}
            onSave={(v) => patchFlagToggle({ file: v })}
          />
        </span>
      </div>
      <div className="configRow">
        <span className="configKey">Flag-toggle strategy</span>
        <span className="configVal">
          <InlineEdit
            value={(flagToggle?.strategy as string | undefined) ?? ''}
            onSave={(v) => patchFlagToggle({ strategy: v })}
          />
        </span>
      </div>
    </>
  )
}
