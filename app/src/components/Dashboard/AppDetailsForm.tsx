import { Cog } from 'lucide-react'
import { api, type AppSurface, type AppConfig } from '../../api'
import { selectAllGroups } from '../../lib/grouping'
import { InlineEdit } from './InlineEdit'
import { DependsEditor } from './DependsEditor'
import { GroupsEditor } from './GroupsEditor'
import { CopyButton } from '../Settings/CopyButton'
import { SectionCard } from '../Settings/SectionCard'

export function AppDetailsForm({
  cfg,
  otherApps,
  allGroups,
  cfgError,
  savePatch,
}: {
  cfg: AppConfig
  otherApps: Record<string, AppConfig>
  allGroups: ReturnType<typeof selectAllGroups>
  cfgError: string
  savePatch: (patch: Parameters<typeof api.patchApp>[1]) => void
}) {
  return (
    <SectionCard icon={<Cog size={18} />} accent="environment" title="Details">
      <div className="settingsCardGroup">
        <div className="configRow">
          <span className="configKey">Repo path</span>
          <span className="configVal configValMono">
            <InlineEdit value={cfg.repoPath ?? ''} onSave={(v) => savePatch({ repoPath: v })} />
          </span>
          {cfg.repoPath ? <CopyButton value={cfg.repoPath} label="repo path" /> : null}
        </div>
        <div className="configRow">
          <span className="configKey">Repo URL</span>
          <span className="configVal">
            <InlineEdit value={cfg.repoUrl ?? ''} onSave={(v) => savePatch({ repoUrl: v })} />
          </span>
          {cfg.repoUrl ? <CopyButton value={cfg.repoUrl} label="repo URL" /> : null}
        </div>
        <div className="configRow">
          <span className="configKey">App URL</span>
          <span className="configVal">
            <InlineEdit value={cfg.appUrl ?? ''} onSave={(v) => savePatch({ appUrl: v })} />
          </span>
          {cfg.appUrl ? <CopyButton value={cfg.appUrl} label="app URL" /> : null}
        </div>
        <div className="configRow">
          <span className="configKey">Placement</span>
          <span className="configVal">
            <div className="placementPicker">
              {(['list', 'dock'] as const).map((surface) => (
                <button
                  key={surface}
                  type="button"
                  className={`placementCard${cfg.surface === surface ? ' active' : ''}`}
                  aria-pressed={cfg.surface === surface}
                  onClick={() => savePatch({ surface: surface as AppSurface })}
                >
                  <div className="placementMockup">
                    <div className="placementMockupHeader" />
                    <div className="placementMockupBody">
                      {surface === 'list'
                        ? (
                          <>
                            <div className="placementMockupRow" />
                            <div className="placementMockupRow" />
                            <div className="placementMockupRow" />
                          </>
                          )
                        : (
                          <div className="placementMockupDockStrip">
                            <div className="placementMockupDockIcon" />
                            <div className="placementMockupDockIcon" />
                            <div className="placementMockupDockIcon" />
                          </div>
                          )}
                    </div>
                  </div>
                  <span className="placementLabel">{surface === 'list' ? 'List' : 'Dock'}</span>
                </button>
              ))}
            </div>
          </span>
        </div>
        <div className="configRow">
          <span className="configKey">Depends on</span>
          <span className="configVal">
            <DependsEditor
              names={cfg.dependsOn ?? []}
              allApps={otherApps}
              onChange={(next) => savePatch({ dependsOn: next })}
            />
          </span>
        </div>
        <div className="configRow">
          <span className="configKey">Groups</span>
          <span className="configVal">
            <GroupsEditor
              groups={cfg.groups ?? []}
              allGroups={allGroups}
              onChange={(next) => savePatch({ groups: next })}
            />
          </span>
        </div>
      </div>
      {cfgError && <div className="cfgStatus cfgStatus--error">{cfgError}</div>}
    </SectionCard>
  )
}
