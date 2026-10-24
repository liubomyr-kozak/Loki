import fs from 'fs';
import path from 'path';
import { AppConfig, GlobalConfig } from '../../shared/types';

// Shared by mutateConfigSection and mutateTopLevelArrayFile: writes to a
// unique-per-call temp path then renameSync's into place so concurrent
// writers never collide on one tmp file.
function writeJsonAtomic(absPath: string, json: unknown): void {
  const tmpPath = `${absPath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(json, null, 2), 'utf-8');
  fs.renameSync(tmpPath, absPath);
}

// Per-path promise chain: serializes concurrent read->mutate->write critical
// sections against the SAME resolved config file so two overlapping mutate*
// calls (e.g. an install racing an activate) can't both read the same
// pre-mutation state and have one silently clobber the other. Single-process
// only — no cross-process locking needed.
const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(absPath: string, fn: () => T): Promise<T> {
  const prior = fileLocks.get(absPath) ?? Promise.resolve();
  const turn = prior.then(() => fn());
  // Chain the tail forward so the next caller waits for this turn too, but
  // swallow this turn's rejection in the tracked tail (not in `turn` itself)
  // so one failed mutation never wedges the queue for later callers.
  const tail = turn.then(
    () => undefined,
    () => undefined
  );
  fileLocks.set(absPath, tail);
  try {
    return await turn;
  } finally {
    if (fileLocks.get(absPath) === tail) {
      fileLocks.delete(absPath);
    }
  }
}

async function mutateConfigSection<T extends object>(
  configFile: string,
  key: string,
  fn: (section: T) => void
): Promise<void> {
  const absPath = path.resolve(configFile);
  await withFileLock(absPath, () => {
    const raw = fs.readFileSync(absPath, 'utf-8');
    const json = JSON.parse(raw);
    if (!json[key] || typeof json[key] !== 'object') {
      json[key] = {};
    }
    fn(json[key] as T);
    writeJsonAtomic(absPath, json);
  });
}

export function mutateConfigFile(configFile: string, fn: (apps: Record<string, AppConfig>) => void): Promise<void> {
  return mutateConfigSection<Record<string, AppConfig>>(configFile, 'apps', fn);
}

export function mutateGlobalConfigFile(configFile: string, fn: (global: GlobalConfig) => void): Promise<void> {
  return mutateConfigSection<GlobalConfig>(configFile, 'global', fn);
}

// Array-shaped sibling of mutateConfigSection: groupOrder lives at the top level as an
// array, not an object, so it can't reuse the object-init/merge logic above. Writes via a
// unique-per-call temp path + renameSync so concurrent writers never collide on one tmp file.
export function mutateGroupOrderFile(
  configFile: string,
  fn: (order: string[]) => string[] | void
): Promise<void> {
  return mutateTopLevelArrayFile(configFile, 'groupOrder', fn);
}

// plugins is the other top-level array (activated marketplace plugin ids) — same
// shape/concurrency concerns as groupOrder, so it shares the same writer.
export function mutatePluginsFile(
  configFile: string,
  fn: (plugins: string[]) => string[] | void
): Promise<void> {
  return mutateTopLevelArrayFile(configFile, 'plugins', fn);
}

// disabledPlugins is a third top-level array (installed plugin ids toggled
// off) — same shape/concurrency concerns as plugins/groupOrder.
export function mutateDisabledPluginsFile(
  configFile: string,
  fn: (disabledPlugins: string[]) => string[] | void
): Promise<void> {
  return mutateTopLevelArrayFile(configFile, 'disabledPlugins', fn);
}

// Whole-file writer: unlike mutateConfigSection/mutateTopLevelArrayFile,
// which each own exactly one section, this replaces the parsed JSON object
// wholesale — needed for Merge/Replace, which can touch apps/global/
// groupOrder/plugins/disabledPlugins in a single write. Reuses the same
// withFileLock/writeJsonAtomic primitives (private to this module) so it
// serializes against the other mutate* calls on the same resolved path.
export async function mutateWholeConfigFile(
  configFile: string,
  fn: (json: Record<string, unknown>) => object
): Promise<void> {
  const absPath = path.resolve(configFile);
  await withFileLock(absPath, () => {
    const raw = fs.readFileSync(absPath, 'utf-8');
    const json = JSON.parse(raw);
    const next = fn(json);
    writeJsonAtomic(absPath, next);
  });
}

async function mutateTopLevelArrayFile(
  configFile: string,
  key: string,
  fn: (arr: string[]) => string[] | void
): Promise<void> {
  const absPath = path.resolve(configFile);
  await withFileLock(absPath, () => {
    const raw = fs.readFileSync(absPath, 'utf-8');
    const json = JSON.parse(raw);
    const current: string[] = Array.isArray(json[key]) ? json[key] : [];
    const result = fn(current);
    json[key] = result !== undefined ? result : current;
    writeJsonAtomic(absPath, json);
  });
}
