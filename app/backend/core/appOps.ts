import type { Config, AppSelection, AppStatus, ProcessRegistry, StatusContext } from '../../shared/types';

export interface AppOps {
  getAppStatus(config: Config, appName: string, registry: ProcessRegistry, ctx?: StatusContext): Promise<AppStatus>;
  makeStatusContext(config: Config): StatusContext;
  startApp(config: Config, appName: string, sel?: AppSelection, force?: boolean): Promise<void>;
  stopApp(config: Config, appName: string, force?: boolean): Promise<void>;
  restartApp(config: Config, appName: string): Promise<void>;
  runProcessInTmux(config: Config, command: string, cwd?: string, window?: string): Promise<void>;
}

let impl: AppOps | undefined;

export function registerAppOps(ops: AppOps): void {
  impl = ops;
}

/**
 * Resolved lazily, only inside request/lifecycle-time closures — never at
 * module-eval time — so the impl is always registered by the time it runs.
 */
export function getAppOps(): AppOps {
  if (!impl) {
    throw new Error(
      'AppOps not registered: import backend/apps/appManager before using plugin runtime/lifecycle'
    );
  }
  return impl;
}
