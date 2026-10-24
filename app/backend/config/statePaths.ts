import path from 'path';
import { Config } from '../../shared/types';
import { configFolder, resolveConfigFile } from './configLocation';

// Only used when no config has been loaded yet; a loaded config always carries
// an absolute stateFile (loadConfig resolves it against the config's folder).
export const DEFAULT_STATE_FILE = path.join(configFolder(resolveConfigFile()), 'state.json');

export function resolveStateFile(config: Config): string {
  return config.global?.stateFile ?? DEFAULT_STATE_FILE;
}

export function sidecarPath(config: Config, name: string): string {
  return path.join(path.dirname(resolveStateFile(config)), name);
}
