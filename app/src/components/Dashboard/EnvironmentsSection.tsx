import { useEffect, useState } from 'react'
import { Filter, Loader2, SquareTerminal, X } from 'lucide-react'
import { compileEnvFilter } from '../../../shared/envFilter'
import type { ScannedScript } from '../../api'
import { SectionCard } from '../Settings/SectionCard'
import { Picker } from '../pickers/Picker'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchBranches } from '../../store/slices/gitSlice'
import { closeAllPopovers } from '../../lib/popoverHost'
import { useMenus } from '../MenusContext'

export function EnvironmentsSection({
  name,
  previewRef,
  setPreviewRef,
  previewScripts,
  previewMatched,
  previewLoading,
  previewError,
}: {
  name: string
  previewRef: string
  setPreviewRef: (ref: string) => void
  previewScripts: ScannedScript[]
  previewMatched: string[]
  previewLoading: boolean
  previewError: string
}) {
  const dispatch = useAppDispatch()
  const branches = useAppSelector((s) => s.git.branchesByApp[name]?.branches) ?? []
  const branchesLoading = useAppSelector((s) => s.git.branchesLoading[name])
  const branchesError = useAppSelector((s) => s.git.branchesError[name])
  // Temporary view filter: lives only in this component's state, so it is
  // never saved — closing the field clears it, and switching apps or closing
  // the window remounts/unmounts the section and drops it too.
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState('')
  const { iconPicker } = useMenus()

  // The icon picker opens on top of this branch picker (both live in the same
  // header area) without going through the picker's own outside-click path —
  // close the branch picker up front so it isn't left open behind/after it.
  useEffect(() => {
    if (iconPicker) closeAllPopovers()
  }, [iconPicker])

  const closeFilter = () => {
    setFilterOpen(false)
    setFilterQuery('')
  }

  const compiled = compileEnvFilter(filterQuery)
  const queryRe = compiled.ok ? compiled.re : null
  const queryError = compiled.ok ? '' : compiled.error

  // Saved environment regex (Settings → Environments, or a per-app override)
  // still decides which scripts count as environments.
  const savedSet = new Set(previewMatched)
  const savedFilterActive = previewScripts.some((s) => !savedSet.has(s.name))
  const queryActive = queryRe !== null
  const filterActive = queryActive || savedFilterActive
  const isMatched = (s: ScannedScript) => savedSet.has(s.name) && (!queryRe || queryRe.test(s.name))
  const dimmedCount = previewScripts.filter((s) => !isMatched(s)).length
  // Matched scripts first, filtered-out ones pushed to the bottom of the same list.
  const sortedScripts = [...previewScripts].sort((a, b) => Number(isMatched(b)) - Number(isMatched(a)))

  const filterTitle = [
    queryActive && `Filter: /${filterQuery}/`,
    savedFilterActive && 'Saved environment regex is hiding some scripts (Settings → Environments)',
  ].filter(Boolean).join('\n') || 'Filter scripts'

  const dimmedNote = queryActive && savedFilterActive
    ? 'Dimmed scripts don\'t match the filter or the saved environment regex.'
    : queryActive
      ? 'Dimmed scripts don\'t match the filter.'
      : 'Dimmed scripts are filtered out by the saved environment regex (Settings → Environments).'

  return (
    <SectionCard
      icon={<SquareTerminal size={18} />}
      accent="execution"
      title="Environments"
      description="Environments — scripts from the selected branch, filtered by regex."
      action={
        <>
          <span title="Preview branch (read-only) — does not check out this branch" aria-label="Preview branch (read-only)">
            <Picker
              value={previewRef || '—'}
              options={branches}
              variant="branch"
              caret
              loading={branchesLoading}
              errorText={branchesError}
              onOpen={() => {
                if (!branches.length) dispatch(fetchBranches(name))
              }}
              onSelect={(v) => {
                setPreviewRef(v)
              }}
            />
          </span>
          <button
            type="button"
            className={`pickerTrigger chip-branch filterToggleBtn${filterOpen ? ' active' : ''}${filterActive ? ' applied' : ''}`}
            aria-expanded={filterOpen}
            title={filterTitle}
            onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
          >
            <span className="chipValue">
              <Filter size={14} className="chipIcon" />
              <span className="chipText">Filter</span>
              {filterActive && <span className="filterAppliedDot" aria-label="Filter applied" />}
            </span>
          </button>
        </>
      }
    >
      {previewLoading && previewScripts.length === 0 && (
        <div className="configEmpty"><Loader2 size={12} className="spin" /> Loading scripts…</div>
      )}
      {!previewLoading && previewScripts.length === 0 && (
        <div className="configEmpty">No scripts found on this branch.</div>
      )}
      {(filterOpen || previewScripts.length > 0) && (
        <div className="settingsCardGroup">
          {filterOpen && (
            <div className="envRow filterCapRow">
              <span className="filterRegexWrap">
                <input
                  className="inlineEditInput configValMono filterRegexInput"
                  type="text"
                  value={filterQuery}
                  placeholder="Filter scripts by regex — not saved"
                  onChange={(e) => setFilterQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeFilter()
                  }}
                  autoFocus
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoComplete="off"
                />
                {filterQuery && (
                  <button
                    type="button"
                    className="filterRegexClearBtn"
                    title="Clear filter"
                    onClick={() => setFilterQuery('')}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            </div>
          )}
          {sortedScripts.map((s) => {
            const matched = isMatched(s)
            return (
              <div className={`envRow ${matched ? '' : 'disabled'}`} key={s.name}>
                <span className="envName">{s.name}</span>
                <span className="envCmd">{s.startCommand}</span>
              </div>
            )
          })}
        </div>
      )}
      {dimmedCount > 0 && (
        <div className="configEmpty">{dimmedNote}</div>
      )}

      {(queryError || previewError) && (
        <div className="cfgStatus cfgStatus--error">{queryError ? `Invalid regex: ${queryError}` : previewError}</div>
      )}
    </SectionCard>
  )
}
