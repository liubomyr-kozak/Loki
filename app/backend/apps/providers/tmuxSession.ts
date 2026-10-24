import { tmux, getParentSession, getWindowTarget, windowName } from './tmuxCli';
import { errorMessage } from '../../errors';
import { lokiOwnKeys } from '../../process/appEnv';

export interface TmuxWindowInfo {
  dead: boolean;
  pid: number;
}

export function getWindowInfo(): Map<string, TmuxWindowInfo> {
  const winMap = new Map<string, TmuxWindowInfo>();
  try {
    const windowList = tmux(['list-windows', '-t', getParentSession(), '-F', '#{window_name} #{pane_dead} #{pane_pid}']);
    for (const raw of windowList.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(' ');
      if (parts.length < 3) continue;
      const paneDeadStr = parts[parts.length - 2];
      const panePidStr = parts[parts.length - 1];
      // window_name may contain spaces; rejoin everything except last two tokens
      const wName = parts.slice(0, parts.length - 2).join(' ');
      const dead = paneDeadStr === '1';
      const pid = parseInt(panePidStr, 10);
      winMap.set(wName, { dead, pid: isNaN(pid) ? -1 : pid });
    }
  } catch (err) {
    console.debug(`[tmuxProvider] list-windows ignored: ${errorMessage(err)}`);
  }
  return winMap;
}

export function setPaneTitle(name: string, title: string): void {
  const winTarget = getWindowTarget(name);
  try { tmux(['select-pane', '-t', winTarget, '-T', title], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] select-pane (set title) ignored: ${errorMessage(err)}`); }
}

function createTmuxWindow(args: string[]): void {
  try {
    tmux(args, { ignore: true });
  } catch (err) {
    throw new Error(`tmux spawn failed: ${errorMessage(err)}`);
  }
}

export function spawnInWindow(label: string, cwd: string, shell: string, command: string): void {
  const win = windowName(label);
  const parentSession = getParentSession();
  const winTarget = `${parentSession}:${win}`;

  try { tmux(['kill-window', '-t', winTarget], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] kill-window (stale) ignored: ${errorMessage(err)}`); }

  let parentExists = false;
  try {
    tmux(['has-session', '-t', parentSession]);
    parentExists = true;
  } catch (err) { console.debug(`[tmuxProvider] has-session: no parent session yet: ${errorMessage(err)}`); }

  // A tmux server started earlier (by a terminal, or by an older Loki) keeps
  // the environment it was born with, and new windows inherit that rather
  // than ours. Hand it the PATH we resolved so start commands find yarn/npm.
  if (parentExists && process.env.PATH) {
    try { tmux(['set-environment', '-g', 'PATH', process.env.PATH], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] set-environment PATH ignored: ${errorMessage(err)}`); }
  }
  // An older Loki's server also kept Loki's own variables (PORT=9999 made dev
  // servers start on Loki's port); clear them before the new window.
  if (parentExists) {
    for (const key of lokiOwnKeys()) {
      try { tmux(['set-environment', '-g', '-u', key], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] set-environment -u ${key} ignored: ${errorMessage(err)}`); }
    }
  }

  if (!parentExists) {
    createTmuxWindow(['new-session', '-d', '-s', parentSession, '-n', win, '-c', cwd, shell, '-c', command]);
  } else {
    createTmuxWindow(['new-window', '-d', '-t', parentSession, '-n', win, '-c', cwd, shell, '-c', command]);
  }

  try { tmux(['set-option', '-t', winTarget, 'remain-on-exit', 'on'], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] set-option remain-on-exit ignored: ${errorMessage(err)}`); }
}
