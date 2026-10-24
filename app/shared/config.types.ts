import type { EnvFilterConfig } from './envFilter';

export interface AppConfig {
  label: string;
  repoPath?: string;
  repoUrl?: string;
  appUrl?: string;
  startCommand?: string;
  dependsOn?: string[];
  environmentFilter?: EnvFilterConfig;
  groups?: string[];
  plugins?: Record<string, Record<string, unknown>>;
  surface?: AppSurface;
  /**
   * Do not write a shared "resolve icon" helper across the two concepts.
   */
  icon?: string;
}

export interface WorkspaceConfig {
  name?: string;
  editorCommand?: string;
}

export type AttachBehavior = 'auto' | 'manual';

export interface GlobalConfig {
  packageManager?: string;
  defaultShell?: string;
  /** Where a detached app's stdout/stderr session output is written. */
  sessionsDir?: string;
  stateFile?: string;
  pluginCatalogUrl?: string;
  /** Override for the marketplace directory (default: repo-root "marketplace"). */
  marketplaceDir?: string;
  /** Legacy single plugins folder; used only when pluginFolders is unset. */
  pluginsDir?: string;
  /**
   * Plugin folders (Settings → Storage → Plugins folders), loaded on top of
   * the built-in plugins. Each is a folder of plugin folders, or a single
   * plugin folder with its own manifest.json. The first one receives
   * installs. Default: ["plugins"] next to the config.
   */
  pluginFolders?: string[];
  sessionProvider?: string;
  nodePath?: string;
  tmuxBin?: string;
  socketPath?: string;
  sessionPrefix?: string;
  attachBehavior?: AttachBehavior;
  restartStaleSessions?: boolean;
  environmentFilterRegex?: string;
}

export interface Config {
  workspace?: WorkspaceConfig;
  global?: GlobalConfig;
  apps: { [key: string]: AppConfig };
  groupOrder?: string[];
  /** Ids of marketplace plugins currently activated. Runtime loads only these, directly from marketplace/<id>/. */
  plugins?: string[];
  /** Ids of installed plugins that are toggled off — installed but must not run. */
  disabledPlugins?: string[];
}

export type Surface = 'list' | 'menu' | 'dock' | 'header';

export const APP_SURFACES = ['list', 'dock'] as const satisfies readonly Surface[];
export type AppSurface = typeof APP_SURFACES[number];
