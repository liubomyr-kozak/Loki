import { useLayoutEffect, useRef, useState } from 'react'
import { TriangleAlert, GitBranch, Globe } from 'lucide-react'
import { Picker } from '../pickers/Picker'
import { DROP_STASH_ITEM } from '../pickers/constants'
import { PluginSlot } from '../common/PluginSlot'
import { PluginGroupPopup } from '../common/PluginGroupPopup'
import { Popover } from '../portals/Popover'
import type { MarketplacePlugin, PluginDescriptor } from '../../api'

export interface AppRowPickersProps {
  selEnv: string
  envs: string[]
  isBusy: boolean
  onEnvSelect: (env: string) => void
  branchValue: string
  branchVisible: boolean
  branchPickerOptions: string[]
  badges: { dirty?: boolean; stashAvailable?: boolean; conflict?: boolean }
  branchesLoading?: boolean
  branchesError?: string
  onBranchOpen?: () => void
  onBranchSelect: (v: string) => void
  plugins: MarketplacePlugin[]
  descriptors: Record<string, Record<string, PluginDescriptor>>
  runningActions: Record<string, boolean>
  name: string
  // Present only for rows inside a group section. Absent entirely outside a group.
  driftSlot?: { active: boolean; branch: string; env: string }
}

export function AppRowPickers({
  selEnv, envs, isBusy, onEnvSelect,
  branchValue, branchVisible, branchPickerOptions, badges,
  branchesLoading, branchesError, onBranchOpen, onBranchSelect,
  plugins, descriptors, runningActions, name, driftSlot,
}: AppRowPickersProps) {
  const visiblePlugins = plugins.filter((p) => {
    const desc = descriptors[name]?.[p.id]
    return desc && desc.visible && desc.surface === 'list'
  })

  // Portal-rendered (document.body, position:fixed) instead of an
  // absolute-positioned sibling: an absolute box near the top/bottom of a row
  // gets clipped or overlaps the row above/below (no gap between adjacent
  // rows to open into). Fixed positioning + real viewport-space math avoids
  // both — same reasoning as this codebase's dropdown Popover/Picker.
  const driftIconRef = useRef<HTMLSpanElement>(null)
  const driftTooltipRef = useRef<HTMLDivElement>(null)
  const [driftTooltipOpen, setDriftTooltipOpen] = useState(false)
  const [driftTooltipPos, setDriftTooltipPos] = useState<
    { left: number; top: number; placement: 'above' | 'below'; arrowRight: number } | null
  >(null)

  useLayoutEffect(() => {
    if (!driftTooltipOpen || !driftIconRef.current) { setDriftTooltipPos(null); return }
    const iconRect = driftIconRef.current.getBoundingClientRect()
    const tipRect = driftTooltipRef.current?.getBoundingClientRect()
    const tipHeight = tipRect?.height ?? 60
    const tipWidth = tipRect?.width ?? 220
    const margin = 8
    // Above by default (the row's own line sits at the bottom of the row, so
    // opening downward covered the next row's controls); flip below only when
    // there genuinely isn't room above.
    const aboveSpace = iconRect.top - margin
    const placement: 'above' | 'below' = aboveSpace >= tipHeight ? 'above' : 'below'
    const top = placement === 'above' ? iconRect.top - tipHeight - 6 : iconRect.bottom + 6
    // Pushed as far right as the viewport allows (not right-aligned to the
    // icon itself) — the icon sits mid-controls, so hugging the right edge
    // keeps the box out of the row's remaining content.
    const left = Math.max(margin, window.innerWidth - tipWidth - margin)
    // Arrow tracks the icon's centre regardless of how far right the box went.
    const iconCentre = iconRect.left + iconRect.width / 2
    const arrowRight = Math.max(6, Math.min(left + tipWidth - iconCentre - 5, tipWidth - 16))
    setDriftTooltipPos({ left, top, placement, arrowRight })
  }, [driftTooltipOpen])

  return (
    <>
      {envs.length > 0 && (
        <span className="rowMetaCell rowMetaEnv">
          <Picker
            value={selEnv}
            options={envs}
            disabled={isBusy}
            variant="env"
            onSelect={onEnvSelect}
          />
        </span>
      )}
      {(branchVisible || visiblePlugins.length > 0) && (
        <span className="rowMetaCell rowMetaBranch">
          {branchVisible && (
            <Picker
              value={branchValue}
              options={branchPickerOptions}
              disabled={isBusy}
              variant="branch"
              badges={badges}
              loading={branchesLoading}
              errorText={branchesError}
              onOpen={onBranchOpen}
              onSelect={onBranchSelect}
            />
          )}
          {visiblePlugins.map((p) => {
            const desc = descriptors[name]![p.id]!
            const busy = isBusy || !!runningActions[`${p.id}:${name}`]
            if ('kind' in desc) {
              if (desc.mode === 'popup') {
                return <PluginGroupPopup key={p.id} pluginId={p.id} desc={desc} appName={name} busy={busy} iconSize={13} />
              }
              return desc.items.filter((item) => item.visible).map((item) => (
                <PluginSlot key={`${p.id}:${item.id}`} pluginId={p.id} desc={item} actionId={item.id} appName={name} busy={busy} iconSize={13} />
              ))
            }
            return (
              <PluginSlot key={p.id} pluginId={p.id} desc={desc} appName={name} busy={busy} iconSize={13} />
            )
          })}
        </span>
      )}
      {driftSlot?.active && (
        <span
          className="rowMetaCell rowMetaDrift"
          ref={driftIconRef}
          onMouseEnter={() => setDriftTooltipOpen(true)}
          onMouseLeave={() => setDriftTooltipOpen(false)}
        >
          <TriangleAlert className="driftWarningIcon" size={13} />
          {driftTooltipOpen && (
            <Popover
              innerRef={driftTooltipRef}
              backdrop={false}
              className={`driftTooltip driftTooltip-${driftTooltipPos?.placement ?? 'below'}`}
              style={{
                position: 'fixed',
                left: driftTooltipPos?.left ?? -9999,
                top: driftTooltipPos?.top ?? -9999,
                visibility: driftTooltipPos ? 'visible' : 'hidden',
                ['--drift-arrow-right' as string]: `${driftTooltipPos?.arrowRight ?? 5}px`,
              }}
            >
              <span className="driftTooltipHeader">Running (not what you selected):</span>
              <span className="driftTooltipRow"><GitBranch size={12} /> {driftSlot.branch}</span>
              <span className="driftTooltipRow"><Globe size={12} /> {driftSlot.env}</span>
            </Popover>
          )}
        </span>
      )}
    </>
  )
}
