import type { ReactNode } from 'react'

export type SectionAccent = 'execution' | 'environment' | 'storage'

export function SectionCard({
  icon,
  accent,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode
  accent: SectionAccent
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`sectionCard sectionCard--${accent}`}>
      <div className="sectionCardHeader">
        <div className="sectionCardIcon">{icon}</div>
        <div className="sectionCardHeaderText">
          <div className="sectionCardTitle">{title}</div>
          {description && <div className="sectionCardDesc">{description}</div>}
        </div>
        {action && <div className="sectionCardHeaderAction">{action}</div>}
      </div>
      <div className="sectionCardBody">{children}</div>
    </section>
  )
}
