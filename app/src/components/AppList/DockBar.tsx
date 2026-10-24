import { useAppSelector } from '../../store/hooks'
import { selectDockNames } from '../../store/selectors'
import { AppTile } from './AppTile'

export function DockBar() {
  const dockNames = useAppSelector(selectDockNames)

  if (dockNames.length === 0) return null

  return (
    <div className="dockBar">
      {dockNames.map((name) => (
        <AppTile key={name} name={name} />
      ))}
    </div>
  )
}
