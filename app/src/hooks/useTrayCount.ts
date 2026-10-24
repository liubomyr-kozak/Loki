import { useEffect } from 'react'
import { useAppSelector } from '../store/hooks'
import { selectRunningCount } from '../store/selectors'
import { setTrayCount } from '../lib/tauri'

export function useTrayCount(): void {
  const runningCount = useAppSelector(selectRunningCount)

  useEffect(() => {
    setTrayCount(runningCount)
  }, [runningCount])
}
