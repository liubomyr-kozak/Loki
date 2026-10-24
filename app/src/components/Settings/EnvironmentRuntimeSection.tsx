import { Globe, Package, SquareTerminal } from 'lucide-react'
import type { DetectedRuntime, GlobalConfig } from '../../api'
import { SectionCard } from './SectionCard'
import { SelectorRow } from './SelectorRow'
import type { FieldStatusValue } from './FieldStatus'

export function EnvironmentRuntimeSection({
  global, detected, fieldStatus, redetectingComponent, patch, redetect,
}: {
  global: GlobalConfig
  detected?: DetectedRuntime
  fieldStatus: Record<string, FieldStatusValue>
  redetectingComponent: 'tmux' | 'node' | 'shell' | null
  patch: (partial: Partial<GlobalConfig>, fieldKey?: string) => Promise<void>
  redetect: (component: 'tmux' | 'node' | 'shell') => Promise<void>
}) {
  const shellComponent = detected?.components.find(c => c.id === 'shell')
  const nodeComponent = detected?.components.find(c => c.id === 'node')

  const needsRuntime = () => true

  return (
    <SectionCard
      icon={<Globe size={18} />}
      accent="environment"
      title="Environment"
      description="Shell and runtime used to launch app processes."
    >
      <div className="settingsCardGroup">
        <SelectorRow
          id="shell"
          label="Shell"
          icon={<SquareTerminal size={16} />}
          candidates={shellComponent?.candidates ?? []}
          value={global.defaultShell}
          onChange={(path) => patch({ defaultShell: path }, 'defaultShell')}
          onRedetect={() => redetect('shell')}
          redetecting={redetectingComponent === 'shell'}
          found={shellComponent?.found}
          status={fieldStatus.defaultShell}
        />

        {needsRuntime() && (
          <SelectorRow
            id="runtime"
            label="Runtime"
            icon={<Package size={16} />}
            candidates={nodeComponent?.candidates ?? []}
            value={global.nodePath}
            onChange={(path) => patch({ nodePath: path }, 'nodePath')}
            onRedetect={() => redetect('node')}
            redetecting={redetectingComponent === 'node'}
            found={nodeComponent?.found}
            status={fieldStatus.nodePath}
          />
        )}
      </div>
    </SectionCard>
  )
}
