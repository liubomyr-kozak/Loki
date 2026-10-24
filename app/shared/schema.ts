import { z } from 'zod';
import type {
  AppConfig,
  WorkspaceConfig,
  GlobalConfig,
  Config,
  AppSurface,
  Surface,
  PluginMeta,
  ControlDescriptor,
  ControlGroupDescriptor,
  PluginDescriptor,
} from './types';
import type { EnvFilterConfig } from './envFilter';

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _assert = <_T extends true>() => {};

type AssignableTo<A, B> = A extends B ? true : false;

export const EnvFilterConfigSchema = z.object({
  useGlobal: z.boolean(),
  filterRegex: z.string().optional(),
}).passthrough();
_assert<AssignableTo<z.infer<typeof EnvFilterConfigSchema>, EnvFilterConfig>>();

export const AppSurfaceSchema = z.enum(['list', 'dock']);
_assert<Exact<z.infer<typeof AppSurfaceSchema>, AppSurface>>();

export const AppConfigSchema = z.object({
  label: z.string().min(1),
  repoPath: z.string().min(1).optional(),
  repoUrl: z.string().optional(),
  appUrl: z.string().optional(),
  startCommand: z.string().min(1).optional(),
  dependsOn: z.array(z.string()).optional(),
  environmentFilter: EnvFilterConfigSchema.optional(),
  groups: z.array(z.string().min(1)).optional(),
  plugins: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  surface: AppSurfaceSchema.optional(),
  icon: z.string().min(1).optional(),
}).passthrough();
_assert<AssignableTo<z.infer<typeof AppConfigSchema>, AppConfig>>();

export const WorkspaceConfigSchema = z.object({
  name: z.string().optional(),
  editorCommand: z.string().optional(),
}).passthrough();
_assert<AssignableTo<z.infer<typeof WorkspaceConfigSchema>, WorkspaceConfig>>();

export const GlobalConfigSchema = z.object({
  packageManager: z.string().optional(),
  defaultShell: z.string().optional(),
  sessionsDir: z.string().optional(),
  stateFile: z.string().optional(),
  pluginCatalogUrl: z.string().optional(),
  marketplaceDir: z.string().optional(),
  pluginsDir: z.string().optional(),
  pluginFolders: z.array(z.string()).optional(),
  sessionProvider: z.string().optional(),
  nodePath: z.string().optional(),
  tmuxBin: z.string().optional(),
  socketPath: z.string().optional(),
  sessionPrefix: z.string().optional(),
  attachBehavior: z.enum(['auto', 'manual']).optional(),
  restartStaleSessions: z.boolean().optional(),
  environmentFilterRegex: z.string().optional(),
}).passthrough();
_assert<AssignableTo<z.infer<typeof GlobalConfigSchema>, GlobalConfig>>();

export const ConfigSchema = z.object({
  workspace: WorkspaceConfigSchema.optional(),
  global: GlobalConfigSchema.default({}),
  apps: z.record(z.string(), AppConfigSchema),
  groupOrder: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  disabledPlugins: z.array(z.string()).optional(),
}).passthrough();
_assert<AssignableTo<z.infer<typeof ConfigSchema>, Config>>();

export const SurfaceSchema = z.enum(['list', 'menu', 'dock', 'header']);
_assert<Exact<z.infer<typeof SurfaceSchema>, Surface>>();

export const PluginMetaSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional().catch(undefined),
  enabled: z.boolean().optional().catch(undefined),
  requiresConfig: z.boolean().optional().catch(undefined),
  risk: z.string().optional().catch(undefined),
  surfaces: z.array(SurfaceSchema).min(1).optional().catch(undefined),
  source: z.string().optional().catch(undefined),
}).strip();
_assert<Exact<z.infer<typeof PluginMetaSchema>, PluginMeta>>();

export const CatalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  manifestUrl: z.string().min(1),
  description: z.string().catch(''),
  example: z.boolean().catch(false),
});

export const ControlDescriptorSchema = z.object({
  id: z.string().optional(),
  action: z.enum(['toggle', 'button']),
  surface: SurfaceSchema,
  label: z.string(),
  title: z.string().optional(),
  icon: z.string().optional(),
  visible: z.boolean(),
  checked: z.boolean().optional(),
  unmanaged: z.boolean().optional(),
  disabledHint: z.boolean().optional(),
  confirm: z.string().optional(),
});
_assert<Exact<z.infer<typeof ControlDescriptorSchema>, ControlDescriptor>>();

export const ControlGroupDescriptorSchema = z.object({
  kind: z.literal('group'),
  surface: SurfaceSchema,
  label: z.string(),
  icon: z.string().optional(),
  visible: z.boolean(),
  mode: z.enum(['buttons', 'popup']),
  items: z.array(ControlDescriptorSchema).min(1),
});
_assert<Exact<z.infer<typeof ControlGroupDescriptorSchema>, ControlGroupDescriptor>>();

export const PluginDescriptorSchema = z.union([ControlDescriptorSchema, ControlGroupDescriptorSchema]);
_assert<Exact<z.infer<typeof PluginDescriptorSchema>, PluginDescriptor>>();

export const AppConfigWriteSchema = z.object({
  label: z.string().min(1),
  repoPath: z.string().optional(),
  repoUrl: z.string().optional(),
  appUrl: z.string().optional(),
  startCommand: z.string().min(1),
  dependsOn: z.array(z.string()).optional(),
  environmentFilter: EnvFilterConfigSchema.optional(),
  groups: z.array(z.string().min(1)).optional(),
  plugins: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  surface: AppSurfaceSchema.optional(),
  icon: z.string().min(1).optional(),
}).passthrough();

