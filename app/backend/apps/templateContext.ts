import { Config, TemplateContext } from '../../shared/types';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { getGitInfo } from '../git/gitUtils';
import { readSelections } from '../process/selections';
import { resolveEffective, getSelectionsPath } from './effectiveConfig';

export async function resolveEffectiveForApp(config: Config, appName: string): Promise<TemplateContext> {
  const app = config.apps[appName];
  if (!app) throw new Error(`unknown app: ${appName}`);

  const persistedSelection = readSelections(getSelectionsPath(config))[appName];
  const eff = resolveEffective(app, persistedSelection, config);

  const registryPath = resolveStateFile(config);
  const registry = readRegistry(registryPath);
  const regEntry = registry[appName];

  let branch: string | undefined;
  try {
    if (eff.repoPath) {
      const info = await getGitInfo(eff.repoPath);
      branch = info.branch;
    }
  } catch {
  }

  return {
    name: appName,
    port: regEntry?.port ?? eff.port,
    environment: eff.environmentKey,
    branch,
    appUrl: eff.appUrl,
    repoPath: eff.repoPath,
  };
}
