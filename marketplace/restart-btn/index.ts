import type { ControlDescriptor, PluginContext } from '../../app/shared/types';
import { requireAppContext } from '../_shared/pluginContext';

export function describe(ctx: PluginContext): ControlDescriptor {
  const { status, appSurface } = requireAppContext(ctx);
  const process = status.process;
  return {
    action: 'button',
    surface: appSurface ?? 'list',
    label: 'restart',
    icon: 'rotate-ccw',
    confirm: 'Restart?',
    visible: process === 'running' || process === 'port-conflict',
  };
}

export function invoke(ctx: PluginContext): Promise<void> {
  return ctx.host.apps.restart(requireAppContext(ctx).status.name);
}
