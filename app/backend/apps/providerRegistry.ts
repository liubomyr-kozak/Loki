import { Config } from '../../shared/types';
import { readRegistry } from '../process/registry';
import { resolveStateFile, DEFAULT_STATE_FILE } from '../config/statePaths';
import { configure as configureTmux } from './providers/tmuxProvider';
import { configure as configureDetached } from './providers/detachedProvider';
import { resolveSessionsDir } from '../config/scan';
import { resolveConfigFile } from '../config/configLocation';

function currentConfigFilePath(): string {
  return resolveConfigFile();
}

export function primeProviders(config?: Config | null): void {
  configureTmux({
    tmuxBin: config?.global?.tmuxBin,
    socketPath: config?.global?.socketPath,
    sessionPrefix: config?.global?.sessionPrefix,
  });
  configureDetached({
    sessionsDir: resolveSessionsDir(currentConfigFilePath(), config?.global?.sessionsDir),
    resolvePid: (name: string) => {
      try {
        const registryPath = config ? resolveStateFile(config) : DEFAULT_STATE_FILE;
        return readRegistry(registryPath)[name]?.pid;
      } catch {
        return undefined;
      }
    },
  });
}
