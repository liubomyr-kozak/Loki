import fs from 'fs';
import path from 'path';
import { Config } from '../../shared/types';
import { errorMessage } from '../errors';
import { CatalogEntrySchema } from '../../shared/schema';
import { fetchTextCapped, marketplaceDir, discoverPlugins } from './pluginStore';

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  manifestUrl: string;
  installed: boolean;
  example?: boolean;
  /** Already on disk (bundled or in a plugins folder): installing just turns it on. */
  onDisk?: boolean;
  /** Where an on-disk plugin lives, shown so people can tell folders apart. */
  folder?: string;
}

export async function fetchCatalog(config: Config): Promise<CatalogEntry[]> {
  const entries = await readCatalogFile(config);
  // Plugins found in a plugins folder have no catalog.json entry, so list
  // them too — otherwise a folder added in Settings shows nothing here.
  const installedIds = new Set(config.plugins ?? []);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const { meta, dir } of discoverPlugins(config)) {
    const existing = byId.get(meta.id);
    if (existing) {
      existing.onDisk = true;
      existing.folder = dir;
      continue;
    }
    entries.push({
      id: meta.id,
      name: meta.name,
      description: meta.description ?? '',
      manifestUrl: dir,
      installed: installedIds.has(meta.id),
      onDisk: true,
      folder: dir,
    });
  }
  return entries;
}

async function readCatalogFile(config: Config): Promise<CatalogEntry[]> {
  let catalogText: string;

  const catalogUrl = config.global?.pluginCatalogUrl;
  if (catalogUrl && /^https?:\/\//i.test(catalogUrl)) {
    try {
      catalogText = await fetchTextCapped(catalogUrl, 256 * 1024, 5000);
    } catch (err) {
      throw new Error(`failed to fetch catalog from ${catalogUrl}: ${errorMessage(err)}`);
    }
  } else if (process.env.CATALOG_FILE) {
    const catalogPath = process.env.CATALOG_FILE;
    if (!fs.existsSync(catalogPath)) {
      console.warn(`[catalog] CATALOG_FILE is set to "${catalogPath}" but the file does not exist`);
      return [];
    }
    catalogText = fs.readFileSync(catalogPath, 'utf-8');
  } else {
    // Resolve against the same marketplace directory pluginStore.ts uses
    // (respects MARKETPLACE_DIR / config.global.marketplaceDir), so the
    // catalog and the actual on-disk plugin trees never diverge.
    const catalogPath = path.join(marketplaceDir(config), 'catalog.json');
    if (!fs.existsSync(catalogPath)) {
      return [];
    }
    catalogText = fs.readFileSync(catalogPath, 'utf-8');
  }

  let catalogData: any;
  try {
    catalogData = JSON.parse(catalogText);
  } catch (err) {
    throw new Error(`invalid catalog JSON: ${errorMessage(err)}`);
  }

  if (!Array.isArray(catalogData)) {
    throw new Error('catalog must be an array');
  }

  const installedIds = new Set(config.plugins ?? []);
  const entries: CatalogEntry[] = [];

  for (const item of catalogData) {
    const result = CatalogEntrySchema.safeParse(item);
    if (!result.success) {
      console.warn('[catalog] skipping entry:', item?.id, '—', result.error.issues[0]?.message ?? result.error.message);
      continue;
    }
    const entry = result.data;
    entries.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      manifestUrl: entry.manifestUrl,
      // "installed" == the id is in config.plugins. marketplace/ on disk is
      // never mutated by install/remove — it is the single home of every
      // plugin; installing/removing only adds/drops the id here, which is
      // what moves a row between the "Installed" and "Marketplace" lists.
      installed: installedIds.has(entry.id),
      example: entry.example,
    });
  }

  return entries;
}
