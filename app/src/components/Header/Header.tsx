import { RefObject } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { onSettingsOpened, onBackToMenu } from '../../usecases/menuNavigation'
import { SearchBar } from './SearchBar'
import { RunningSummary } from './RunningSummary'
import { SessionsDropdown } from './SessionsDropdown'
import { WORKSPACE_NAME } from '../../lib/constants'
import { LokiMark } from '../common/LokiMark'

export interface HeaderProps {
  searchInputRef: RefObject<HTMLInputElement | null>
}

export function Header({ searchInputRef }: HeaderProps) {
  const dispatch = useAppDispatch()
  const viewMode = useAppSelector((s) => s.ui.viewMode)
  const searchActive = useAppSelector((s) => s.ui.searchActive)

  return (
    <header
      className="header"
      style={viewMode === 'settings' ? { cursor: 'pointer' } : {}}
      onClick={() => viewMode === 'settings' && dispatch(onBackToMenu())}
    >
      {viewMode === 'settings' ? (
        <div className="ws headerBack" style={{ display: 'flex', alignItems: 'center', gap: '6px', minHeight: '26px' }}>
          <ArrowLeft size={16} />
          Settings
        </div>
      ) : (
        searchActive ? (
          <SearchBar searchInputRef={searchInputRef} />
        ) : (
          <>
            <div className="ws wsBrand" style={{ textTransform: 'none' }}><LokiMark />{WORKSPACE_NAME}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RunningSummary />
              <SessionsDropdown />
              <button
                className="settingsBtn"
                onClick={() => dispatch(onSettingsOpened())}
                title="Settings"
              >
                ⬡
              </button>
            </div>
          </>
        )
      )}
    </header>
  )
}
