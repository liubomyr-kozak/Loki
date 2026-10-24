import { useAppDispatch } from '../../store/hooks'
import { startApp, stopApp } from '../../store/slices/appsSlice'

export interface RowErrorProps {
  name: string
  error: string
  selEnv: string
}

export function RowError({ name, error, selEnv }: RowErrorProps) {
  const dispatch = useAppDispatch()
  const portIssue = /in use|port|EADDRINUSE|already/i.test(error)

  return (
    <div className="error">
      <span className="errText">{error}</span>
      {portIssue && (
        <span className="forceBtns">
          <button onClick={() => dispatch(startApp({ name, environment: selEnv || undefined, force: true }))}>Force start</button>
          <button onClick={() => dispatch(stopApp({ name, force: true }))}>Force stop</button>
        </span>
      )}
    </div>
  )
}
