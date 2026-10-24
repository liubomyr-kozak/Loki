import { Config } from '../../shared/types';
import { jsonSidecarStore } from '../config/jsonStore';

export type StashRecord = { stashRef: string; tag: string; createdAt: string };

export type StashMap = Record<string, Record<string, StashRecord>>;

const store = (config: Config) =>
  jsonSidecarStore<StashMap>(config, {
    filename: 'git-stashes.json',
    fallback: () => ({}),
    coerce: (raw, fb) => (raw && typeof raw === 'object' ? (raw as StashMap) : fb),
  });

export function readStashMap(config: Config): StashMap {
  return store(config).read();
}

function writeStashMap(config: Config, map: StashMap): void {
  store(config).write(map);
}

export function writeStashRecord(config: Config, repoPath: string, branch: string, record: StashRecord): void {
  const map = readStashMap(config);
  const forRepo = map[repoPath] ?? {};
  forRepo[branch] = record;
  map[repoPath] = forRepo;
  writeStashMap(config, map);
}

export function removeStashRecord(config: Config, repoPath: string, branch: string): void {
  const map = readStashMap(config);
  const forRepo = map[repoPath];
  if (!forRepo || !(branch in forRepo)) return;
  delete forRepo[branch];
  if (Object.keys(forRepo).length === 0) {
    delete map[repoPath];
  } else {
    map[repoPath] = forRepo;
  }
  writeStashMap(config, map);
}

export function hasStashForBranch(config: Config, repoPath: string, branch: string): boolean {
  const map = readStashMap(config);
  return Boolean(map[repoPath]?.[branch]);
}

import { listStash } from './gitUtils';

export async function reconcileStashMap(config: Config, repoPath: string): Promise<void> {
  const map = readStashMap(config);
  const forRepo = map[repoPath];
  if (!forRepo) return;

  const liveStashes = await listStash(repoPath);
  const liveRefs = new Set(liveStashes.map(s => s.ref));
  const liveTagsByMessage = liveStashes.map(s => s.message);

  let changed = false;
  for (const branch of Object.keys(forRepo)) {
    const record = forRepo[branch];
    const stillExists =
      liveRefs.has(record.stashRef) || liveTagsByMessage.some(msg => msg.includes(record.tag));
    if (!stillExists) {
      delete forRepo[branch];
      changed = true;
    }
  }

  if (!changed) return;
  if (Object.keys(forRepo).length === 0) {
    delete map[repoPath];
  } else {
    map[repoPath] = forRepo;
  }
  writeStashMap(config, map);
}
