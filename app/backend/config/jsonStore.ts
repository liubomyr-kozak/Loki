import fs from 'fs';
import path from 'path';
import { Config } from '../../shared/types';
import { sidecarPath } from './statePaths';

type ParseMode = 'default' | 'throw';

interface JsonFileIO<T> {
  read(): T;
  write(value: T): T;
  filePath(): string;
}

interface SidecarSpec<T> {
  filename: string;
  fallback: () => T;
  coerce?: (raw: unknown, fallback: T) => T;
  onParseError?: ParseMode;
}

interface PathSpec<T> {
  fallback: () => T;
  coerce?: (raw: unknown, fb: T) => T;
  onParseError?: ParseMode;
  label?: string;
}

export function jsonSidecarStore<T>(config: Config, spec: SidecarSpec<T>): JsonFileIO<T> {
  const p = sidecarPath(config, spec.filename);
  return makeIO(p, spec.fallback, spec.coerce, spec.onParseError ?? 'default');
}

export function jsonPathStore<T>(file: string, spec: PathSpec<T>): JsonFileIO<T> {
  return makeIO(path.resolve(file), spec.fallback, spec.coerce, spec.onParseError ?? 'throw', spec.label);
}

function makeIO<T>(
  p: string,
  fallback: () => T,
  coerce: ((raw: unknown, fb: T) => T) | undefined,
  mode: ParseMode,
  label?: string
): JsonFileIO<T> {
  return {
    filePath: () => p,
    read() {
      const fb = fallback();
      if (!fs.existsSync(p)) return fb;
      const content = fs.readFileSync(p, 'utf-8');
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (err) {
        if (mode === 'throw') {
          throw new Error(`Failed to parse ${label ?? 'file'} at ${p}: ${err}`);
        }
        return fb;
      }
      return coerce ? coerce(raw, fb) : (raw as T);
    },
    write(value: T) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(value, null, 2), 'utf-8');
      return value;
    },
  };
}
