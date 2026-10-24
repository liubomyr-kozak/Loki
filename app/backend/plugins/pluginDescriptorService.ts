import path from 'path';
import { getAppOps } from '../core/appOps';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { loadPluginModule, makeHost } from './runtime';
import { listPlugins, pluginDir } from './pluginStore';
import { surfaceScope } from './lifecycle';
import { ControlDescriptorSchema, ControlGroupDescriptorSchema } from '../../shared/schema';
import { Config, PluginDescriptor, Surface, AppStatus, AppSurface, PluginContext, MarketplacePlugin } from '../../shared/types';

/** Shared by the solo and group branches of assertValidDescriptor: manifest-declared surface + scope match. */
function checkSurfaceDeclaredAndScope(
  surface: Surface,
  plugin: MarketplacePlugin,
  scope: PluginContext['scope']
): void {
  if (plugin.surfaces && plugin.surfaces.length > 0 && !plugin.surfaces.includes(surface)) {
    throw new Error(
      `plugin "${plugin.id}" returned surface "${surface}", not declared in its manifest surfaces (${plugin.surfaces.join(', ')})`
    );
  }
  if (surfaceScope(surface) !== scope) {
    throw new Error(
      `plugin "${plugin.id}" returned surface "${surface}" (${surfaceScope(surface)}-scoped) for a ${scope}-scoped call`
    );
  }
}

function assertValidDescriptor(
  descriptor: PluginDescriptor,
  plugin: MarketplacePlugin,
  scope: PluginContext['scope']
): void {
  if ('kind' in descriptor && descriptor.kind === 'group') {
    ControlGroupDescriptorSchema.parse(descriptor);
    checkSurfaceDeclaredAndScope(descriptor.surface, plugin, scope);
    for (const item of descriptor.items) {
      ControlDescriptorSchema.parse(item);
      if (item.surface !== descriptor.surface) {
        throw new Error(
          `plugin "${plugin.id}" group item surface "${item.surface}" must match group surface "${descriptor.surface}"`
        );
      }
      if (item.surface === 'dock' && !item.icon) {
        throw new Error(`plugin "${plugin.id}" returned surface "dock" without an icon`);
      }
    }
    return;
  }
  ControlDescriptorSchema.parse(descriptor);
  checkSurfaceDeclaredAndScope(descriptor.surface, plugin, scope);
  if (descriptor.surface === 'dock' && !descriptor.icon) {
    throw new Error(`plugin "${plugin.id}" returned surface "dock" without an icon`);
  }
}

export async function buildDescriptors(config: Config): Promise<Record<string, Record<string, PluginDescriptor>>> {
  const registry = readRegistry(resolveStateFile(config));
  const appNames = Object.keys(config.apps);

  const ctx = getAppOps().makeStatusContext(config);
  const statusMap: Record<string, AppStatus> = {};
  for (const name of appNames) {
    statusMap[name] = await getAppOps().getAppStatus(config, name, registry, ctx);
  }

  const host = makeHost(config);
  const result: Record<string, Record<string, PluginDescriptor>> = {};
  for (const name of appNames) result[name] = {};
  result.__global = {};

  const activatedPlugins = listPlugins(config).filter(p => p.activated && p.enabled);
  for (const plugin of activatedPlugins) {
    let mod;
    try {
      mod = loadPluginModule(pluginDir(config, plugin.id), plugin.id);
    } catch (err: unknown) {
      console.error(`[plugins] failed to load "${plugin.id}"`, err);
      continue;
    }

    const declaresScope = (scope: PluginContext['scope']) =>
      plugin.surfaces?.length
        ? plugin.surfaces.some(s => surfaceScope(s) === scope)
        : scope === 'app';

    if (declaresScope('app')) {
      const requiresConfig = plugin.requiresConfig !== false;
      for (const name of appNames) {
        if (requiresConfig && !config.apps[name].plugins?.[plugin.id]) continue;
        try {
          const ctx: PluginContext = {
            scope: 'app',
            app: config.apps[name],
            status: statusMap[name],
            appSurface: config.apps[name].surface as AppSurface,
            host,
          };
          const descriptor = mod.describe(ctx);
          assertValidDescriptor(descriptor, plugin, 'app');
          result[name][plugin.id] = descriptor;
        } catch (err: unknown) {
          console.error(`[plugins] describe failed for "${plugin.id}" on "${name}"`, err);
        }
      }
    }

    if (!declaresScope('global')) continue;

    try {
      const ctx: PluginContext = { scope: 'global', host };
      const descriptor = mod.describe(ctx);
      assertValidDescriptor(descriptor, plugin, 'global');
      result.__global[plugin.id] = descriptor;
    } catch (err: unknown) {
      console.error(`[plugins] describe failed for "${plugin.id}" on "__global"`, err);
    }
  }

  return result;
}
