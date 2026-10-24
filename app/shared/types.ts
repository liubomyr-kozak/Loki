export type {
  AppConfig,
  WorkspaceConfig,
  AttachBehavior,
  GlobalConfig,
  Config,
  Surface,
  AppSurface,
} from './config.types';
export { APP_SURFACES } from './config.types';

export type {
  AppSelection,
  ProcessState,
  ProcessRegistry,
  StatusContext,
  AppRunState,
  AppStatus,
  ProcessConflict,
} from './runtime.types';

export type {
  ToggleDescriptor,
  ButtonDescriptor,
  ControlDescriptor,
  ControlGroupDescriptor,
  PluginDescriptor,
  PluginMeta,
  HostAPI,
  AppPluginContext,
  GlobalPluginContext,
  PluginContext,
  PluginLifecycleInfo,
  PluginModule,
  MarketplacePlugin,
  PluginState,
  ToggleState,
  TemplateContext,
} from './plugin.types';
