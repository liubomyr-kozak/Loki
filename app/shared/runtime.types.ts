export interface AppSelection {
  environment?: string;
}

export interface ProcessState {
  pid: number;
  port?: number;
  startedAt: string;
  environment?: string;
  session?: string;
}

export interface ProcessRegistry {
  [appName: string]: ProcessState;
}

export interface StatusContext {
  selections?: Record<string, AppSelection>;
  sessionSnapshot?: unknown;
  primed?: boolean;
}

export type AppRunState = 'running' | 'stopped' | 'port-conflict' | 'unhealthy' | 'unknown';

export interface AppStatus {
  name: string;
  label: string;
  process: AppRunState;
  port?: number;
  branch?: string;
  commit?: string;
  dirty?: boolean;
  hasStashForBranch?: boolean;
  selectedEnvironment?: string;
  runningEnvironment?: string;
  session?: string;
  sessionAlive?: boolean;
  repoUrl?: string;
  appUrl?: string;
  // Present only when this status describes a specific instance (clone)
  // rather than the app's own default row — `name` always stays the app
  // name, this is what distinguishes which instance's runtime state is
  // being reported (relevant once the instance is detached and has its own
  // process; see backend/process/linkage.ts).
  instanceId?: string;
  // Set when a live process is still registered under this instance's OTHER
  // possible processKey — i.e. its linked/detached status just changed and
  // left a process running under the identity it used to have. Reuses the
  // shape the existing group-membership drift conflict established: enough
  // info to render a confirm/keep/cancel dialog (see AppRowModals /
  // GitCheckoutConfirm), resolved with an explicit verb on the next start
  // call rather than silently reconciled here.
  conflict?: ProcessConflict;
}

export interface ProcessConflict {
  processKey: string;
  otherProcessKey: string;
  label: string;
}
