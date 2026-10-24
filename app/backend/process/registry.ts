import { ProcessRegistry, ProcessState } from '../../shared/types';
import { jsonPathStore } from '../config/jsonStore';

const store = (stateFile: string) =>
  jsonPathStore<ProcessRegistry>(stateFile, { fallback: () => ({}), label: 'registry' });

export function readRegistry(stateFile: string): ProcessRegistry {
  return store(stateFile).read();
}

export function writeRegistry(stateFile: string, registry: ProcessRegistry): void {
  store(stateFile).write(registry);
}

export function updateProcessState(
  stateFile: string,
  appName: string,
  state: ProcessState | null
): void {
  const reg = readRegistry(stateFile);
  if (state == null) {
    delete reg[appName];
  } else {
    reg[appName] = state;
  }
  writeRegistry(stateFile, reg);
}
