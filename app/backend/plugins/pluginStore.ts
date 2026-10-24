import fs from 'fs';
import { checkoutRoot } from '../config/checkoutRoot';
import os from 'os';
import path from 'path';
import { Config, MarketplacePlugin, PluginMeta } from '../../shared/types';
import { extractZipTo } from './unzip';
import { errorMessage } from '../errors';
import { PluginMetaSchema } from '../../shared/schema';
import { getConfigFile, reloadConfig } from '../config/configState';
import { configFolder } from '../config/configLocation';
import { mutatePluginsFile, mutateDisabledPluginsFile } from '../config/configStore';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const MAX_REMOTE_PACKAGE_SIZE = 10 * 1024 * 1024;
const REMOTE_FETCH_TIMEOUT_MS = 5000;

export function marketplaceDir(config: Config): string {
  return path.resolve(process.env.MARKETPLACE_DIR || config.global?.marketplaceDir || path.join(checkoutRoot() ?? __dirname, 'marketplace'));
}

/**
 * The user's plugin folders (Settings → Storage → Plugins folders,
 * `global.pluginFolders`). Unset means one folder, "plugins" next to the
 * config. Unlike marketplaceDir (inside the app bundle in a packaged build,
 * so read-only) these are the user's: the first one receives installs.
 */
export function userPluginFolders(config: Config): string[] {
  const base = configFolder(getConfigFile());
  const configured = (config.global?.pluginFolders ?? []).filter((f) => typeof f === 'string' && f.trim() !== '');
  const folders = configured.length > 0
    ? configured.map((f) => path.resolve(base, f))
    : [path.resolve(base, config.global?.pluginsDir || 'plugins')];
  return folders.filter((f, i) => folders.indexOf(f) === i);
}

/** Where installs are copied: the first plugins folder, created on demand. */
export function userPluginsDir(config: Config): string {
  const dir = userPluginFolders(config)[0];
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* read-only location: scanning still works */ }
  return dir;
}

/** Folders scanned for plugins, highest priority first. */
export function pluginRoots(config: Config): string[] {
  const roots = [userPluginsDir(config), ...userPluginFolders(config), marketplaceDir(config)];
  return roots.filter((r, i) => roots.indexOf(r) === i);
}

export interface DiscoveredPlugin {
  meta: PluginMeta;
  /** The plugin's own folder (holds manifest.json). */
  dir: string;
}

function readPluginFolder(dir: string, expectedId?: string): DiscoveredPlugin | null {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const meta = validatePluginMeta(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
    // The on-disk path is derived from `id` elsewhere (resolveDestDir), so a
    // directory whose name doesn't match its own manifest id would resolve
    // to the wrong path there. Fail loudly here instead of letting it
    // surface later as a misleading "no index.ts".
    if (expectedId !== undefined && expectedId !== meta.id) {
      console.warn(`[plugins] skipping "${dir}": directory name does not match manifest id "${meta.id}"`);
      return null;
    }
    return { meta, dir };
  } catch (err: unknown) {
    console.warn('[plugins] skipping', dir, errorMessage(err));
    return null;
  }
}

/**
 * Every plugin on disk, first root wins on duplicate ids. A root is either a
 * folder of plugin folders, or (for an added folder) a single plugin folder
 * with its own manifest.json — people pick either, so accept both.
 */
export function discoverPlugins(config: Config): DiscoveredPlugin[] {
  const found: DiscoveredPlugin[] = [];
  const seen = new Set<string>();
  const add = (p: DiscoveredPlugin | null) => {
    if (!p || seen.has(p.meta.id)) return;
    seen.add(p.meta.id);
    found.push(p);
  };
  for (const root of pluginRoots(config)) {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    if (fs.existsSync(path.join(root, 'manifest.json'))) {
      add(readPluginFolder(root));
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      add(readPluginFolder(path.join(root, entry.name), entry.name));
    }
  }
  return found;
}

/** Folder holding plugin `id`, from whichever root has it (user folder wins). */
export function pluginDir(config: Config, id: string): string {
  assertPluginId(id);
  const hit = discoverPlugins(config).find((p) => p.meta.id === id);
  return hit ? hit.dir : path.join(marketplaceDir(config), id);
}

function assertPluginId(id: string): void {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new Error(`invalid plugin id "${id}"`);
  }
}

function validatePluginMeta(obj: any): PluginMeta {
  return PluginMetaSchema.parse(obj);
}

export function listPlugins(config: Config): MarketplacePlugin[] {
  const activatedIds = new Set(config.plugins ?? []);
  const disabledIds = new Set(config.disabledPlugins ?? []);
  return discoverPlugins(config).map(({ meta }) => ({
    ...meta,
    activated: activatedIds.has(meta.id),
    enabled: !disabledIds.has(meta.id),
  }));
}

function resolveDestDir(config: Config, id: string): string {
  assertPluginId(id);
  const base = userPluginsDir(config);
  const dest = path.resolve(base, id);
  if (dest !== base && !dest.startsWith(base + path.sep)) {
    throw new Error(`invalid plugin id "${id}"`);
  }
  return dest;
}

async function readBodyCapped(res: Response, maxBytes: number, tooLargeMessage: string): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(tooLargeMessage);
    }
    return buf;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(tooLargeMessage);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try { await reader.cancel(); } catch { }
  }
  return Buffer.concat(chunks);
}

export async function fetchTextCapped(url: string, maxBytes: number, timeoutMs: number): Promise<string> {
  if (typeof fetch !== 'function') {
    throw new Error('fetch unavailable — Node 18+ required');
  }
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`failed to fetch manifest: ${res.status} ${res.statusText}`);
  }
  const buf = await readBodyCapped(res, maxBytes, 'manifest too large');
  return buf.toString('utf-8');
}

async function fetchBytesCapped(url: string, maxBytes: number, timeoutMs: number): Promise<Buffer> {
  if (typeof fetch !== 'function') {
    throw new Error('fetch unavailable — Node 18+ required');
  }
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`failed to download plugin package: ${res.status} ${res.statusText}`);
  }
  return readBodyCapped(res, maxBytes, 'plugin package too large');
}

function extractZip(zipPath: string): string {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-plugin-'));
  extractZipTo(zipPath, dest);
  return dest;
}

function findManifestDir(root: string): string {
  if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
  const entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());
  if (entries.length === 1) {
    const nested = path.join(root, entries[0].name);
    if (fs.existsSync(path.join(nested, 'manifest.json'))) return nested;
  }
  throw new Error('manifest.json not found in plugin package');
}

async function stagePluginSource(source: string): Promise<{ dir: string; cleanup?: () => void }> {
  if (/^https?:\/\//i.test(source)) {
    const buf = await fetchBytesCapped(source, MAX_REMOTE_PACKAGE_SIZE, REMOTE_FETCH_TIMEOUT_MS);
    const tempZip = path.join(os.tmpdir(), `mfe-plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`);
    fs.writeFileSync(tempZip, buf);
    try {
      const dir = extractZip(tempZip);
      return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
    } finally {
      fs.rmSync(tempZip, { force: true });
    }
  }

  if (source.toLowerCase().endsWith('.zip')) {
    const abs = path.resolve(source);
    if (!fs.existsSync(abs)) {
      throw new Error(`plugin package not found: ${source}`);
    }
    const dir = extractZip(abs);
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  const abs = path.resolve(source);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`plugin source not found or not a directory: ${source}`);
  }
  return { dir: abs };
}

export async function previewPlugin(source: string): Promise<PluginMeta> {
  const { dir: stagedDir, cleanup } = await stagePluginSource(source);
  try {
    const manifestDir = findManifestDir(stagedDir);
    const rawObj = JSON.parse(fs.readFileSync(path.join(manifestDir, 'manifest.json'), 'utf-8'));
    return validatePluginMeta(rawObj);
  } finally {
    cleanup?.();
  }
}

async function activatePlugin(id: string): Promise<Config> {
  await mutatePluginsFile(getConfigFile(), (plugins) => {
    if (plugins.includes(id)) return;
    return [...plugins, id];
  });
  return reloadConfig();
}

export async function installPlugin(config: Config, { source }: { source: string }): Promise<MarketplacePlugin> {
  const { dir: stagedDir, cleanup } = await stagePluginSource(source);
  try {
    const manifestDir = findManifestDir(stagedDir);
    const rawObj = JSON.parse(fs.readFileSync(path.join(manifestDir, 'manifest.json'), 'utf-8'));
    const meta = validatePluginMeta(rawObj);

    const existing = pluginDir(config, meta.id);
    const dest = fs.existsSync(path.join(existing, 'manifest.json')) ? existing : resolveDestDir(config, meta.id);
    // If this id's own destination already exists on disk (e.g. previously
    // installed then deactivated, or the staged source already lives inside
    // the marketplace under its own id), there's nothing to copy — just
    // (re)activate it. Keying this on the resolved id's actual dest, rather
    // than on where the staged source happens to sit, avoids both skipping a
    // needed copy for a mismatched source/id pair and destructively
    // re-copying over an already-present plugin.
    const alreadyOnDisk = fs.existsSync(dest);

    let finalMeta = meta;
    if (!alreadyOnDisk) {
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(manifestDir, dest, { recursive: true });

      const destManifestPath = path.join(dest, 'manifest.json');
      const destRawObj = JSON.parse(fs.readFileSync(destManifestPath, 'utf-8'));
      destRawObj.source = source;
      fs.writeFileSync(destManifestPath, JSON.stringify(destRawObj, null, 2), 'utf-8');
      finalMeta = validatePluginMeta(destRawObj);
    }

    const updated = await activatePlugin(meta.id);
    return {
      ...finalMeta,
      activated: (updated.plugins ?? []).includes(meta.id),
      enabled: !(updated.disabledPlugins ?? []).includes(meta.id),
    };
  } finally {
    cleanup?.();
  }
}

export async function setPluginActivated(config: Config, id: string, activated: boolean): Promise<MarketplacePlugin> {
  const dest = pluginDir(config, id);
  const manifestPath = path.join(dest, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`plugin not found: ${id}`);
  }
  const meta = validatePluginMeta(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
  await mutatePluginsFile(getConfigFile(), (plugins) => {
    const has = plugins.includes(id);
    if (activated && !has) return [...plugins, id];
    if (!activated && has) return plugins.filter((p) => p !== id);
  });
  if (!activated) {
    // Drop any stale disabled flag with it — otherwise re-installing later
    // would silently bring the plugin back switched off.
    await mutateDisabledPluginsFile(getConfigFile(), (disabled) =>
      disabled.includes(id) ? disabled.filter((p) => p !== id) : undefined
    );
  }
  const updated = reloadConfig();
  return { ...meta, activated, enabled: !(updated.disabledPlugins ?? []).includes(id) };
}

export async function setPluginEnabled(config: Config, id: string, enabled: boolean): Promise<MarketplacePlugin> {
  const dest = pluginDir(config, id);
  const manifestPath = path.join(dest, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`plugin not found: ${id}`);
  }
  const meta = validatePluginMeta(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
  await mutateDisabledPluginsFile(getConfigFile(), (disabledPlugins) => {
    const has = disabledPlugins.includes(id);
    if (!enabled && !has) return [...disabledPlugins, id];
    if (enabled && has) return disabledPlugins.filter((p) => p !== id);
  });
  const updated = reloadConfig();
  return { ...meta, activated: (updated.plugins ?? []).includes(id), enabled };
}
