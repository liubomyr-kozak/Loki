import { useMenus } from '../MenusContext'
import { AppIdentityRow } from './AppIdentityRow'
import { EnvironmentsSection } from './EnvironmentsSection'
import { AppDetailsForm } from './AppDetailsForm'
import { AppPluginsSection } from './AppPluginsSection'
import { DeleteAppSection } from './DeleteAppSection'
import { useAppConfigDetail } from './useAppConfigDetail'

export function AppConfigDetail({ name }: { name: string }) {
  const { openIconPicker } = useMenus()
  const s = useAppConfigDetail(name)
  if (!s.cfg) return <div className="empty">App not found.</div>
  const { cfg } = s
  return (
    <div className="appConfigDetail">
      <AppIdentityRow
        name={name}
        label={cfg.label ?? ''}
        icon={cfg.icon}
        repoPath={cfg.repoPath}
        onOpenIconPicker={openIconPicker}
        onSaveLabel={(v) => s.savePatch({ label: v })}
      />
      <EnvironmentsSection
        name={name}
        previewRef={s.previewRef}
        setPreviewRef={s.setPreviewRef}
        previewScripts={s.previewScripts}
        previewMatched={s.previewMatched}
        previewLoading={s.previewLoading}
        previewError={s.previewError}
      />
      <AppDetailsForm
        cfg={cfg}
        otherApps={s.otherApps}
        allGroups={s.allGroups}
        cfgError={s.cfgError}
        savePatch={s.savePatch}
      />
      <AppPluginsSection cfg={cfg} name={name} plugins={s.plugins} savePatch={s.savePatch} />
      <DeleteAppSection name={name} />
    </div>
  )
}
