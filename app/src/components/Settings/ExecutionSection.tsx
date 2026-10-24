import { useRef } from 'react'
import { SquareTerminal } from 'lucide-react'
import type { DetectedRuntime, GlobalConfig, ProviderMeta } from '../../api'
import { SectionCard } from './SectionCard'
import { ProviderCard } from './ProviderCard'
import { ProviderConfigPanel } from './ProviderConfigPanel'
import type { FieldStatusValue } from './FieldStatus'

export function ExecutionSection({
  providers, activeProvider, recommendedId, global, detected,
  patch, fieldStatus, redetectingComponent, onRedetect,
}: {
  providers: ProviderMeta[]
  activeProvider: string
  recommendedId?: string
  global: GlobalConfig
  detected?: DetectedRuntime
  patch: (partial: Partial<GlobalConfig>, fieldKey?: string) => Promise<void>
  fieldStatus: Record<string, FieldStatusValue>
  redetectingComponent: 'tmux' | 'node' | 'shell' | null
  onRedetect: (component: 'tmux' | 'node' | 'shell') => Promise<void>
}) {
  const provRefs = useRef<(HTMLButtonElement | null)[]>([])
  const activeMeta = providers.find(p => p.id === activeProvider)

  const selectableIndices = providers
    .map((p, i) => (p.available ? i : -1))
    .filter(i => i !== -1)

  const moveSelection = (fromIndex: number, dir: 1 | -1) => {
    const pos = selectableIndices.indexOf(fromIndex)
    const basePos = pos === -1 ? (dir === 1 ? -1 : selectableIndices.length) : pos
    let nextPos = basePos + dir
    nextPos = Math.max(0, Math.min(selectableIndices.length - 1, nextPos))
    const nextIndex = selectableIndices[nextPos]
    if (nextIndex == null || nextIndex === fromIndex) return
    void patch({ sessionProvider: providers[nextIndex].id }, 'sessionProvider')
    provRefs.current[nextIndex]?.focus()
  }

  const activeIndex = providers.findIndex(p => p.id === activeProvider)

  return (
    <SectionCard
      icon={<SquareTerminal size={18} />}
      accent="execution"
      title="Execution"
      description="Choose how sessions are launched and kept alive."
    >
      <div
        className="providerCards"
        role="radiogroup"
        aria-label="Session provider"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault()
            moveSelection(activeIndex, -1)
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault()
            moveSelection(activeIndex, 1)
          }
        }}
      >
        {providers.map((p, i) => {
          if (!p.available) return null
          return (
            <ProviderCard
              key={p.id}
              meta={p}
              selected={activeProvider === p.id}
              recommended={p.id === recommendedId}
              tabIndex={activeProvider === p.id ? 0 : -1}
              cardRef={(el) => { provRefs.current[i] = el }}
              onClick={() => patch({ sessionProvider: p.id }, 'sessionProvider')}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  moveSelection(i, -1)
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  moveSelection(i, 1)
                }
              }}
            />
          )
        })}
      </div>

      {/* key={activeMeta?.id}: forces a full remount when the active
          provider changes, rather than reusing the DOM/state of the
          previous provider's panel. FieldRow keys its rows by
          `field.key`, and different providers can reuse the same field
          key with a different `kind`/shape (e.g. a future provider's own
          'restartStaleSessions' as a select instead of tmux's boolean) —
          without the remount, React would try to reconcile that row
          in-place across a kind change instead of swapping it cleanly.
          Left in place rather than reworked: behavior-preserving scope,
          and the risk of a subtle state leak across providers outweighs
          the (currently theoretical) remount cost. */}
      <ProviderConfigPanel
        key={activeMeta?.id}
        activeMeta={activeMeta}
        global={global}
        detected={detected}
        patch={patch}
        fieldStatus={fieldStatus}
        redetectingComponent={redetectingComponent}
        onRedetect={onRedetect}
      />
    </SectionCard>
  )
}
