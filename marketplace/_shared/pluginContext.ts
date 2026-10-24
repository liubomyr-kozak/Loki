import type {
  AppConfig,
  AppStatus,
  AppSurface,
  PluginContext,
  TemplateContext,
} from '../../app/shared/types';

/** Narrows a PluginContext to its app-scoped shape, or throws for global-scope contexts. */
export function requireAppContext(
  ctx: PluginContext
): { app: AppConfig; status: AppStatus; appSurface: AppSurface } {
  if (ctx.scope !== 'app') {
    throw new Error('plugin requires app-scoped context');
  }
  return { app: ctx.app, status: ctx.status, appSurface: ctx.appSurface };
}

/** Builds the template-substitution context for the current app/status row. */
export function buildTemplateContext(ctx: PluginContext): TemplateContext {
  const { app, status } = requireAppContext(ctx);
  // Environments are derived from the selected git branch at runtime, so the
  // live values come off the status row; AppConfig only carries the statics.
  return {
    name: status.name,
    port: status.port,
    environment: status.selectedEnvironment,
    branch: status.branch,
    appUrl: status.appUrl ?? app.appUrl,
    repoPath: app.repoPath,
  };
}
