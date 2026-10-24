import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { reloadConfig } from '../../store/slices/appsSlice'
import { fetchPlugins } from '../../store/slices/pluginsSlice'
import { fetchBranches } from '../../store/slices/gitSlice'
import { api } from '../../api'
import type { ScannedScript } from '../../api'
import { selectAllGroups } from '../../lib/grouping'
import { errMsg } from '../../lib/errors'
import { ALL_ID } from '../../lib/constants'

export function useAppConfigDetail(name: string) {
  const dispatch = useAppDispatch()
  const cfg = useAppSelector((s) => s.apps.config?.apps[name])
  const allApps = useAppSelector((s) => s.apps.config?.apps) ?? {}
  const allGroups = useAppSelector((s) => selectAllGroups(s.apps.config))
  const plugins = useAppSelector((s) => s.plugins.list)
  const globalFilterRegex = useAppSelector((s) => s.apps.config?.global?.environmentFilterRegex)
  const currentBranch = useAppSelector((s) => s.git.branchesByApp[name]?.current)
  const branchesByApp = useAppSelector((s) => s.git.branchesByApp[name])

  useEffect(() => { dispatch(fetchPlugins()) }, [dispatch])

  // Populate the branch list for this app so "develop" can be detected as the
  // default preview branch, even before the user opens the branch picker.
  useEffect(() => {
    if (!branchesByApp) dispatch(fetchBranches(name))
  }, [dispatch, name, branchesByApp])

  const [cfgError, setCfgError] = useState('')

  // Read-only preview: pick a branch to preview its scripts WITHOUT checking it out.
  const [previewRef, setPreviewRef] = useState('')
  const [previewScripts, setPreviewScripts] = useState<ScannedScript[]>([])
  const [previewMatched, setPreviewMatched] = useState<string[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  // The saved filter (global regex or this app's override) decides which
  // scripts are "matched"; refetch the preview whenever either one changes.
  const savedFilterKey = JSON.stringify([globalFilterRegex ?? '', cfg?.environmentFilter ?? null])

  // Default the preview to "develop" (if it exists in this app's branch list)
  // once branches are known, otherwise fall back to the current branch. Only
  // until the user has picked something explicitly.
  useEffect(() => {
    if (previewRef) return
    const branches = branchesByApp?.branches ?? []
    if (branches.includes('develop')) {
      setPreviewRef('develop')
    } else if (currentBranch) {
      setPreviewRef(currentBranch)
    }
  }, [currentBranch, previewRef, branchesByApp])

  useEffect(() => {
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError('')
    api.getBranchScripts(name, previewRef)
      .then((res) => {
        if (cancelled) return
        setPreviewScripts(res.scripts)
        setPreviewMatched(res.matched)
        setPreviewError(res.filterError ?? '')
      })
      .catch((e) => {
        if (cancelled) return
        setPreviewError(errMsg(e))
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [name, previewRef, savedFilterKey])

  const otherApps = Object.fromEntries(Object.entries(allApps).filter(([k]) => k !== name))

  const savePatch = async (patch: Parameters<typeof api.patchApp>[1]) => {
    setCfgError('')
    if (patch.groups?.includes(ALL_ID)) {
      setCfgError(`"${ALL_ID}" is reserved and can't be used as a group name.`)
      return
    }
    try {
      await api.patchApp(name, patch)
      await dispatch(reloadConfig())
    } catch (e) {
      setCfgError(`Save failed: ${errMsg(e)}`)
    }
  }

  return {
    cfg, allApps, allGroups, plugins, otherApps,
    cfgError, savePatch,
    previewRef, setPreviewRef, previewScripts, previewMatched, previewLoading, previewError,
  }
}
