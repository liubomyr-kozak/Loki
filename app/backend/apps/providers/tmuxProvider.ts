import {
  registerProvider,
  SessionProvider,
  StartArgs,
  SessionInfo,
  SessionState,
  SessionSnapshot,
  GetAttachCommandOpts,
} from '../sessionProvider';
import { findTmux, getSocketPath, getParentSession, tmux, getWindowTarget, windowName, availability } from './tmuxCli';
import { getWindowInfo, setPaneTitle, spawnInWindow, TmuxWindowInfo } from './tmuxSession';
import { errorMessage } from '../../errors';

export { configure, findTmux, getCachedTmuxVersion, availability, windowName } from './tmuxCli';

function start(a: StartArgs): { pid: number; session?: string } {
  spawnInWindow(a.name, a.repoPath, a.shell, a.startCommand);

  const winTarget = getWindowTarget(a.name);

  setPaneTitle(a.name, a.port != null ? `${a.name} :${a.port}` : a.name);

  const paneOut = tmux(['list-panes', '-t', winTarget, '-F', '#{pane_pid}']);
  const parsedPid = parseInt(paneOut.trim().split('\n')[0], 10);
  const pid = isNaN(parsedPid) ? -1 : parsedPid;

  return { pid, session: winTarget };
}

function stop(name: string): void {
  const parentSession = getParentSession();
  const winTarget = getWindowTarget(name);
  try { tmux(['kill-window', '-t', winTarget], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] kill-window (stop) ignored: ${errorMessage(err)}`); }

  try {
    const remaining = tmux(['list-windows', '-t', parentSession, '-F', '#{window_name}']);
    if (!remaining.trim()) {
      try { tmux(['kill-session', '-t', parentSession], { ignore: true }); } catch (err) { console.debug(`[tmuxProvider] kill-session ignored: ${errorMessage(err)}`); }
    }
  } catch (err) { console.debug(`[tmuxProvider] list-windows (stop) ignored — parent session already gone: ${errorMessage(err)}`); }
}

function listSessions(): SessionInfo[] {
  const winMap = getWindowInfo();
  const parentSession = getParentSession();
  return Array.from(winMap.entries()).map(([name, info]) => ({
    name,
    alive: !info.dead,
    target: `${parentSession}:${name}`,
  }));
}

function snapshot(): SessionSnapshot {
  return getWindowInfo();
}

function windowInfoFrom(snap?: SessionSnapshot): Map<string, TmuxWindowInfo> {
  return (snap as Map<string, TmuxWindowInfo> | undefined) ?? getWindowInfo();
}

function sessionAlive(name: string, snap?: SessionSnapshot): boolean {
  return windowInfoFrom(snap).has(windowName(name));
}

function sessionState(name: string, snap?: SessionSnapshot): SessionState {
  const info = windowInfoFrom(snap).get(windowName(name));
  if (!info) return { present: false, dead: false, pid: null };
  return { present: true, dead: info.dead, pid: info.pid };
}

function setSessionLabel(name: string, label: string): void {
  setPaneTitle(name, label);
}

function runCommand(windowLabel: string, cwd: string, shell: string, command: string): void {
  spawnInWindow(windowLabel, cwd, shell, command);
}

// Plain attach, never iTerm's `-CC` control mode: -CC opens a gateway window
// plus one native window per tmux window (and prints raw `%layout-change`
// lines in any terminal that isn't iTerm), which is the "two windows" users
// saw. One terminal window shows the session; apps are its tmux windows.
function getAttachCommand(name: string, _opts: GetAttachCommandOpts = {}): string {
  const parentSession = getParentSession();
  const winTarget = getWindowTarget(name);
  return `${findTmux()} -S ${getSocketPath()} attach -t ${parentSession} \\; select-window -t ${winTarget}`;
}

function focusExisting(name: string): boolean {
  try {
    const clients = tmux(['list-clients', '-t', getParentSession(), '-F', '#{client_name}']).trim();
    if (!clients) return false;
    tmux(['select-window', '-t', getWindowTarget(name)]);
    return true;
  } catch (err) {
    console.debug(`[tmuxProvider] focusExisting: ${errorMessage(err)}`);
    return false;
  }
}

export const tmuxProvider: SessionProvider = {
  id: 'tmux',
  label: 'tmux',
  description: 'Runs each app in a named tmux window inside a shared session, so you can attach live from any terminal.',
  icon: 'square-terminal',
  platforms: ['darwin', 'linux'],
  recommended: true,
  benefits: ['Shared terminal session', 'Live attach from any terminal', 'Better resilience & restart'],
  advancedDescription: 'Advanced settings for tmux execution.',
  availability,
  start,
  stop,
  listSessions,
  sessionAlive,
  getAttachCommand,
  focusExisting,
  snapshot,
  sessionState,
  setSessionLabel,
  runCommand,
  settings: [
    {
      key: 'tmuxBin',
      label: 'tmux binary',
      desc: 'Explicit path to the tmux binary. Leave blank to auto-detect (Homebrew, common install locations).',
      kind: 'path',
      advanced: true,
    },
    {
      key: 'sessionPrefix',
      label: 'Session name',
      desc: 'Name of the tmux session.',
      kind: 'text',
      copyable: true,
      advanced: true,
    },
    {
      key: 'socketPath',
      label: 'Socket (optional)',
      desc: 'Path to tmux socket file.',
      kind: 'text',
      advanced: true,
    },
    {
      key: 'attachBehavior',
      label: 'Attach behavior',
      desc: 'When to attach to the session.',
      kind: 'select',
      options: [
        { value: 'auto', label: 'Auto attach if already running' },
        { value: 'manual', label: 'Manual attach' },
      ],
      advanced: true,
    },
    {
      key: 'restartStaleSessions',
      label: 'Restart stale sessions',
      desc: 'Kill orphaned sessions on startup. (stored preference; runtime wiring TBD)',
      kind: 'boolean',
      advanced: true,
    },
  ],
};

registerProvider(tmuxProvider);
