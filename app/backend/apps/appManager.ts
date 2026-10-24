export { primeProviders } from './providerRegistry';
export { resolveEffective, resolveProcessKey } from './effectiveConfig';
export { getAppStatus, makeStatusContext } from './statusService';
export type { StatusContext } from './statusService';
export { startApp, stopApp, restartApp } from './lifecycleOps';
export { getAttachCommand, focusAttachedSession, listSessions, runShellCommand, runProcessInTmux } from './sessionOps';
export type { SessionInfo } from './sessionOps';
export { resolveEffectiveForApp } from './templateContext';

import { getAppStatus, makeStatusContext } from './statusService';
import { startApp, stopApp, restartApp } from './lifecycleOps';
import { runProcessInTmux } from './sessionOps';
import { registerAppOps } from '../core/appOps';

registerAppOps({ getAppStatus, makeStatusContext, startApp, stopApp, restartApp, runProcessInTmux });
