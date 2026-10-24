import { TerminalSquare, SquareTerminal, Square } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setShowSessions } from '../../store/slices/uiSlice'
import { fetchSessions } from '../../store/slices/sessionsSlice'
import { stopApp, refreshAll } from '../../store/slices/appsSlice'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { openTerminal } from '../AppList/TerminalButton'

export function SessionsDropdown() {
  const dispatch = useAppDispatch()
  const sessions = useAppSelector((s) => s.sessions.sessions)
  const showSessions = useAppSelector((s) => s.ui.showSessions)

  useOutsideClose(showSessions, () => dispatch(setShowSessions(false)))

  if (sessions.length === 0) return null

  return (
    <div className="sessionsWrap" onClick={(e) => e.stopPropagation()}>
      <button
        className={`groupBtn${showSessions ? ' active' : ''}`}
        title="tmux sessions"
        onClick={() => {
          if (!showSessions) dispatch(fetchSessions())
          dispatch(setShowSessions(!showSessions))
        }}
      >
        <TerminalSquare size={15} />
      </button>
      {showSessions && (
        <div className="sessionsDropdown">
          {sessions.map((s) => (
            <div key={s.target} className="sessionsRow">
              <span className={`sessionDot${s.dead ? ' dead' : ''}`} />
              <span className="sessionLabel">
                {s.label}
                {s.port != null && <span className="sessionPort">:{s.port}</span>}
              </span>
              <button
                className="sessionBtn"
                title={s.appName ? 'Open in terminal' : 'Attach unavailable for unmanaged sessions'}
                disabled={!s.appName}
                onClick={() => { if (s.appName) void openTerminal(s.appName) }}
              ><SquareTerminal size={12} /></button>
              <button
                className="sessionBtn"
                title={s.appName ? 'Stop' : 'No managed app'}
                disabled={!s.appName}
                onClick={() => {
                  if (!s.appName) return
                  dispatch(stopApp({ name: s.appName })).then(() => {
                    dispatch(refreshAll())
                    dispatch(fetchSessions())
                  })
                }}
              ><Square size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
