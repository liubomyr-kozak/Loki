import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { GlobalConfigSchema } from '../../shared/schema';
import { GlobalConfig } from '../../shared/types';
import { getProviders } from '../apps/sessionProvider';
import { compileEnvFilter } from '../../shared/envFilter';
// Importing these registers every session provider (side effect), so
// `getProviders()` below has something to validate against even if this
// module is the first to touch the provider registry.
import '../apps/providers/tmuxProvider';
import '../apps/providers/detachedProvider';
import '../apps/providers/initServiceProvider';
import '../apps/providers/windowsServiceProvider';

const BASE_GLOBAL_CONFIG_KEYS: (keyof GlobalConfig)[] = [
  'packageManager',
  'defaultShell',
  'stateFile',
  'pluginCatalogUrl',
  'sessionProvider',
  'nodePath',
  'pluginsDir',
  'pluginFolders',
  'environmentFilterRegex',
];

export function getGlobalConfigKeys(): string[] {
  const keys = new Set<string>(BASE_GLOBAL_CONFIG_KEYS);
  for (const provider of getProviders()) {
    for (const setting of provider.settings ?? []) {
      if (keys.has(setting.key)) {
        throw new Error(
          `Session provider "${provider.id}" declares setting key "${setting.key}", which collides with a base global config key.`
        );
      }
      keys.add(setting.key);
    }
  }
  return Array.from(keys);
}

export function patchGlobalConfig(global: GlobalConfig, patch: Partial<GlobalConfig>): void {
  if (!patch || typeof patch !== 'object') {
    throw new Error('patch must be an object');
  }
  const allowedKeys = getGlobalConfigKeys();
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unknown global config key: ${key}`);
    }
    const value = (patch as Record<string, unknown>)[key];
    if (value === null || value === '') {
      delete (global as Record<string, unknown>)[key];
      continue;
    }
    if (key === 'pluginFolders') {
      (global as Record<string, unknown>)[key] = normalizePluginFolders(value);
      continue;
    }
    if (key === 'environmentFilterRegex' && typeof value === 'string' && value !== '') {
      const c = compileEnvFilter(value);
      if (!c.ok) throw new Error('Invalid environment filter regex: ' + c.error);
    }
    const fieldSchema = (GlobalConfigSchema.shape as Record<string, z.ZodTypeAny>)[key];
    if (fieldSchema) {
      fieldSchema.parse(value);
      if (key === 'sessionProvider') {
        const validIds = getProviders().map(p => p.id);
        if (!validIds.includes(value as string)) {
          throw new Error(`Unknown session provider: "${value}" (expected one of: ${validIds.join(', ')})`);
        }
      }
      (global as Record<string, unknown>)[key] = value;
    } else if (typeof value === 'boolean' || typeof value === 'string') {
      (global as Record<string, unknown>)[key] = value;
    } else {
      throw new Error(`${key} must be a string or boolean`);
    }
  }
}

// Every added plugins folder must be an existing folder (not a file) so a
// typo is reported when it is added, not silently skipped at load time.
function normalizePluginFolders(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error('pluginFolders must be a list of folder paths');
  }
  const out: string[] = [];
  for (const raw of value as string[]) {
    let trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed === '~' || trimmed.startsWith('~/')) trimmed = path.join(os.homedir(), trimmed.slice(1));
    if (!path.isAbsolute(trimmed)) throw new Error(`Plugin folder must be a full path: ${trimmed}`);
    const abs = path.resolve(trimmed);
    if (!fs.existsSync(abs)) throw new Error(`Plugin folder does not exist: ${abs}`);
    if (!fs.statSync(abs).isDirectory()) throw new Error(`Expected a folder, not a file: ${abs}`);
    if (!out.includes(abs)) out.push(abs);
  }
  return out;
}
