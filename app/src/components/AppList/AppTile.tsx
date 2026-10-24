import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { refreshAll, startApp, stopApp } from '../../store/slices/appsSlice'
import { fetchDescriptors } from '../../store/slices/pluginsSlice'
import { fetchScripts } from '../../store/slices/gitSlice'
import { resolveAppIcon } from '../../lib/appIcon'
import { PluginSlot } from '../common/PluginSlot'
import { initials, InitialsFallback } from './InitialsFallback'

export interface AppTileProps {
  name: string
}

export function AppTile({ name }: AppTileProps) {
  const dispatch = useAppDispatch()

  const cfg = useAppSelector((s) => s.apps.config!.apps[name])
  const st = useAppSelector((s) => s.apps.apps[name])
  const isBusy = useAppSelector((s) => !!s.apps.busy[name])
  const plugins = useAppSelector((s) => s.plugins.list)
  const descriptors = useAppSelector((s) => s.plugins.descriptors)
  const runningActions = useAppSelector((s) => s.plugins.runningActions)

  const scriptsInfo = useAppSelector((s) => s.git.scriptsByApp[name])
  const branchInfo = useAppSelector((s) => s.git.branchesByApp[name])
  useEffect(() => {
    if (scriptsInfo === undefined) dispatch(fetchScripts({ appName: name, ref: branchInfo?.current ?? '' }))
  }, [name, scriptsInfo === undefined, dispatch])
  const envs = scriptsInfo?.matched ?? []
  const selEnv = st?.selectedEnvironment && envs.includes(st.selectedEnvironment)
    ? st.selectedEnvironment
    : envs[0]
  const isStoppable = st?.process === 'running'

  const effIcon = resolveAppIcon(cfg.icon)

  const dockControls = plugins.flatMap((p) => {
    const desc = descriptors[name]?.[p.id]
    if (!desc || !desc.visible || desc.surface !== 'dock') return []
    if ('kind' in desc) {
      return desc.items.filter((item) => item.visible).map((item) => ({ plugin: p, desc: item }))
    }
    return [{ plugin: p, desc }]
  })

  return (
    <div className="appTile" title={cfg.label}>
      <span className="appTileMainWrap">
        <button
          className={`appTileMain ${isStoppable ? 'on' : ''}`}
          disabled={isBusy}
          onClick={() => {
            const p = isStoppable
              ? dispatch(stopApp({ name }))
              : dispatch(startApp({ name, environment: selEnv }))
            p.then(() => { dispatch(refreshAll()); dispatch(fetchDescriptors()) })
          }}
        >
          <span className={`dot ${st?.process ?? 'unknown'}`} />
          {isBusy ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <span className="appTileGlyph">
              {effIcon.kind === 'library'
                ? <DynamicIcon className="appTileIcon" name={effIcon.name} size={20} fallback={() => <InitialsFallback label={cfg.label} />} />
                : initials(cfg.label)}
            </span>
          )}
        </button>
        {dockControls.length > 0 && (
          // Sibling of the tile's <button>, not a descendant: interactive plugin
          // controls (button/checkbox) are invalid content inside a <button> per
          // HTML parsing rules, and nesting them let badge clicks bubble into the
          // tile's own start/stop handler. Kept visually in place via
          // .appTileMainWrap being the positioning context instead of .appTileMain.
          <span className="appTileBadges" onClick={(e) => e.stopPropagation()}>
            {dockControls.map(({ plugin, desc }) => (
              <PluginSlot
                key={desc.id ? `${plugin.id}:${desc.id}` : plugin.id}
                pluginId={plugin.id}
                desc={desc}
                actionId={desc.id}
                appName={name}
                busy={isBusy || !!runningActions[`${plugin.id}:${name}`]}
                iconSize={11}
              />
            ))}
          </span>
        )}
      </span>
      <span className="appTileLabel">{cfg.label}</span>
    </div>
  )
}
