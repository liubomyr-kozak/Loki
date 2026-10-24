/**
 * Variables that configure Loki itself. The Tauri shell, dev scripts and
 * tests set them on the backend; none of them is meant for the apps Loki
 * starts. `PORT` is here too: an app's port comes from its own config, and a
 * PORT inherited from Loki's environment made dev servers start on Loki's
 * port instead of their own.
 */
const LOKI_OWN_KEYS = ['PORT', 'CONFIG_FILE', 'CATALOG_FILE', 'MARKETPLACE_DIR', 'APP_SESSIONS_DIR'];
const LOKI_PREFIX = 'LOKI_';

export function isLokiOwnKey(key: string): boolean {
  return LOKI_OWN_KEYS.includes(key) || key.startsWith(LOKI_PREFIX);
}

/** Loki's own variables currently set, for clearing a tmux server's env. */
export function lokiOwnKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set([...LOKI_OWN_KEYS, ...Object.keys(env).filter(isLokiOwnKey)])];
}

/** The backend's environment without Loki's own variables: what apps get. */
export function appEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!isLokiOwnKey(key)) out[key] = value;
  }
  return out;
}
