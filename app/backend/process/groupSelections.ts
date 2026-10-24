import path from 'path';
import { jsonPathStore } from '../config/jsonStore';
import { sidecarPath } from '../config/statePaths';
import { Config } from '../../shared/types';

import type { GroupAppIntent, GroupSelections } from '../../shared/groupSelections.types';
export type { GroupAppIntent, GroupSelections } from '../../shared/groupSelections.types';

export function getGroupSelectionsPath(config: Config): string {
  return sidecarPath(config, 'groupSelections.json');
}

const store = (file: string) =>
  jsonPathStore<GroupSelections>(file, {
    fallback: () => ({}),
    label: 'groupSelections',
    coerce: (raw) => {
      const result: GroupSelections = {};
      for (const [group, apps] of Object.entries(raw as Record<string, any>)) {
        if (!apps || typeof apps !== 'object') continue;
        const appMap: Record<string, GroupAppIntent> = {};
        for (const [appName, intent] of Object.entries(apps as Record<string, any>)) {
          if (intent && typeof intent === 'object') {
            appMap[appName] = intent as GroupAppIntent;
          }
        }
        result[group] = appMap;
      }
      return result;
    },
  });

export function readGroupSelections(file: string): GroupSelections {
  return store(file).read();
}

export function writeGroupIntent(
  file: string,
  group: string,
  app: string,
  patch: GroupAppIntent
): GroupAppIntent {
  const abs = path.resolve(file);
  const selections = readGroupSelections(abs);
  const groupMap = selections[group] ?? {};
  const existing = groupMap[app] ?? {};
  const merged: GroupAppIntent = { ...existing, ...patch };
  groupMap[app] = merged;
  selections[group] = groupMap;
  store(abs).write(selections);
  return merged;
}

export function deleteGroupIntent(file: string, group: string, app: string): void {
  const abs = path.resolve(file);
  const selections = readGroupSelections(abs);
  const groupMap = selections[group];
  if (!groupMap) return;
  delete groupMap[app];
  if (Object.keys(groupMap).length === 0) {
    delete selections[group];
  } else {
    selections[group] = groupMap;
  }
  store(abs).write(selections);
}

export function renameGroup(file: string, from: string, to: string): void {
  const abs = path.resolve(file);
  const selections = readGroupSelections(abs);
  const fromMap = selections[from];
  if (!fromMap) return;
  const toMap = selections[to] ?? {};
  const merged: Record<string, GroupAppIntent> = { ...fromMap, ...toMap };
  delete selections[from];
  selections[to] = merged;
  store(abs).write(selections);
}

export function pruneGroups(file: string, liveTags: string[]): GroupSelections {
  const abs = path.resolve(file);
  const selections = readGroupSelections(abs);
  const liveSet = new Set(liveTags);
  const pruned: GroupSelections = {};
  let changed = false;
  for (const [group, apps] of Object.entries(selections)) {
    if (liveSet.has(group)) {
      pruned[group] = apps;
    } else {
      changed = true;
    }
  }
  if (changed) {
    store(abs).write(pruned);
  }
  return pruned;
}
