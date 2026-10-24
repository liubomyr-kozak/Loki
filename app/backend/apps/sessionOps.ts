import { Config } from '../../shared/types';
import { readRegistry } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { readSelections } from '../process/selections';
import { getInstancesPath, readInstances } from '../process/instances';
import { resolveProvider, GetAttachCommandOpts } from './sessionProvider';
import { windowName } from './providers/tmuxProvider';
import { primeProviders } from './providerRegistry';
import { resolveDefaultShell } from '../process/shellEnv';
import { resolveProcessKey, getSelectionsPath } from './effectiveConfig';

function attachProcessKey(appName: string, config?: Config, instanceId?: string): string {
  // No config (used only by tests/callers that don't need instance
  // resolution) or no instanceId both fall through to the plain appName —
  // same window as before this task.
  return config && instanceId
    ? resolveProcessKey(config, appName, instanceId, readSelections(getSelectionsPath(config))[appName]).processKey
    : appName;
}

export function getAttachCommand(appName: string, config?: Config, opts?: GetAttachCommandOpts, instanceId?: string): string {
  primeProviders(config);
  return resolveProvider(config).getAttachCommand(attachProcessKey(appName, config, instanceId), opts) ?? '';
}

/**
 * Switch an already attached terminal to this app's session. Returns false
 * when nothing is attached (or the provider can't tell), in which case the
 * caller opens a new terminal with getAttachCommand().
 */
export function focusAttachedSession(appName: string, config?: Config, instanceId?: string): boolean {
  primeProviders(config);
  const provider = resolveProvider(config);
  return provider.focusExisting?.(attachProcessKey(appName, config, instanceId)) ?? false;
}

export interface SessionInfo {
  appName: string | null;
  label: string;
  window: string;
  target: string;
  dead: boolean;
  port?: number;
}

export async function listSessions(config: Config): Promise<SessionInfo[]> {
  try {
    primeProviders(config);
    const provider = resolveProvider(config);
    const registryPath = resolveStateFile(config);
    const registry = readRegistry(registryPath);

    const reverseMap = new Map<string, { appName: string; label: string; processKey: string }>();
    for (const [appName, app] of Object.entries(config.apps)) {
      reverseMap.set(windowName(appName), { appName, label: app.label, processKey: appName });
    }

    // A detached instance gets its own tmux window keyed by its processKey
    // (appName#instanceId, see backend/process/linkage.ts) — map that window
    // name back to its app too, so the sessions panel can identify it
    // instead of showing a bare window name. A linked instance shares the
    // original's window and is already covered by the loop above.
    const selections = readSelections(getSelectionsPath(config));
    const instances = readInstances(getInstancesPath(config));
    for (const instance of Object.values(instances)) {
      const app = config.apps[instance.appName];
      if (!app) continue;
      const resolved = resolveProcessKey(config, instance.appName, instance.id, selections[instance.appName]);
      if (resolved.mode === 'detached') {
        reverseMap.set(windowName(resolved.processKey), {
          appName: instance.appName,
          label: instance.label ?? app.label,
          processKey: resolved.processKey,
        });
      }
    }

    return provider.listSessions().map((s): SessionInfo => {
      const match = reverseMap.get(s.name) ?? (config.apps[s.name] ? { appName: s.name, label: config.apps[s.name].label, processKey: s.name } : null);
      const appName = match?.appName ?? null;
      const label = match?.label ?? s.name;
      const port = match ? registry[match.processKey]?.port : undefined;
      return { appName, label, window: s.name, target: s.target ?? s.name, dead: !s.alive, port };
    });
  } catch {
    return [];
  }
}

export async function runShellCommand(
  config: Config,
  windowLabel: string,
  command: string,
  cwd?: string
): Promise<void> {
  const shell = resolveDefaultShell(config);
  const resolvedCwd = cwd ?? process.cwd();
  primeProviders(config);
  const provider = resolveProvider(config);

  if (!provider.runCommand) {
    throw new Error(`Session provider "${provider.id}" does not support running shell commands.`);
  }
  provider.runCommand(windowLabel, resolvedCwd, shell, command);
}

export async function runProcessInTmux(config: Config, command: string, cwd?: string, window?: string): Promise<void> {
  const label = window ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await runShellCommand(config, label, command, cwd);
}
