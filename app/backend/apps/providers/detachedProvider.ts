import { spawn, execFileSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { registerProvider, SessionProvider, StartArgs, SessionInfo, SessionState, Availability } from '../sessionProvider';
import { appEnv } from '../../process/appEnv';

let configuredSessionsDir: string | undefined;
let resolvePid: ((name: string) => number | undefined) | undefined;

export function configure(opts: { sessionsDir?: string; resolvePid?: (name: string) => number | undefined } = {}): void {
  configuredSessionsDir = opts.sessionsDir;
  resolvePid = opts.resolvePid;
}

// Module-local: shares its name with `scan.ts`'s exported resolver, but answers
// a different question — that one derives the path from the config, this one
// reports what was actually configured, falling back to the OS temp dir so a
// detached spawn never fails just because priming hasn't run yet.
function resolveSessionsDir(): string {
  return configuredSessionsDir || os.tmpdir();
}

/**
 * Sanitize a session name for safe use as a log filename component. Mirrors
 * tmuxProvider's `windowName()` (dot/colon/whitespace -> underscore), but is
 * broadened to also neutralize path separators: `windowName()` only needs to
 * be tmux-safe, whereas this value is interpolated directly into a
 * filesystem path and must not be able to escape `sessionsDir` (e.g. via `/` or
 * `..`, which collapses to `__` once dots are replaced).
 */
export function sanitizeName(name: string): string {
  return name.replace(/[\/\\.:\s]/g, '_');
}

const pids = new Map<string, number>();

function pidFor(name: string): number | undefined {
  const inMemory = pids.get(name);
  if (inMemory != null) return inMemory;
  return resolvePid?.(name);
}

function availability(): Availability {
  return { available: true, reason: '' };
}

/**
 * Spawn `shell -c command` (or, on Windows, `ComSpec /c command`) as a
 * detached background process with stdout/stderr appended to a log file
 * under `sessionsDir`. Shared by `start()` (app lifecycle: tracked pid, throws
 * if spawn didn't yield one) and `runCommand()` (fire-and-forget: N1 — must
 * NOT throw on a null pid). Preserves the logfile handling, the `detached`
 * process-group flag, and the win32 `ComSpec` branch verbatim from the
 * pre-extraction `start()` body.
 */
function spawnDetached(
  name: string,
  cwd: string,
  shell: string,
  command: string,
  env: NodeJS.ProcessEnv
): { child: ChildProcess; pid: number | null } {
  const sessionsDir = resolveSessionsDir();
  fs.mkdirSync(sessionsDir, { recursive: true });
  const logFile = path.join(sessionsDir, `${sanitizeName(name)}.log`);
  const outFd = fs.openSync(logFile, 'a');
  const errFd = fs.openSync(logFile, 'a');

  let child: ChildProcess;
  try {
    if (process.platform === 'win32') {
      // NOTE: `command` is interpolated into a raw quoted string with no
      // escaping of embedded `"` characters. A command containing a double
      // quote (e.g. from a repo path or an app-supplied start command) can
      // break out of this quoting and change what cmd.exe actually runs.
      // Left as-is (pre-existing behavior) — callers must not pass untrusted
      // input through `command`.
      child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], {
        cwd,
        env,
        detached: true,
        windowsHide: true,
        windowsVerbatimArguments: true,
        stdio: ['ignore', outFd, errFd],
      });
    } else {
      child = spawn(shell, ['-c', command], {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', outFd, errFd],
      });
    }
  } finally {
    // The child receives its own duplicated descriptors at spawn time; the
    // parent's copies can be closed immediately.
    try { fs.closeSync(outFd); } catch { /* ignore */ }
    try { fs.closeSync(errFd); } catch { /* ignore */ }
  }

  // An async spawn failure (e.g. the shell binary itself doesn't exist)
  // surfaces as an 'error' event on the child, not a thrown exception. Node
  // treats an unhandled 'error' event as fatal and crashes the process — log
  // and swallow it instead. Attached before returning so it's in place for
  // the entire lifetime of the child.
  child.on('error', (err) => {
    console.error(`[detachedProvider] spawn error for "${name}":`, err);
  });

  child.unref();
  return { child, pid: child.pid ?? null };
}

function start(a: StartArgs): { pid: number; session?: string } {
  const { pid } = spawnDetached(a.name, a.repoPath, a.shell, a.startCommand, a.env);

  if (pid == null) {
    throw new Error(`detachedProvider: spawn did not yield a pid for "${a.name}"`);
  }

  pids.set(a.name, pid);
  return { pid };
}

/** Fire-and-forget: unlike `start()`, does NOT throw on a null pid (N1) — backs generic plugin/host runProcess calls, not app lifecycle tracking. */
function runCommand(windowLabel: string, cwd: string, shell: string, command: string): void {
  spawnDetached(windowLabel, cwd, shell, command, appEnv());
}

function stop(name: string): void {
  const pid = pidFor(name);
  pids.delete(name);
  if (pid == null) return;

  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }); } catch { }
    return;
  }

  try {
    process.kill(-pid);
  } catch {
    try { process.kill(pid); } catch { }
  }
}

function sessionAlive(name: string): boolean {
  const pid = pidFor(name);
  if (pid == null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sessionState(name: string): SessionState {
  return { present: sessionAlive(name), dead: false, pid: pidFor(name) ?? null };
}

function listSessions(): SessionInfo[] {
  return Array.from(pids.keys()).map(name => ({ name, alive: sessionAlive(name) }));
}

function getAttachCommand(): string | null {
  return null;
}

export const detachedProvider: SessionProvider = {
  id: 'detached',
  label: 'Detached process',
  description: 'Runs each app as a plain background process with output logged to a file. Works everywhere, no terminal multiplexer required.',
  icon: 'layers',
  platforms: ['darwin', 'linux', 'win32'],
  recommended: process.platform === 'win32',
  benefits: ['Simple and portable', 'Works on any system', 'No terminal multiplexer required'],
  availability,
  start,
  stop,
  listSessions,
  sessionAlive,
  getAttachCommand,
  sessionState,
  runCommand,
  settings: [{ key: 'sessionsDir', label: 'Sessions dir', desc: 'Where detached session output is written', kind: 'path', advanced: true }],
};

registerProvider(detachedProvider);
