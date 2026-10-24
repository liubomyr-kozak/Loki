import fs from 'fs';
import path from 'path';
import { Config } from '../../shared/types';
import { ConfigSchema } from '../../shared/schema';
import { parseSimpleYaml } from './yamlParser';

// Siblings of the config file, not a nested `state/` — the config
// already lives in that folder (see configLocation.ts).
const STATE_FILE_NAME = 'state.json';
const DEFAULT_SESSIONS_DIR = 'sessions';

export function loadConfig(filePath: string): Config {
  const absPath = path.resolve(filePath);
  let obj: any;
  if (!fs.existsSync(absPath)) {
    const ext = path.extname(absPath).toLowerCase();
    if (ext !== '.json') {
      throw new Error(
        `Cannot auto-create non-JSON config: ${absPath}. Create this file manually (as valid ${ext || 'YAML'}) before starting, or point CONFIG_FILE at a .json path.`
      );
    }
    // Both paths are written RELATIVE to the config file. They are resolved
    // against the config's own directory below, so the config stays portable —
    // baking an absolute path in here is what broke every install whose config
    // later moved (dev checkout vs. packaged app_config_dir).
    const defaultSessionsDir = process.env.APP_SESSIONS_DIR || DEFAULT_SESSIONS_DIR;
    obj = { apps: {}, global: { sessionsDir: defaultSessionsDir, stateFile: STATE_FILE_NAME } };
    const dir = path.dirname(absPath);
    const tmpPath = `${absPath}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmpPath, JSON.stringify(obj, null, 2), { encoding: 'utf-8', flag: 'wx' });
      fs.renameSync(tmpPath, absPath);
    } catch (err: any) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
      }
      const code = err && err.code ? ` (${err.code})` : '';
      throw new Error(`Failed to create default config at ${absPath}${code}: ${err && err.message ? err.message : err}`);
    }
  } else {
    const content = fs.readFileSync(absPath, 'utf-8');
    const ext = path.extname(absPath).toLowerCase();
    if (ext === '.json') {
      obj = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      obj = parseSimpleYaml(content);
    } else {
      throw new Error(`Unsupported config file extension: ${ext}`);
    }
  }
  if (!obj.global) obj.global = {};
  if (!obj.global.sessionsDir) obj.global.sessionsDir = process.env.APP_SESSIONS_DIR || DEFAULT_SESSIONS_DIR;
  if (!obj.global.stateFile) obj.global.stateFile = STATE_FILE_NAME;

  // Anchor relative paths to the config file's directory, NOT process.cwd().
  // The packaged app spawns the backend without a .current_dir() (see
  // app/src-tauri/src/main.rs), so cwd is "/" there and a relative
  // "state/state.json" resolved against it becomes "/state/..."
  // — unwritable, so every state write failed. path.resolve is a no-op for
  // paths that are already absolute, so explicit absolute configs still work.
  const configDir = path.dirname(absPath);
  obj.global.stateFile = path.resolve(configDir, obj.global.stateFile);
  obj.global.sessionsDir = path.resolve(configDir, obj.global.sessionsDir);
  if (obj.global.pluginsDir) obj.global.pluginsDir = path.resolve(configDir, obj.global.pluginsDir);
  if (!obj.apps) {
    throw new Error('Config must define an "apps" object');
  }
  for (const key of Object.keys(obj.apps)) {
    if (!obj.apps[key].surface) obj.apps[key].surface = 'list';
    // Relative repoPath is resolved against the config's own directory so
    // demo/shared configs stay portable; path.resolve is a no-op for absolute
    // paths, and writes never bake this back because mutateConfigFile re-reads
    // the raw file.
    if (obj.apps[key].repoPath) obj.apps[key].repoPath = path.resolve(configDir, obj.apps[key].repoPath);
  }
  return ConfigSchema.parse(obj);
}