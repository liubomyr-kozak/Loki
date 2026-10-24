import type { Config } from '../../shared/types';

// Pure, I/O-free merge of two config objects. Semantics are a fixed user
// decision (see run RUN-2026-08-02-settings-storage-settings-drop, R6) — do
// not reinterpret:
//  - apps[key] present in both -> incoming's object wins WHOLE (no per-field
//    merge); keys only in current survive untouched.
//  - top-level arrays (groupOrder/plugins/disabledPlugins) -> union, current
//    elements first in their current order, then incoming elements not
//    already present; an empty/absent incoming array leaves current as-is.
//  - plain-object sections (global/workspace/...) -> recursive deep merge,
//    incoming wins scalar conflicts.
export function mergeConfigs(current: Config, incoming: Config, mode: 'merge' | 'replace'): Config {
  if (mode === 'replace') return incoming;

  const result: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
  const currentRec = current as unknown as Record<string, unknown>;
  const incomingRec = incoming as unknown as Record<string, unknown>;

  for (const key of Object.keys(incomingRec)) {
    const currentVal = currentRec[key];
    const incomingVal = incomingRec[key];

    if (key === 'apps') {
      result.apps = { ...(current.apps ?? {}), ...(incoming.apps ?? {}) };
      continue;
    }

    if (key === 'groupOrder' || key === 'plugins' || key === 'disabledPlugins') {
      const currentArr: string[] = Array.isArray(currentVal) ? currentVal : [];
      const incomingArr: string[] = Array.isArray(incomingVal) ? incomingVal : [];
      if (incomingArr.length === 0) {
        result[key] = currentArr;
      } else {
        const seen = new Set(currentArr);
        const merged = [...currentArr];
        for (const item of incomingArr) {
          if (!seen.has(item)) {
            seen.add(item);
            merged.push(item);
          }
        }
        result[key] = merged;
      }
      continue;
    }

    if (isPlainObject(currentVal) && isPlainObject(incomingVal)) {
      result[key] = deepMergeObjects(currentVal, incomingVal);
      continue;
    }

    // Scalar, array of non-special key, or one/both sides not a plain
    // object: incoming wins whenever it is present.
    result[key] = incomingVal;
  }

  return result as unknown as Config;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMergeObjects(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const key of Object.keys(incoming)) {
    const currentVal = current[key];
    const incomingVal = incoming[key];
    if (isPlainObject(currentVal) && isPlainObject(incomingVal)) {
      result[key] = deepMergeObjects(currentVal, incomingVal);
    } else {
      result[key] = incomingVal;
    }
  }
  return result;
}
