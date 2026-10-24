import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { toggleFilterRunning } from '../../store/slices/uiSlice'
import { selectRunningCount, selectAppCount } from '../../store/selectors'

export function RunningSummary() {
  const dispatch = useAppDispatch()
  const runningCount = useAppSelector(selectRunningCount)
  const allNamesLength = useAppSelector(selectAppCount)
  const filterRunning = useAppSelector((s) => s.ui.filterRunning)

  if (allNamesLength === 0) return null

  return (
    <div className="summary" onClick={() => dispatch(toggleFilterRunning())} style={{ cursor: 'pointer' }}>
      <span style={{ color: filterRunning ? 'var(--color-success, #4caf50)' : undefined, marginRight: 3 }}>{runningCount}</span>
      / {allNamesLength} <span style={{ color: filterRunning ? 'var(--color-success, #4caf50)' : undefined }}>running</span>
    </div>
  )
}
