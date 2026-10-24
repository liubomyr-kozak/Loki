import type { ControlDescriptor, PluginContext } from '../../app/shared/types';
import { buildTemplateContext, requireAppContext } from '../_shared/pluginContext';

/** This plugin's own id — used as the key for its host-persisted per-app state. */
const PLUGIN_ID = 'proxy-toggle';

export function describe(ctx: PluginContext): ControlDescriptor {
  const { status, appSurface } = requireAppContext(ctx);
  const checked = !!ctx.host.readState(PLUGIN_ID, status.name);
  return {
    action: 'toggle',
    surface: appSurface,
    label: 'proxy',
    // icon must be an ICON_MAP name (see wiki)
    icon: 'zap',
    title: 'Demo custom toggle — runs a command on change',
    visible: true,
    checked,
  };
}

export function invoke(ctx: PluginContext, input: Record<string, unknown>): Promise<void> {
  const { status } = requireAppContext(ctx);
  const checked = !!input.checked;
  ctx.host.writeState(PLUGIN_ID, checked, status.name);
  const command = ctx.host.template('echo proxy {name} {toggleState}', {
    ...buildTemplateContext(ctx),
    toggleState: checked ? 'on' : 'off',
  });
  return ctx.host.runProcess(command, { window: `plugin-proxy-toggle-${status.name}` });
}
