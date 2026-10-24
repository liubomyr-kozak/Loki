import { useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import type { ComponentCandidate } from '../../api'
import { InlineEdit } from '../Dashboard/InlineEdit'
import { FieldStatusIndicator, type FieldStatusValue } from './FieldStatus'
import { SettingsRowMeta } from './SettingsRowMeta'

const CUSTOM_OPTION = '__custom__'

/**
 * A `.settingsItem`-style row for a path-with-candidates field (Shell, tmux
 * binary, Runtime): native `<select>` over `candidates` + a "Custom path…"
 * option that swaps the row into inline-text-edit mode, plus a per-field
 * redetect button and a found/missing status badge.
 *
 * IMPORTANT (keyboard nav): this component intentionally does NOT attach any
 * ArrowUp/ArrowDown handling of its own — it relies entirely on the native
 * `<select>`'s built-in keyboard behavior. Callers MUST render `SelectorRow`
 * as a sibling of other `.settingsItem` rows, OUTSIDE any
 * `.providerCards[role=radiogroup]` container. That container's roving-
 * tabindex `moveSelection` arrow-key handler would otherwise fight with the
 * native `<select>`'s own arrow-key option cycling.
 */
export function SelectorRow({
  id,
  label,
  desc,
  candidates,
  value,
  onChange,
  onRedetect,
  redetecting,
  found,
  status,
  icon,
}: {
  id: string
  label: string
  desc?: string
  candidates: ComponentCandidate[]
  value?: string
  onChange: (path: string) => void | Promise<void>
  onRedetect: () => Promise<void>
  redetecting: boolean
  found?: boolean
  status?: FieldStatusValue
  icon?: ReactNode
}) {
  const [customMode, setCustomMode] = useState(false)

  const isPlaceholder = value == null
  const displayValue = value ?? candidates[0]?.path ?? ''
  const hasMatchingCandidate = value != null && candidates.some(c => c.path === value)
  const isFound = found ?? candidates.length > 0

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value
    if (next === CUSTOM_OPTION) {
      setCustomMode(true)
      return
    }
    void onChange(next)
  }

  return (
    <div className="settingsItem selectorRow">
      <SettingsRowMeta label={label} icon={icon} tip={desc} />
      <div className="settingsItemControl">
        <div className={`detectedCardStatus${isFound ? ' found' : ' missing'}`} style={{ marginTop: 0, flexShrink: 0 }}>
          {isFound ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
        </div>
        {customMode ? (
          <InlineEdit
            value={value ?? ''}
            placeholder={candidates[0]?.path ?? '—'}
            onSave={async (v) => {
              await onChange(v)
              setCustomMode(false)
            }}
          />
        ) : (
          <select
            id={id}
            className={`selectorRowSelect${isPlaceholder ? ' selectorRowSelect--placeholder' : ''}`}
            value={displayValue}
            title={displayValue}
            onChange={handleSelectChange}
          >
            {candidates.map((c, i) => (
              <option key={c.path} value={c.path}>
                {(c.version ?? c.path)}{i === 0 ? ' (detected)' : ''}
              </option>
            ))}
            {value != null && !hasMatchingCandidate && (
              <option value={value}>{value}</option>
            )}
            <option value={CUSTOM_OPTION}>Custom path…</option>
          </select>
        )}
        <button
          type="button"
          className="segBtn"
          style={{ flexShrink: 0, padding: '4px 8px' }}
          title="Redetect"
          aria-label={`Redetect ${label}`}
          disabled={redetecting}
          onClick={() => { void onRedetect() }}
        >
          {redetecting ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        </button>
        <FieldStatusIndicator status={status} />
      </div>
    </div>
  )
}
