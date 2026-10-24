import type { ControlDescriptor, PluginContext } from '../../app/shared/types';
import { buildTemplateContext, requireAppContext } from '../_shared/pluginContext';

export function describe(ctx: PluginContext): ControlDescriptor {
  const surface = ctx.appSurface ?? 'list';
  const { status } = requireAppContext(ctx);
  return {
    action: 'button',
    surface,
    label: 'site',
    icon: 'external-link',
    visible: status.process === 'running' || status.process === 'port-conflict',
  };
}

export function invoke(ctx: PluginContext): Promise<void> {
  const url = ctx.host.template('http://localhost:{port}', buildTemplateContext(ctx));
  return ctx.host.openUrl(url);
}
