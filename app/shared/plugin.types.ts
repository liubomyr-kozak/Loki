import type { Config, AppConfig, Surface, AppSurface } from './config.types';
import type { AppStatus, AppSelection } from './runtime.types';

interface ControlDescriptorBase {
  /** Stable id for a group item (e.g. 'fetch'|'pull'|'push'|'stash-push'); used as React key and as `input.action`. Solo descriptors leave this unset. */
  id?: string;
  surface: Surface;
  label: string;
  title?: string;
  icon?: string;
  visible: boolean;
  disabledHint?: boolean;
  confirm?: string;
}
export interface ToggleDescriptor extends ControlDescriptorBase {
  action: 'toggle';
  checked?: boolean;
  unmanaged?: boolean;
}
export interface ButtonDescriptor extends ControlDescriptorBase {
  action: 'button';
  confirm?: string;
}
export type ControlDescriptor = ToggleDescriptor | ButtonDescriptor;

export interface ControlGroupDescriptor {
  kind: 'group';
  surface: Surface;
  label: string;                 // popup trigger / dock fallback tooltip
  icon?: string;
  visible: boolean;
  mode: 'buttons' | 'popup';     // only meaningful when surface==='list'
  items: ControlDescriptor[];    // item.surface MUST equal group.surface
}
export type PluginDescriptor = ControlDescriptor | ControlGroupDescriptor;

export interface PluginMeta {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled?: boolean;
  requiresConfig?: boolean;
  risk?: string;
  surfaces?: Surface[];
  /** Provenance: original install source (remote URL, zip, or external dir), stamped on copy into the marketplace. Absent for plugins authored directly in marketplace/. */
  source?: string;
}

export interface HostAPI {
  config: {
    read(): Config;
  };
  apps: {
    start(appName: string, sel?: AppSelection): Promise<void>;
    stop(appName: string): Promise<void>;
    restart(appName: string): Promise<void>;
    status(appName: string): Promise<AppStatus>;
  };
  runProcess(command: string, opts?: { cwd?: string; window?: string }): Promise<void>;
  openUrl(url: string): Promise<void>;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  readState(pluginId: string, appName?: string): unknown;
  writeState(pluginId: string, value: unknown, appName?: string): void;
  template(tpl: string, ctx: TemplateContext): string;
}

interface PluginContextBase {
  host: HostAPI;
}
export interface AppPluginContext extends PluginContextBase {
  scope: 'app';
  app: AppConfig;
  status: AppStatus;
  appSurface: AppSurface;
}
export interface GlobalPluginContext extends PluginContextBase {
  scope: 'global';
  app?: undefined;
  status?: undefined;
  appSurface?: undefined;
}
export type PluginContext = AppPluginContext | GlobalPluginContext;

export interface PluginLifecycleInfo {
  event: 'onStart' | 'onStop';
}

export interface PluginModule {
  describe(ctx: PluginContext): PluginDescriptor;
  invoke(
    ctx: PluginContext,
    input: Record<string, unknown>
  ): void | unknown | Promise<void | unknown>;
  onStart?(ctx: PluginContext, info?: PluginLifecycleInfo): Promise<void> | void;
  onStop?(ctx: PluginContext, info?: PluginLifecycleInfo): Promise<void> | void;
}

export type MarketplacePlugin = PluginMeta & { activated: boolean; enabled: boolean };

export interface PluginState {
  custom: { [pluginId: string]: { [appName: string]: unknown } };
}

export type ToggleState = 'on' | 'off';

export interface TemplateContext {
  name: string;
  port?: number;
  environment?: string;
  branch?: string;
  appUrl?: string;
  repoPath?: string;
  toggleState?: ToggleState;
}
