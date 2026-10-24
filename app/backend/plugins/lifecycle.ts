import path from 'path';
import { AppSelection, AppSurface, Config, PluginContext, PluginLifecycleInfo, Surface } from '../../shared/types';
import { getAppOps } from '../core/appOps';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { errorMessage } from '../errors';
import { listPlugins, pluginDir } from './pluginStore';
import { loadPluginModule, makeHost } from './runtime';
import { resolveEffective } from '../apps/effectiveConfig';

export function surfaceScope(surface: Surface): 'app' | 'global' {
  return surface === 'header' ? 'global' : 'app';
}

export async function runPluginLifecycle(
  config: Config,
  appName: string,
  event: PluginLifecycleInfo['event'],
  selectionOverride?: AppSelection
): Promise<void> {
  try {
    const app = config.apps[appName];
    if (!app) return;

    const registryPath = resolveStateFile(config);
    const registry = readRegistry(registryPath);
    const status = await getAppOps().getAppStatus(config, appName, registry);
    // The start-in-progress may use a not-yet-persisted selection (e.g. group
    // start with persistSelection:false) — status was computed from the
    // persisted selections file, so it can lag behind the environment this
    // call actually targets. Override it so plugin hooks see the real env.
    if (selectionOverride?.environment !== undefined) {
      status.selectedEnvironment = resolveEffective(app, selectionOverride, config).environmentKey;
    }
    const host = makeHost(config);

    const activatedPlugins = listPlugins(config).filter(p => p.activated && p.enabled);
    for (const plugin of activatedPlugins) {
      try {
        const mod = loadPluginModule(pluginDir(config, plugin.id), plugin.id);
        const fn = mod[event];
        if (typeof fn !== 'function') continue;
        const ctx: PluginContext = {
          scope: 'app',
          app,
          status,
          appSurface: app.surface as AppSurface,
          host,
        };
        await fn(ctx, { event });
      } catch (err: unknown) {
        console.warn(`[plugins] ${event} failed for "${plugin.id}" on "${appName}"`, errorMessage(err));
      }
    }
  } catch (err: unknown) {
    console.warn(`[plugins] lifecycle "${event}" failed for "${appName}"`, errorMessage(err));
  }
}
