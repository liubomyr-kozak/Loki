import type { ControlDescriptor, PluginContext } from '../../app/shared/types';
import { buildTemplateContext, requireAppContext } from '../_shared/pluginContext';

export function describe(ctx: PluginContext): ControlDescriptor {
  // Context-menu entry only — exempt from app-placement adaptation (ADR
  // §6a carve-out): reached by right-clicking the row regardless of where
  // the app renders.
  return {
    action: 'button',
    surface: 'menu',
    label: 'Git log',
    icon: 'git-branch',
    visible: true,
  };
}

export function invoke(ctx: PluginContext): Promise<void> {
  const { status } = requireAppContext(ctx);
  const command = ctx.host.template('git -C {repoPath} log --oneline -20 | less', buildTemplateContext(ctx));
  return ctx.host.runProcess(command, { window: `plugin-git-log-${status.name}` });
}
