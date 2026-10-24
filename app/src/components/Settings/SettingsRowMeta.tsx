import type { ReactNode } from 'react'

export interface SettingsRowMetaProps {
  label: ReactNode
  icon?: ReactNode
  tip?: string
  desc?: ReactNode
  tipAriaLabel?: string
}

export function SettingsRowMeta({ label, icon, tip, desc, tipAriaLabel }: SettingsRowMetaProps) {
  return (
    <div className="meta">
      {icon && <span className="settingsItemIcon">{icon}</span>}
      <div className="name">
        {label}
        {tip && (
          <span className="branchTip fieldTip">
            <button type="button" className="fieldTipTrigger" aria-label={`About ${tipAriaLabel ?? (typeof label === 'string' ? label : '')}`}>?</button>
            <span className="tipBubble" role="tooltip">{tip}</span>
          </span>
        )}
      </div>
      {desc && <div className="desc">{desc}</div>}
    </div>
  )
}
