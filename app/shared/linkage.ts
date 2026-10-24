// Pure linkage rules shared by the backend and frontend. No Node dependencies.
export type LinkageMode = 'linked' | 'detached';

export interface LinkageDecision {
  mode: LinkageMode;
  // The identifier used downstream to key a process for this instance: the
  // plain app identity when linked, an identity that also carries the
  // instance's identity when detached.
  processKey: string;
}

export interface LinkageInputs {
  appName: string;
  // undefined = the implicit default row (the original itself) — always
  // linked, regardless of environments.
  instanceId?: string;
  // Already-resolved environment the app's own default selection would
  // launch with.
  appEnvironment?: string;
  // Already-resolved environment this instance would launch with (only
  // meaningful when it has its own override; pass the same value as
  // `appEnvironment` — or leave undefined — when it doesn't).
  instanceEnvironment?: string;
}

// The process identifier a detached instance uses. Exported so nothing else
// has to know or reconstruct this format — in particular, task-4's orphan
// check (`possibleProcessKeys`) reuses it instead of inlining the string.
export function detachedProcessKey(appName: string, instanceId: string): string {
  return `${appName}#${instanceId}`;
}

export function decideLinkage(inputs: LinkageInputs): LinkageDecision {
  const { appName, instanceId, appEnvironment, instanceEnvironment } = inputs;
  if (!instanceId || instanceEnvironment === undefined || instanceEnvironment === appEnvironment) {
    return { mode: 'linked', processKey: appName };
  }
  return { mode: 'detached', processKey: detachedProcessKey(appName, instanceId) };
}

// Every process identifier this instance could currently or previously have
// used — i.e. both the linked and the detached key. Used by task-4's orphan
// detection to look for a live process left over under "the other" key after
// a linked/detached flip.
export function possibleProcessKeys(appName: string, instanceId?: string): string[] {
  return instanceId ? [appName, detachedProcessKey(appName, instanceId)] : [appName];
}
