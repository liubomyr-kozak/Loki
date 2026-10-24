import { Config, AppStatus, ProcessRegistry, StatusContext } from '../../shared/types';
import { isPortOpen } from '../ports/portUtils';
import { getGitInfo } from '../git/gitUtils';
import { hasStashForBranch } from '../git/gitStashStore';
import { readSelections, AppSelection } from '../process/selections';
import { resolveProvider } from './sessionProvider';
import { resolveEffective, resolveProcessKey, detectOrphanConflict, getSelectionsPath } from './effectiveConfig';
import { primeProviders } from './providerRegistry';

export type { StatusContext };

export function makeStatusContext(config: Config): StatusContext {
  primeProviders(config);
  const selections = readSelections(getSelectionsPath(config));
  const sessionSnapshot = resolveProvider(config).snapshot?.();
  return { selections, sessionSnapshot, primed: true };
}

export async function getAppStatus(
  config: Config,
  appName: string,
  registry: ProcessRegistry,
  ctx?: StatusContext,
  instanceId?: string
): Promise<AppStatus> {
  const app = config.apps[appName];
  if (!app) throw new Error(`App not found: ${appName}`);
  const status: AppStatus = {
    name: appName,
    label: app.label,
    process: 'unknown',
  };
  if (instanceId) status.instanceId = instanceId;

  const selections = ctx?.selections ?? readSelections(getSelectionsPath(config));
  const persistedSelection = selections[appName];

  // No instance (or an instance that isn't detached) resolves to
  // `{ mode: 'linked', processKey: appName }` — every registry/session
  // lookup below then lands on exactly the same keys as before this task,
  // which is the byte-identical no-instance regression invariant.
  const resolved = resolveProcessKey(config, appName, instanceId, persistedSelection);
  const processKey = resolved.processKey;
  const regEntry = registry[processKey];

  // Surface a leftover process under this instance's OTHER identity even on
  // a plain status read, not just at start time — lets the row show the
  // conflict proactively. Undefined in the common case (no instance, or
  // nothing live under the other key).
  const conflict = detectOrphanConflict(appName, instanceId, processKey, registry, app.label);
  if (conflict) status.conflict = conflict;

  // A detached instance's port/branch/session/environment must reflect ITS
  // OWN resolved environment (the instance's override), not the original
  // app's — a linked instance (or the default row) keeps reading the app's
  // own selection exactly as today.
  const instanceEnvironment = resolved.mode === 'detached' && resolved.instance
    ? (resolved.instance.envOverride ?? persistedSelection?.environment)
    : persistedSelection?.environment;
  const instanceSelection: AppSelection = { environment: instanceEnvironment };
  const portSelection: AppSelection = { environment: instanceEnvironment ?? regEntry?.environment };

  const effForPort = resolveEffective(app, portSelection, config);
  const port = regEntry?.port ?? effForPort.port;
  status.port = port;
  if (!ctx?.primed) primeProviders(config);
  const provider = resolveProvider(config);

  const snap = ctx?.sessionSnapshot;
  const state = provider.sessionState?.(processKey, snap);
  const present = state ? state.present : provider.sessionAlive(processKey, snap);
  const dead = state?.dead ?? false;
  const statePid = state?.pid ?? null;

  status.session = provider.getAttachCommand(processKey) ?? undefined;
  status.sessionAlive = present;

  let portOpen = false;
  if (port != null) {
    portOpen = await isPortOpen(port);
  }

  let pidAlive = false;
  if (regEntry?.pid) {
    try {
      process.kill(regEntry.pid, 0);
      pidAlive = true;
    } catch {
      pidAlive = false;
    }
  }

  // PID-reuse guard: if the live session's PID differs from the registry
  // PID, the registry entry is stale — treat the registered process as gone.
  if (present && regEntry?.pid && statePid != null && statePid !== regEntry.pid) {
    pidAlive = false;
  }

  const ownedAlive = (present && !dead) || pidAlive;
  if (present && dead) {
    status.process = 'unhealthy';
  } else if (ownedAlive) {
    status.process = 'running';
  } else if (portOpen && regEntry) {
    status.process = 'port-conflict';
  } else {
    status.process = 'stopped';
  }

  try {
    if (effForPort.repoPath) {
      const info = await getGitInfo(effForPort.repoPath);
      status.branch = info.branch;
      status.commit = info.commit;
      status.dirty = info.dirty;
      status.hasStashForBranch = info.branch
        ? hasStashForBranch(config, effForPort.repoPath, info.branch)
        : false;
    }
  } catch {
  }

  const eff = resolveEffective(app, instanceSelection, config);

  status.selectedEnvironment = eff.environmentKey;
  status.runningEnvironment = status.process === 'running' ? regEntry?.environment : undefined;
  status.repoUrl = eff.repoUrl;
  status.appUrl = eff.appUrl;

  return status;
}
