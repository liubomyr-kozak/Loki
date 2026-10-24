import { Config, PluginState } from '../../shared/types';
import { jsonSidecarStore } from '../config/jsonStore';

const GLOBAL_STATE_KEY = '__global__';

function defaultPluginState(): PluginState {
  return { custom: {} };
}

const store = (config: Config) =>
  jsonSidecarStore<PluginState>(config, {
    filename: 'plugin-state.json',
    fallback: defaultPluginState,
    coerce: (raw, fb) => {
      const data = raw as any;
      if (data?.custom && typeof data.custom === 'object') {
        fb.custom = data.custom;
      }
      return fb;
    },
  });

export function readPluginState(config: Config): PluginState {
  return store(config).read();
}

export function writePluginState(config: Config, patch: Partial<PluginState>): PluginState {
  const existing = readPluginState(config);
  const merged: PluginState = {
    custom: { ...existing.custom, ...patch.custom }
  };
  return store(config).write(merged);
}

export function readState(config: Config, pluginId: string, appName?: string): unknown {
  const state = readPluginState(config);
  const key = appName ?? GLOBAL_STATE_KEY;
  return state.custom[pluginId]?.[key];
}

export function writeState(config: Config, pluginId: string, value: unknown, appName?: string): void {
  const state = readPluginState(config);
  const key = appName ?? GLOBAL_STATE_KEY;
  const scope = { ...(state.custom[pluginId] ?? {}), [key]: value };
  writePluginState(config, { custom: { ...state.custom, [pluginId]: scope } });
}
