import os from 'os';
import path from 'path';

export const APP_ID = 'com.liubomyr.loki-orchestrator';
export const DEV_APP_ID = `${APP_ID}.dev`;
// Retained for legacy config migration and fixtures.
export const STATE_DIR_NAME = 'state';
export const CONFIG_FILE_NAME = 'loki-config.json';

// Source/CLI runs use a separate user profile. Packaged Tauri passes its
// production config explicitly through CONFIG_FILE. Neither depends on cwd.
export function defaultConfigFile(options: {
  platform?: NodeJS.Platform;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
} = {}): string {
  const platform = options.platform ?? process.platform;
  const home = options.homeDir ?? os.homedir();
  const env = options.env ?? process.env;
  if (platform === 'win32') {
    const root = env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(root, DEV_APP_ID, CONFIG_FILE_NAME);
  }
  const root = platform === 'darwin'
    ? path.posix.join(home, 'Library', 'Application Support')
    : env.XDG_CONFIG_HOME && path.posix.isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : path.posix.join(home, '.config');
  return path.posix.join(root, DEV_APP_ID, CONFIG_FILE_NAME);
}

export function resolveConfigFile(): string {
  return process.env.CONFIG_FILE ? path.resolve(process.env.CONFIG_FILE) : defaultConfigFile();
}

export function configFolder(configFile: string): string {
  return path.dirname(path.resolve(configFile));
}
