import fs from 'fs';
import { execFileSync } from 'child_process';
import type { Config } from '../../shared/types';
import { errorMessage } from '../errors';
import { detectShellCandidates } from '../config/scan';

/**
 * Shell used to run app start commands when the user has not picked one in
 * Settings: the same shell Settings shows as "detected" ($SHELL first), so
 * what runs matches what the UI says. /bin/sh is only the last resort.
 */
export function resolveDefaultShell(config: Config): string {
  const configured = config.global?.defaultShell;
  if (configured) return configured;
  if (process.platform === 'win32') return process.env.ComSpec || 'cmd.exe';
  const detected = detectShellCandidates()[0]?.path;
  return detected || '/bin/sh';
}

const START = '__LOKI_PATH_START__';
const END = '__LOKI_PATH_END__';

/**
 * An app opened from Finder or the Dock starts with launchd's minimal PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin), so yarn, npm, nvm's node, Homebrew and
 * friends are missing and every start command fails with "command not
 * found". Ask the user's login shell for the PATH their terminal would have
 * and put it in front of ours, so the backend and everything it spawns sees
 * the same tools as a terminal. Never fatal: on failure we keep what we had.
 */
export function importLoginShellPath(): void {
  if (process.platform === 'win32' || process.env.LOKI_SKIP_SHELL_PATH === '1') return;
  const shell = process.env.SHELL && fs.existsSync(process.env.SHELL) ? process.env.SHELL : detectShellCandidates()[0]?.path;
  if (!shell) return;
  try {
    const out = execFileSync(shell, ['-ilc', `printf '%s' ${START}; printenv PATH; printf '%s' ${END}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      env: { ...process.env, TERM: process.env.TERM || 'dumb' },
    });
    const start = out.lastIndexOf(START);
    const end = out.lastIndexOf(END);
    if (start < 0 || end <= start) return;
    const loginPath = out.slice(start + START.length, end).trim();
    if (!loginPath) return;
    process.env.PATH = mergePath(loginPath, process.env.PATH || '');
    console.log(`[shellEnv] PATH taken from ${shell} login shell`);
  } catch (err) {
    console.warn(`[shellEnv] could not read PATH from ${shell}: ${errorMessage(err)}`);
  }
}

export function mergePath(preferred: string, current: string): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const p of [...preferred.split(':'), ...current.split(':')]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    parts.push(p);
  }
  return parts.join(':');
}
