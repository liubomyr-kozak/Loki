import { Config, ProcessConflict } from '../../shared/types';
import { appEnv } from '../process/appEnv';
import { getProcessByPort, killProcessOnPort, discoverPort } from '../ports/portUtils';
import { readRegistry, updateProcessState } from '../process/registry';
import { resolveStateFile } from '../config/statePaths';
import { readSelections, writeSelection, AppSelection } from '../process/selections';
import { resolveProvider, StartArgs } from './sessionProvider';
import { runPluginLifecycle } from '../plugins/lifecycle';
import { resolveEffective, resolveProcessKey, detectOrphanConflict, getSelectionsPath } from './effectiveConfig';
import { primeProviders } from './providerRegistry';
import { resolveDefaultShell } from '../process/shellEnv';
import { getAppStatus } from './statusService';

const PORT_DISCOVERY_TIMEOUT_MS = 30000;
const PORT_DISCOVERY_POLL_MS = 1000;
const SIGTERM_GRACE_MS = 500;

export class ProcessConflictError extends Error {
  constructor(public readonly conflict: ProcessConflict) {
    super(`Live process found under "${conflict.otherProcessKey}"; resolve before starting "${conflict.processKey}".`);
  }
}

// Mutex serializing startApp's check→spawn→register critical section against
// itself, so two concurrent starts for the SAME process can't both observe
// `stopped`, both spawn, and have the second updateProcessState overwrite the
// first pid (orphaning the first process, leaking its port). Same idiom as
// gitFlowService's withGitFlowLock: a Map<processKey, Promise> queue, keyed
// per process so different processes still start in parallel; each entry's
// tail is swapped in with a .catch so one rejected start never wedges its
// lane. The entry is pruned once the lane drains (its tail is still the
// promise we stored) so the Map doesn't grow unbounded across the process's
// lifetime.
//
// Keyed by processKey (backend/process/linkage.ts), not appName: for an app
// with no instances (or a linked instance) processKey === appName always, so
// this lane is byte-identical to before this task (ADR invariant #1). A
// detached instance gets its own lane and can start in parallel with its
// original.
const startLocks = new Map<string, Promise<unknown>>();
function withStartLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const prev = startLocks.get(lockKey) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  startLocks.set(lockKey, tail);
  tail.then(() => {
    if (startLocks.get(lockKey) === tail) startLocks.delete(lockKey);
  });
  return run;
}

export function startApp(
  config: Config,
  appName: string,
  sel?: AppSelection,
  force = false,
  persistSelection = true,
  instanceId?: string,
  resolution?: 'stop-old' | 'keep-old'
): Promise<void> {
  // The lock key is the processKey this call would use — recomputed fresh
  // from the persisted selection every call, never cached, so a linked
  // instance's start always serializes against its original's.
  const persistedSelection = readSelections(getSelectionsPath(config))[appName];
  const mergedSelection: AppSelection = { ...persistedSelection };
  if (sel?.environment !== undefined) mergedSelection.environment = sel.environment;
  const { processKey } = resolveProcessKey(config, appName, instanceId, mergedSelection);
  return withStartLock(processKey, () => startAppLocked(config, appName, sel, force, persistSelection, instanceId, resolution));
}

async function startAppLocked(
  config: Config,
  appName: string,
  sel?: AppSelection,
  force = false,
  persistSelection = true,
  instanceId?: string,
  resolution?: 'stop-old' | 'keep-old'
): Promise<void> {
  const app = config.apps[appName];
  if (!app) throw new Error(`App not found: ${appName}`);

  const persistedSelection = readSelections(getSelectionsPath(config))[appName];
  const mergedSelection: AppSelection = { ...persistedSelection };
  if (sel?.environment !== undefined) mergedSelection.environment = sel.environment;

  if (sel?.environment !== undefined && persistSelection) {
    writeSelection(getSelectionsPath(config), appName, mergedSelection);
  }

  const { processKey, mode, instance } = resolveProcessKey(config, appName, instanceId, mergedSelection);

  // Orphan-process safety net (ADR task 4): only reachable for instances,
  // and only fires at the moment of starting one whose linked/detached
  // status just changed and left a live process under its PREVIOUS
  // processKey — not a background sweep. No instance (or nothing left over)
  // ⇒ this whole block is a no-op, so the common/no-instance path is
  // unaffected.
  {
    const conflict = detectOrphanConflict(appName, instanceId, processKey, readRegistry(resolveStateFile(config)), app.label);
    if (conflict) {
      if (!resolution) {
        throw new ProcessConflictError(conflict);
      }
      if (resolution === 'stop-old') {
        const otherEntry = readRegistry(resolveStateFile(config))[conflict.otherProcessKey];
        await stopProcessAtKey(config, appName, conflict.otherProcessKey, otherEntry?.environment, true);
      }
      // resolution === 'keep-old': proceed, leave the old process running.
    }
  }

  // A detached instance launches with ITS OWN resolved environment (the
  // override) — a linked instance, or the implicit default row
  // (instanceId undefined), launches with the app's own merged selection
  // exactly as before this task (ADR invariant #1).
  const startSelection: AppSelection = mode === 'detached' && instance
    ? { ...mergedSelection, environment: instance.envOverride ?? mergedSelection.environment }
    : mergedSelection;

  const eff = resolveEffective(app, startSelection, config);

  if (app.dependsOn) {
    for (const dep of app.dependsOn) {
      await startApp(config, dep);
    }
  }

  const registryPath = resolveStateFile(config);
  const registry = readRegistry(registryPath);

  const status = await getAppStatus(config, appName, registry, undefined, instanceId);
  if (!force && status.process === 'running') {
    return;
  }

  // Plugin hooks stay keyed by appName — plugins only ever see the app's own
  // identity, instances are invisible to them (ADR §Наслідки).
  try {
    await runPluginLifecycle(config, appName, 'onStart', mergedSelection);
  } catch (err) {
    console.warn(`[plugins] onStart hook failed for "${appName}"`, err);
  }

  // `eff.startCommand` is optional. Fail loudly here, at the one place that
  // actually needs a command to spawn, rather than passing `undefined`
  // through to the session provider.
  if (!eff.startCommand) {
    throw new Error(
      `App "${appName}" has no startCommand: set "startCommand" on the app or on environment "${eff.environmentKey ?? '(none)'}"`
    );
  }
  // `eff.repoPath` is optional. Fail loudly here, at the one place that
  // actually needs a repo to spawn into, rather than passing `undefined`
  // through to the session provider (`StartArgs.repoPath` is required).
  if (!eff.repoPath) {
    throw new Error(
      `App "${appName}" has no repoPath: set "repoPath" on the app or on environment "${eff.environmentKey ?? '(none)'}"`
    );
  }

  primeProviders(config);
  const provider = resolveProvider(config);
  const shell = resolveDefaultShell(config);
  const startArgs: StartArgs = {
    // Session/window naming keyed by processKey, not appName — a detached
    // instance gets its own tmux window instead of colliding with the
    // original's (registry key, lock key, and session name all land on the
    // same identifier).
    name: processKey,
    startCommand: eff.startCommand,
    repoPath: eff.repoPath,
    shell,
    env: appEnv(),
    port: eff.port,
    environment: eff.environmentKey,
  };
  const { pid, session } = provider.start(startArgs);

  let discoveredPort: number | null = null;
  const discoverStart = Date.now();
  while (Date.now() - discoverStart < PORT_DISCOVERY_TIMEOUT_MS) {
    await new Promise(res => setTimeout(res, PORT_DISCOVERY_POLL_MS));
    const realPort = await discoverPort(pid);
    if (realPort != null) {
      discoveredPort = realPort;
      break;
    }
  }

  const effectivePort = discoveredPort ?? eff.port;

  const state = {
    pid,
    port: effectivePort,
    startedAt: new Date().toISOString(),
    environment: eff.environmentKey,
    session,
  };
  updateProcessState(registryPath, processKey, state);

  if (effectivePort != null) {
    provider.setSessionLabel?.(processKey, `${appName} :${effectivePort}`);
  }
}

// The actual kill-and-reap sequence for a single process identity, factored
// out of stopApp so the orphan-conflict resolver (startAppLocked's
// 'stop-old' branch) can stop a process at an EXPLICIT processKey — the
// instance's previous identity, not whatever `resolveProcessKey` would
// compute for it right now — without duplicating this logic.
async function stopProcessAtKey(
  config: Config,
  appName: string,
  processKey: string,
  environment: string | undefined,
  force: boolean
): Promise<void> {
  const registryPath = resolveStateFile(config);
  const registry = readRegistry(registryPath);
  const app = config.apps[appName];
  if (!app) throw new Error(`App not found: ${appName}`);
  const entry = registry[processKey];

  let discoveredPort: number | null = null;
  if (entry?.pid) {
    try { discoveredPort = await discoverPort(entry.pid); } catch { discoveredPort = null; }
  }

  primeProviders(config);
  try { resolveProvider(config).stop(processKey); } catch { }

  if (entry && entry.pid) {
    if (process.platform !== 'win32') {
      try {
        process.kill(-entry.pid, 'SIGTERM');
      } catch {
        try { process.kill(entry.pid, 'SIGTERM'); } catch {}
      }
    }
    updateProcessState(registryPath, processKey, null);
    await new Promise(res => setTimeout(res, SIGTERM_GRACE_MS));
  }

  const effForPort = resolveEffective(app, { environment: environment ?? entry?.environment }, config);

  const ownPort = discoveredPort;
  const fallbackPort = entry?.port ?? effForPort.port;
  if (ownPort != null) {
    await killProcessOnPort(ownPort);
  } else if (fallbackPort != null) {
    const portInfo = await getProcessByPort(fallbackPort);
    if (portInfo.pid && (force || !entry || portInfo.pid === entry.pid)) {
      await killProcessOnPort(fallbackPort);
    }
  }
}

export async function stopApp(config: Config, appName: string, force = false, instanceId?: string): Promise<void> {
  const app = config.apps[appName];
  if (!app) throw new Error(`App not found: ${appName}`);

  const persistedSel = readSelections(getSelectionsPath(config))[appName];
  const { processKey, mode, instance } = resolveProcessKey(config, appName, instanceId, persistedSel);

  const stopEnvironment = mode === 'detached' && instance
    ? (instance.envOverride ?? persistedSel?.environment)
    : persistedSel?.environment;
  await stopProcessAtKey(config, appName, processKey, stopEnvironment, force);

  // Plugin hooks stay keyed by appName — see startApp above.
  try {
    await runPluginLifecycle(config, appName, 'onStop');
  } catch (err) {
    console.warn(`[plugins] onStop hook failed for "${appName}"`, err);
  }
}

export async function restartApp(config: Config, appName: string, instanceId?: string): Promise<void> {
  await stopApp(config, appName, false, instanceId);
  await startApp(config, appName, undefined, false, true, instanceId);
}
