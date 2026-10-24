import type { ReactNode } from 'react'
import { Cog, Link2, Podcast, RotateCw, SquareTerminal, Tag } from 'lucide-react'
import type { DetectedRuntime, GlobalConfig, ProviderSettingField } from '../../api'
import { SelectorRow } from './SelectorRow'
import { SettingField } from './SettingField'
import { BooleanField } from './BooleanField'
import { FieldStatusIndicator, type FieldStatusValue } from './FieldStatus'

function fieldIcon(key: string): ReactNode {
  const k = key.toLowerCase()
  if (k.includes('restart') || k.includes('stale')) return <RotateCw size={16} />
  if (k.includes('bin') || k.includes('tmux')) return <SquareTerminal size={16} />
  if (k.includes('prefix') || k.includes('session')) return <Tag size={16} />
  if (k.includes('socket')) return <Podcast size={16} />
  if (k.includes('attach')) return <Link2 size={16} />
  return <Cog size={16} />
}

export function FieldRow({
  field, global, detected, patch, status, redetectingComponent, onRedetect,
}: {
  field: ProviderSettingField
  global: GlobalConfig
  detected?: DetectedRuntime
  patch: (partial: Partial<GlobalConfig>, fieldKey: string) => Promise<void>
  status?: FieldStatusValue
  redetectingComponent: string | null
  onRedetect: (componentId: 'tmux' | 'node' | 'shell') => Promise<void>
}) {
  const icon = fieldIcon(field.key)

  if (field.kind === 'boolean') {
    return <BooleanField field={field} global={global} patch={patch} status={status} icon={icon} />
  }

  if (field.kind === 'select') {
    const value = (global as Record<string, string | undefined>)[field.key] ?? ''
    return (
      <div className="settingsItem">
        <div className="meta">
          <span className="settingsItemIcon">{icon}</span>
          <div className="name">
            {field.label}
            {field.desc && (
              <span className="branchTip fieldTip">
                <button type="button" className="fieldTipTrigger" aria-label={`About ${field.label}`}>?</button>
                <span className="tipBubble" role="tooltip">{field.desc}</span>
              </span>
            )}
          </div>
        </div>
        <div className="settingsItemControl">
          <select
            className="selectorRowSelect"
            value={value}
            title={(field.options ?? []).find(o => o.value === value)?.label ?? value}
            onChange={(e) => { void patch({ [field.key]: e.target.value } as Partial<GlobalConfig>, field.key) }}
          >
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <FieldStatusIndicator status={status} />
        </div>
      </div>
    )
  }

  // text / path — matched to a detected component by camelCase-prefix, e.g.
  // `tmuxBin` ~ `tmux`, `nodePath` ~ `node`. A plain substring match here
  // would let an unrelated future field (e.g. `devShellPath` containing
  // "shell" mid-string, or a field named after a component without meaning
  // to reference it) silently reroute to that component's SelectorRow, so
  // the id must be the whole leading token: exact match, or followed by an
  // uppercase letter marking the next camelCase word.
  const detectedComp = detected?.components.find(c => {
    const { id } = c
    if (field.key === id) return true
    return field.key.startsWith(id) && /^[A-Z]/.test(field.key.slice(id.length))
  })
  if (detectedComp) {
    const value = (global as Record<string, string | undefined>)[field.key]
    return (
      <SelectorRow
        id={field.key}
        label={field.label}
        desc={field.desc}
        candidates={detectedComp.candidates}
        value={value}
        onChange={(path) => patch({ [field.key]: path } as Partial<GlobalConfig>, field.key)}
        onRedetect={() => onRedetect(detectedComp.id as 'tmux' | 'node' | 'shell')}
        redetecting={redetectingComponent === detectedComp.id}
        found={detectedComp.found}
        status={status}
        icon={icon}
      />
    )
  }

  return (
    <SettingField
      field={field}
      global={global}
      patch={patch}
      placeholder={field.key === 'sessionPrefix' ? 'mfe' : undefined}
      status={status}
      icon={icon}
    />
  )
}
