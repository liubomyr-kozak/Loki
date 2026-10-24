import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { ALL_ID } from '../../lib/constants'
import type { GroupStartConflict } from '../../lib/grouping'

export type ViewMode = 'apps' | 'settings'

export const DASHBOARD_TABS = ['apps', 'plugins', 'environment'] as const
export type DashboardTab = typeof DASHBOARD_TABS[number]

export type SettingsSection = 'storage'

// A group start that hit a drift conflict (R: shared app kept alive with a
// different intent must not be resolved silently) parks here until the user
// picks Restart/Keep-as-is/Cancel in GroupStartConflictDialog. Serializable
// (no thunks/functions) so it survives Redux's serializability checks.
export interface PendingExclusiveStart {
  groupId: string
  names: string[]
  allowInvalidIntent?: boolean
  conflicts: GroupStartConflict[]
}

export interface UiState {
  viewMode: ViewMode
  searchQuery: string
  searchActive: boolean
  filterRunning: boolean
  collapsedGroups: string[]
  showSessions: boolean
  autostart: boolean | null
  dashboardTab: DashboardTab
  /** Settings section to scroll into view once the Settings tab renders. */
  settingsScrollTarget: SettingsSection | null
  pendingExclusiveStart: PendingExclusiveStart | null
}

const initialState: UiState = {
  viewMode: 'apps',
  searchQuery: '',
  searchActive: false,
  filterRunning: false,
  // The All bucket starts collapsed so it doesn't double the scroll length.
  collapsedGroups: [ALL_ID],
  showSessions: false,
  autostart: null,
  dashboardTab: 'apps',
  settingsScrollTarget: null,
  pendingExclusiveStart: null,
}

const slice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setViewMode(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload
    },
    setSearchActive(state, action: PayloadAction<boolean>) {
      state.searchActive = action.payload
    },
    clearSearch(state) {
      state.searchActive = false
      state.searchQuery = ''
    },
    toggleFilterRunning(state) {
      state.filterRunning = !state.filterRunning
    },
    toggleCollapsedGroup(state, action: PayloadAction<string>) {
      const id = action.payload
      const idx = state.collapsedGroups.indexOf(id)
      if (idx === -1) state.collapsedGroups.push(id)
      else state.collapsedGroups.splice(idx, 1)
    },
    // Replaces the whole collapsed-set — used to collapse every group at
    // drag-start and to restore the pre-drag snapshot at drag-end/cancel.
    setCollapsedGroups(state, action: PayloadAction<string[]>) {
      state.collapsedGroups = action.payload
    },
    setShowSessions(state, action: PayloadAction<boolean>) {
      state.showSessions = action.payload
    },
    setAutostart(state, action: PayloadAction<boolean | null>) {
      state.autostart = action.payload
    },
    setDashboardTab(state, action: PayloadAction<DashboardTab>) {
      state.dashboardTab = action.payload
    },
    // Settings lives on the 'environment' tab.
    openSettingsSection(state, action: PayloadAction<SettingsSection>) {
      state.dashboardTab = 'environment'
      state.settingsScrollTarget = action.payload
    },
    clearSettingsScrollTarget(state) {
      state.settingsScrollTarget = null
    },
    setPendingExclusiveStart(state, action: PayloadAction<PendingExclusiveStart>) {
      state.pendingExclusiveStart = action.payload
    },
    clearPendingExclusiveStart(state) {
      state.pendingExclusiveStart = null
    },
  },
})

export const {
  setViewMode,
  setSearchQuery,
  setSearchActive,
  clearSearch,
  toggleFilterRunning,
  toggleCollapsedGroup,
  setCollapsedGroups,
  setShowSessions,
  setAutostart,
  setDashboardTab,
  openSettingsSection,
  clearSettingsScrollTarget,
  setPendingExclusiveStart,
  clearPendingExclusiveStart,
} = slice.actions
export default slice.reducer
