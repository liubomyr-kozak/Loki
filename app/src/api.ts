import type { AppConfig, WorkspaceConfig, AppStatus, Config, GlobalConfig, PluginMeta, MarketplacePlugin, ControlDescriptor, ControlGroupDescriptor, PluginDescriptor, TemplateContext, Surface, AppSurface, ProcessConflict } from '../shared/types'
import type { ScanResult, ComponentCandidate, DetectedComponent, DetectedRuntime, DetectedComponentId, ScannedScript } from '../shared/scan.types'
import type { GroupAppIntent, GroupSelections } from '../shared/groupSelections.types'
import type { InstanceRecord } from '../shared/instances.types'
// Value import (not `import type`) — same as `ConfigSchema` etc. below:
// `decideLinkage` is the ONE shared linked/detached decision (ADR §Фаза 2,
// invariant #2), pure and dependency-free, so it's safe to pull straight
// into the Vite bundle rather than re-implementing it client-side.
export { decideLinkage, possibleProcessKeys } from '../shared/linkage'
export type { LinkageDecision, LinkageMode } from '../shared/linkage'
import { z } from 'zod'
import { ConfigSchema, PluginDescriptorSchema, PluginMetaSchema, CatalogEntrySchema } from '../shared/schema'
export type { AppConfig, WorkspaceConfig, AppStatus, ScanResult, ComponentCandidate, PluginMeta, MarketplacePlugin, ControlDescriptor, ControlGroupDescriptor, PluginDescriptor, TemplateContext, GlobalConfig, Surface, AppSurface, DetectedComponent, DetectedRuntime, DetectedComponentId, ScannedScript, GroupAppIntent, GroupSelections, InstanceRecord, ProcessConflict }
export type FullConfig = Config

// 127.0.0.1, not localhost: localhost resolves to [::1] first, and another
// dev server (e.g. Vite) bound to [::1]:9999 would answer instead of Loki.
const BASE = 'http://127.0.0.1:9999'

export interface SessionInfo {
  appName: string | null;
  label: string;
  window: string;
  target: string;
  dead: boolean;
  port?: number;
}

export interface PluginPreview {
  manifest: PluginMeta;
}

export type ProviderSettingFieldKind = 'text' | 'path' | 'select' | 'boolean';

export interface ProviderSettingField {
  key: string;
  label: string;
  desc?: string;
  kind?: ProviderSettingFieldKind;
  options?: { value: string; label: string }[];
  advanced?: boolean;
  copyable?: boolean;
}

export interface ProviderMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  platforms: string[];
  recommended: boolean;
  benefits: string[];
  available: boolean;
  unavailableReason?: string;
  advancedDescription?: string;
  settings: ProviderSettingField[];
}

export interface GlobalConfigResponse {
  global: GlobalConfig;
  providers: ProviderMeta[];
  activeProvider: string;
  recommendedId?: string;
  detected?: DetectedRuntime;
}

export interface GitStashRecord {
  stashRef: string;
  tag: string;
  createdAt: string;
}

export interface GitBranchesResponse {
  current: string;
  branches: string[];
  dirty: boolean;
  stash?: GitStashRecord;
}

export interface GitCheckoutResponse {
  ok: boolean;
  stashed?: boolean;
  appliedStash?: boolean;
  conflict?: boolean;
  files?: string[];
  error?: string;
  staleStash?: boolean;
  warning?: string;
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  installed: boolean;
  example?: boolean;
  /** Already on disk (bundled or in a plugins folder): install just turns it on. */
  onDisk?: boolean;
  folder?: string;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = await r.text()
    try { msg = JSON.parse(msg).error ?? msg } catch { /* keep raw text */ }
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

async function jv<S extends z.ZodTypeAny>(r: Response, schema: S): Promise<z.infer<S>> {
  if (!r.ok) {
    let msg = await r.text()
    try { msg = JSON.parse(msg).error ?? msg } catch { /* keep raw text */ }
    throw new Error(msg)
  }
  return schema.parse(await r.json())
}

export const api = {
  getConfig: () => fetch(`${BASE}/api/config`).then((r) => jv(r, ConfigSchema)) as Promise<FullConfig>,
  getApps: () => fetch(`${BASE}/api/apps`).then(j<Record<string, AppStatus>>),
  start: (name: string, environment?: string, force?: boolean, persistSelection?: boolean, instanceId?: string, resolution?: 'stop-old' | 'keep-old') =>
    fetch(`${BASE}/api/apps/${name}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment, force, persistSelection, instanceId, resolution }),
    }).then(j<AppStatus>),
  stop: (name: string, force?: boolean, instanceId?: string) =>
    fetch(`${BASE}/api/apps/${name}/stop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force, instanceId }),
    }).then(j<AppStatus>),
  setEnvironment: (name: string, environment: string) =>
    fetch(`${BASE}/api/apps/${name}/environment`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    }).then(j<AppStatus>),
  getFavorites: () => fetch(`${BASE}/api/favorites`).then(j<{ favorites: string[] }>),
  setFavorites: (favorites: string[]) =>
    fetch(`${BASE}/api/favorites`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites }),
    }).then(j<{ favorites: string[] }>),
  getOrder: () => fetch(`${BASE}/api/order`).then(j<{ order: string[] }>),
  setOrder: (order: string[]) =>
    fetch(`${BASE}/api/order`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }).then(j<{ order: string[] }>),
  getConfigPath: () => fetch(`${BASE}/api/config/path`).then(j<{ path: string }>),
  getGlobalConfig: () => fetch(`${BASE}/api/config/global`).then(j<GlobalConfigResponse>),
  redetect: (component?: DetectedComponentId) =>
    fetch(`${BASE}/api/config/global/detect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(component ? { component } : {}),
    }).then(j<GlobalConfigResponse>),
  resetGlobalConfig: () =>
    fetch(`${BASE}/api/config/global/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then(j<GlobalConfigResponse>),
  patchGlobalConfig: (partial: Partial<GlobalConfig>) =>
    fetch(`${BASE}/api/config/global`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    }).then(j<{ ok: boolean }>),
  reloadConfig: () =>
    fetch(`${BASE}/api/config/reload`, { method: 'POST' }).then(j<{ ok: boolean; path: string }>),
  inspectConfigImport: (folderPath: string) =>
    fetch(`${BASE}/api/config/import/inspect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    }).then(j<{ ok: boolean; appsCount: number }>),
  applyConfigImport: (folderPath: string, mode: 'merge' | 'replace') =>
    fetch(`${BASE}/api/config/import/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath, mode }),
    }).then(j<{ ok: boolean }>),
  rebuildServer: () =>
    fetch(`${BASE}/api/dev/rebuild`, { method: 'POST' }).then(j<{ ok: boolean }>),
  restart: (name: string, instanceId?: string) =>
    fetch(`${BASE}/api/apps/${name}/restart`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instanceId }),
    }).then(j<AppStatus>),
  // focus: if a terminal is already attached, switch it to this app instead
  // of returning a command (the response then has focused: true).
  getAttachCommand: (name: string, opts?: { control?: boolean; focus?: boolean }, instanceId?: string) =>
    fetch(`${BASE}/api/apps/${name}/attach-command?${new URLSearchParams({
      ...(opts?.control ? { mode: 'control' } : {}),
      ...(opts?.focus ? { focus: '1' } : {}),
      ...(instanceId ? { instanceId } : {}),
    })}`).then(j<{ command: string; focused?: boolean }>),
  getSessions: () => fetch(`${BASE}/api/sessions`).then(j<SessionInfo[]>),
  scanProject: (path: string) =>
    fetch(`${BASE}/api/scan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then(j<{ project: ScanResult; match: { appName: string } | null; existingStartCommands: string[] }>),
  addApp: (key: string, app: AppConfig) =>
    fetch(`${BASE}/api/config/apps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, app }),
    }).then(j<{ ok: boolean; key: string }>),
  removeApp: (name: string) =>
    fetch(`${BASE}/api/config/apps/${name}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
  patchApp: (name: string, patch: { label?: string; repoPath?: string; repoUrl?: string; appUrl?: string; dependsOn?: string[]; surface?: AppSurface; icon?: string | null; groups?: string[]; plugins?: Record<string, Record<string, unknown>>; environmentFilter?: { useGlobal: boolean; filterRegex?: string } | null }) =>
    fetch(`${BASE}/api/config/apps/${name}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(j<{ ok: boolean }>),
  getPlugins: () =>
    fetch(`${BASE}/api/plugins`).then((r) =>
      jv(r, z.object({ plugins: z.array(PluginMetaSchema.extend({ activated: z.boolean(), enabled: z.boolean() })) }))
    ) as Promise<{ plugins: MarketplacePlugin[] }>,
  getPluginDescriptors: () =>
    fetch(`${BASE}/api/plugins/descriptors`).then((r) =>
      jv(r, z.record(z.string(), z.record(z.string(), PluginDescriptorSchema)))
    ) as Promise<Record<string, Record<string, PluginDescriptor>>>,
  invokePlugin: (id: string, appName: string, input: unknown) =>
    fetch(`${BASE}/api/plugins/${id}/invoke/${appName}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    }).then(j<{ result?: unknown }>),
  installPlugin: (source: string) =>
    fetch(`${BASE}/api/plugins/install`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    }).then(j<MarketplacePlugin>),
  removePlugin: (id: string) =>
    fetch(`${BASE}/api/plugins/${id}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
  setPluginActivated: (id: string, activated: boolean) =>
    fetch(`${BASE}/api/plugins/${id}/activated`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activated }) }).then(j<MarketplacePlugin>),
  setPluginEnabled: (id: string, enabled: boolean) =>
    fetch(`${BASE}/api/plugins/${id}/enabled`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }).then(j<MarketplacePlugin>),
  previewPlugin: (source: string) =>
    fetch(`${BASE}/api/plugins/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    }).then(j<PluginPreview>),
  getCatalog: () =>
    fetch(`${BASE}/api/plugins/catalog`).then((r) =>
      jv(r, z.object({ entries: z.array(CatalogEntrySchema.extend({ installed: z.boolean(), onDisk: z.boolean().optional(), folder: z.string().optional() })) }))
    ) as Promise<{ entries: CatalogEntry[] }>,
  getGitBranches: (name: string) =>
    fetch(`${BASE}/api/apps/${name}/git/branches`).then(j<GitBranchesResponse>),
  getBranchScripts: (name: string, ref: string) =>
    fetch(`${BASE}/api/apps/${name}/git/scripts?ref=${encodeURIComponent(ref)}`).then(
      j<{ ref: string; source: string; scripts: ScannedScript[]; matched: string[]; filterError?: string }>
    ),
  checkoutBranch: (name: string, branch: string) =>
    fetch(`${BASE}/api/apps/${name}/git/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    }).then(j<GitCheckoutResponse>),
  applyStash: (name: string, stashRef: string) =>
    fetch(`${BASE}/api/apps/${name}/git/stash/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stashRef }),
    }).then(j<GitCheckoutResponse>),
  dropStash: (name: string, stashRef: string) =>
    fetch(`${BASE}/api/apps/${name}/git/stash/drop`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stashRef }),
    }).then(j<{ ok: boolean; error?: string }>),
  getGroupSelections: () => fetch(`${BASE}/api/group-selections`).then(j<GroupSelections>),
  setGroupIntent: (group: string, app: string, patch: GroupAppIntent) =>
    fetch(`${BASE}/api/group-selections/${encodeURIComponent(group)}/${encodeURIComponent(app)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(j<GroupAppIntent>),
  deleteGroupIntent: (group: string, app: string) =>
    fetch(`${BASE}/api/group-selections/${encodeURIComponent(group)}/${encodeURIComponent(app)}`, {
      method: 'DELETE',
    }).then(j<{ ok: true }>),
  renameGroupSelections: (from: string, to: string) =>
    fetch(`${BASE}/api/group-selections/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    }).then(j<{ ok: true }>),
  setGroupOrder: (order: string[]) =>
    fetch(`${BASE}/api/group-order`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupOrder: order }),
    }).then(j<{ ok: boolean; groupOrder: string[] }>),
  getInstances: () => fetch(`${BASE}/api/instances`).then(j<Record<string, InstanceRecord>>),
  createInstance: (appName: string, label?: string) =>
    fetch(`${BASE}/api/instances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName, label }),
    }).then(j<InstanceRecord>),
  deleteInstance: (id: string) =>
    fetch(`${BASE}/api/instances/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).then(j<{ ok: boolean }>),
  setInstanceEnvOverride: (id: string, environment: string | null) =>
    fetch(`${BASE}/api/instances/${encodeURIComponent(id)}/env`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    }).then(j<InstanceRecord>),
}
