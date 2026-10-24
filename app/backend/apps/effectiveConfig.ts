import { sidecarPath } from '../config/statePaths';
import { Config, AppConfig } from '../../shared/types';
import { AppSelection } from '../process/selections';
import { scanProject } from '../config/scan';
import { resolveEnvFilter, filterScriptNames } from '../../shared/envFilter';
import { decideLinkage, detachedProcessKey, LinkageDecision } from '../../shared/linkage';
import { getInstancesPath, readInstances, InstanceRecord } from '../process/instances';
import { ProcessConflict, ProcessRegistry } from '../../shared/runtime.types';

const SELECTIONS_FILENAME = 'selections.json';


export function getSelectionsPath(config: Config): string {
  return sidecarPath(config, SELECTIONS_FILENAME);
}

interface Effective {
  environmentKey?: string;
  startCommand?: string;
  port?: number;
  repoPath?: string;
  repoUrl?: string;
  appUrl?: string;
}

/**
 * `config` is optional so existing call sites that only pass (app, selection)
 * keep compiling. Without it, the global environment-filter regex simply
 * doesn't apply (per-app `environmentFilter.filterRegex` still does, since
 * that comes from `app` alone) — callers should be updated to thread `config`
 * through once they're ready to opt into the global filter.
 */
export function resolveEffective(
  app: AppConfig,
  selection: AppSelection | undefined,
  config?: Config
): Effective {
  let scriptNames: string[] = [];
  let scriptCommands = new Map<string, string>();

  if (app.repoPath) {
    try {
      const scan = scanProject(app.repoPath, config ?? ({} as Config));
      scriptNames = scan.scripts.map((s) => s.name);
      scriptCommands = new Map(scan.scripts.map((s) => [s.name, s.startCommand]));
    } catch {
      // No package.json (or it's unreadable/oversized) at repoPath: treat the
      // worktree as having no scripts and fall back to app.startCommand below,
      // rather than blocking launch.
    }
  }

  const { regex } = resolveEnvFilter(config?.global?.environmentFilterRegex, app.environmentFilter);
  const filtered = filterScriptNames(scriptNames, regex);
  // An invalid persisted regex must not block launch: fall through to all
  // discovered script names instead of erroring out.
  const matched = filtered.ok ? filtered.matched : scriptNames;

  const requested = selection?.environment;
  const selectedName = requested && matched.includes(requested) ? requested : matched[0];

  const startCommand = selectedName ? scriptCommands.get(selectedName) : app.startCommand;

  return {
    environmentKey: selectedName,
    startCommand: startCommand ?? app.startCommand,
    port: undefined,
    repoPath: app.repoPath,
    repoUrl: app.repoUrl,
    appUrl: app.appUrl,
  };
}

/**
 * Resolves what a specific instance would launch with: the app's own
 * selection, but with `environment` swapped for the instance's override when
 * it has one. With no override this is identical to `resolveEffective(app,
 * appSelection, config)` — this is the "instance's own resolved environment"
 * input the linkage decision (backend/process/linkage.ts) compares against
 * the app's default.
 */
export function resolveEffectiveForInstance(
  app: AppConfig,
  appSelection: AppSelection | undefined,
  instanceEnvOverride: string | undefined,
  config?: Config
): Effective {
  if (instanceEnvOverride === undefined) return resolveEffective(app, appSelection, config);
  return resolveEffective(app, { ...appSelection, environment: instanceEnvOverride }, config);
}

export interface ResolvedProcessKey extends LinkageDecision {
  instance?: InstanceRecord;
}

/**
 * The one place that turns (config, appName, instanceId, the app's own
 * selection) into an actual process identifier — the I/O-and-config glue
 * around the pure `decideLinkage` decision, shared by every runtime call site
 * (lifecycleOps, statusService, routes) so none of them re-derive
 * linked/detached on their own. `instanceId` absent (the implicit default
 * row) always resolves to `{ mode: 'linked', processKey: appName }` without
 * touching the instances sidecar at all.
 */
export function resolveProcessKey(
  config: Config,
  appName: string,
  instanceId: string | undefined,
  appSelection: AppSelection | undefined
): ResolvedProcessKey {
  const app = config.apps[appName];
  if (!app || !instanceId) {
    return { mode: 'linked', processKey: appName };
  }
  const instances = readInstances(getInstancesPath(config));
  const instance = instances[instanceId];
  if (!instance || instance.appName !== appName) {
    return { mode: 'linked', processKey: appName };
  }
  const appEnvironment = resolveEffective(app, appSelection, config).environmentKey;
  const instanceEnvironment = resolveEffectiveForInstance(app, appSelection, instance.envOverride, config).environmentKey;
  return {
    ...decideLinkage({ appName, instanceId, appEnvironment, instanceEnvironment }),
    instance,
  };
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Task-4's orphan-process safety net, factored out here (rather than
 * duplicated in lifecycleOps.ts's start-time check and statusService.ts's
 * read-only surfacing) so both call sites agree on what counts as "a live
 * process left behind under this instance's other identity". Returns
 * undefined in the overwhelmingly common case: no instance, nothing live
 * left behind, or (see below) the instance currently resolving detached.
 *
 * Iteration-2 fix: this only ever checks the DETACHED key
 * (`appName#instanceId`), never the plain `appName` key, and only when the
 * instance currently resolves LINKED (`processKey === appName`). The
 * detached key is exclusively this instance's own by construction — no
 * other instance or the original app can ever produce it — so a live
 * process found there is unambiguously a leftover from a previous
 * detached→linked switch of THIS SAME instance. The plain `appName` key,
 * by contrast, is shared by the original app and every other linked
 * instance; a live process there is the original just doing its normal
 * thing and is NEVER an orphan attributable to this instance — checking it
 * from the detached side was the iteration-1 bug: it flagged a false
 * conflict on a brand-new detached instance's very first start merely
 * because the original happened to be running, which is the ADR's headline
 * "clone on its own env runs alongside a live original" scenario and must
 * never prompt. Because this reads the registry fresh on every call (no
 * cached flag), the conflict also self-clears the moment the leftover
 * process is actually stopped — no separate "clear" step needed.
 */
export function detectOrphanConflict(
  appName: string,
  instanceId: string | undefined,
  processKey: string,
  registry: ProcessRegistry,
  label: string
): ProcessConflict | undefined {
  if (!instanceId || processKey !== appName) return undefined;
  const otherKey = detachedProcessKey(appName, instanceId);
  const otherEntry = registry[otherKey];
  if (otherEntry?.pid && isPidAlive(otherEntry.pid)) {
    return { processKey, otherProcessKey: otherKey, label };
  }
  return undefined;
}
