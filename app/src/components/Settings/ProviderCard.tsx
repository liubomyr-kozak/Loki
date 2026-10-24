import { CheckCircle2 } from 'lucide-react'
import type { ProviderMeta } from '../../api'
import { ProviderIcon } from './ProviderIcon'

export function ProviderCard({
  meta, selected, recommended, tabIndex, cardRef, onClick, onKeyDown,
}: {
  meta: ProviderMeta
  selected: boolean
  recommended: boolean
  tabIndex: number
  cardRef: (el: HTMLButtonElement | null) => void
  onClick: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  const disabled = !meta.available
  return (
    <button
      ref={cardRef}
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      className={`providerCard${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      onKeyDown={onKeyDown}
    >
      <div className="providerCardIcon"><ProviderIcon icon={meta.icon} id={meta.id} /></div>
      <div className="providerCardBody">
        <div className="providerCardTitle">
          {meta.label}
          {recommended && <span className="providerBadge">Recommended</span>}
        </div>
        <div className="providerCardDesc">{meta.description}</div>
        {meta.benefits.length > 0 && (
          <ul className="providerCardBenefits">
            {meta.benefits.map((b) => (
              <li key={b}>
                {recommended ? <CheckCircle2 size={12} /> : <span className="providerCardBenefitDot" aria-hidden="true" />}
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
    </button>
  )
}
