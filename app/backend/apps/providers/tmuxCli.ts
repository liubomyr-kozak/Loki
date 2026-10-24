import fs from 'fs';
import { execFileSync } from 'child_process';
import { Availability } from '../sessionProvider';
import { appEnv } from '../../process/appEnv';

let configuredTmuxBin: string | undefined;
let configuredSocketPath: string | undefined;
let configuredSessionPrefix: string | undefined;

const TMUX_BIN_FALLBACK_CANDIDATES = ['/opt/homebrew/bin/tmux', '/usr/local/bin/tmux', '/usr/bin/tmux'];

const TMUX_SOCKET_PATH_PREFIX = '/tmp/mfe-tmux-';
const TMUX_SOCKET_PATH_SUFFIX = '.sock';

export function configure(opts: { tmuxBin?: string; socketPath?: string; sessionPrefix?: string } = {}): void {
  configuredTmuxBin = opts.tmuxBin;
  configuredSocketPath = opts.socketPath;
  configuredSessionPrefix = opts.sessionPrefix;
}

export function findTmux(): string {
  const candidates = [
    configuredTmuxBin,
    process.env.TMUX_BIN,
    ...TMUX_BIN_FALLBACK_CANDIDATES,
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'tmux';
}

export function getSocketPath(): string {
  return (
    configuredSocketPath ||
    `${TMUX_SOCKET_PATH_PREFIX}${typeof process.getuid === 'function' ? process.getuid() : 'user'}${TMUX_SOCKET_PATH_SUFFIX}`
  );
}

const DEFAULT_PARENT_SESSION = 'mfe';

export function getParentSession(): string {
  return configuredSessionPrefix || DEFAULT_PARENT_SESSION;
}

export function tmux(args: string[], opts: { ignore?: boolean } = {}): string {
  try {
    return execFileSync(findTmux(), ['-S', getSocketPath(), ...args], {
      encoding: 'utf-8',
      stdio: opts.ignore ? 'ignore' : ['ignore', 'pipe', 'pipe'],
      // A tmux server started here is born with this env, and its windows
      // inherit it: keep Loki's own variables out.
      env: appEnv(),
    }) as unknown as string;
  } catch (err) {
    const stderr = readExecStderr(err);
    if (!opts.ignore && err instanceof Error && stderr && !err.message.includes(stderr)) {
      err.message = `${err.message}\n${stderr}`;
    }
    throw err;
  }
}

function readExecStderr(err: unknown): string {
  const stderr = err && typeof err === 'object' ? (err as { stderr?: unknown }).stderr : undefined;
  if (typeof stderr === 'string') return stderr.trim();
  if (Buffer.isBuffer(stderr)) return stderr.toString('utf-8').trim();
  return '';
}

/**
 * Derive a tmux-safe window name for an app inside the parent session.
 * tmux forbids '.' and ':' in window names, so they are replaced with '_'.
 */
export function windowName(appName: string): string {
  return appName.replace(/[.:\s]/g, '_');
}

export function getWindowTarget(name: string): string {
  return `${getParentSession()}:${windowName(name)}`;
}

let availabilityCache: { bin: string; result: Availability; version?: string } | null = null;

function probeTmux(bin: string): { result: Availability; version?: string } {
  try {
    const out = execFileSync(bin, ['-V'], { encoding: 'utf-8' });
    return { result: { available: true, reason: '' }, version: out.trim() };
  } catch {
    return {
      result: { available: false, reason: 'tmux binary not found — install it or set an explicit path below.' },
    };
  }
}

export function availability(opts: { bypassCache?: boolean } = {}): Availability {
  if (process.platform === 'win32') {
    return { available: false, reason: 'tmux is not available on Windows.', unsupportedPlatform: true };
  }
  const bin = findTmux();
  if (!opts.bypassCache && availabilityCache && availabilityCache.bin === bin) {
    return availabilityCache.result;
  }
  const { result, version } = probeTmux(bin);
  availabilityCache = { bin, result, version };
  return result;
}

export function getCachedTmuxVersion(): string | undefined {
  return availabilityCache?.version;
}
