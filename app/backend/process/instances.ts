import path from 'path';
import crypto from 'crypto';
import { jsonPathStore } from '../config/jsonStore';
import { sidecarPath } from '../config/statePaths';
import { Config } from '../../shared/types';

import type { InstanceRecord, Instances } from '../../shared/instances.types';
export type { InstanceRecord, Instances } from '../../shared/instances.types';

export function getInstancesPath(config: Config): string {
  return sidecarPath(config, 'instances.json');
}

const store = (file: string) =>
  jsonPathStore<Instances>(file, {
    fallback: () => ({}),
    label: 'instances',
    coerce: (raw) => {
      const result: Instances = {};
      for (const [id, record] of Object.entries(raw as Record<string, any>)) {
        if (record && typeof record === 'object' && typeof record.appName === 'string') {
          result[id] = record as InstanceRecord;
        }
      }
      return result;
    },
  });

export function readInstances(file: string): Instances {
  return store(file).read();
}

export function createInstance(file: string, appName: string, label?: string): InstanceRecord {
  const abs = path.resolve(file);
  const instances = readInstances(abs);
  const record: InstanceRecord = {
    id: crypto.randomUUID(),
    appName,
    ...(label !== undefined ? { label } : {}),
    createdAt: new Date().toISOString(),
  };
  instances[record.id] = record;
  store(abs).write(instances);
  return record;
}

export function setInstanceEnvOverride(
  file: string,
  id: string,
  envOverride: string | null
): InstanceRecord | undefined {
  const abs = path.resolve(file);
  const instances = readInstances(abs);
  const record = instances[id];
  if (!record) return undefined;
  if (envOverride === null) {
    delete record.envOverride;
  } else {
    record.envOverride = envOverride;
  }
  store(abs).write(instances);
  return record;
}

export function deleteInstance(file: string, id: string): void {
  const abs = path.resolve(file);
  const instances = readInstances(abs);
  delete instances[id];
  store(abs).write(instances);
}

export function removeAppInstances(file: string, appName: string): Instances {
  const abs = path.resolve(file);
  const instances = readInstances(abs);
  let changed = false;
  for (const [id, record] of Object.entries(instances)) {
    if (record.appName === appName) {
      delete instances[id];
      changed = true;
    }
  }
  if (changed) {
    store(abs).write(instances);
  }
  return instances;
}
