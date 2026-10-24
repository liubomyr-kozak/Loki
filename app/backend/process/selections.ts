import path from 'path';
import { AppSelection } from '../../shared/types';
import { jsonPathStore } from '../config/jsonStore';

export type { AppSelection };

const store = (file: string) =>
  jsonPathStore<Record<string, AppSelection>>(file, {
    fallback: () => ({}),
    label: 'selections',
    coerce: (raw) => {
      const result: Record<string, AppSelection> = {};
      for (const [key, value] of Object.entries(raw as Record<string, any>)) {
        if (typeof value === 'string') {
          result[key] = { environment: value };
        } else if (value && typeof value === 'object') {
          result[key] = value as AppSelection;
        }
      }
      return result;
    },
  });

export function readSelections(file: string): Record<string, AppSelection> {
  return store(file).read();
}

export function writeSelection(file: string, appName: string, patch: AppSelection | null): void {
  const abs = path.resolve(file);
  const selections = readSelections(abs);
  if (patch === null) {
    delete selections[appName];
  } else {
    const existing = selections[appName] ?? {};
    const merged: AppSelection = { ...existing };
    if (patch.environment !== undefined) merged.environment = patch.environment;
    selections[appName] = merged;
  }
  store(abs).write(selections);
}
