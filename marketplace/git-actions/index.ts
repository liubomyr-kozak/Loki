import { execFileSync } from 'child_process';
import type { ControlDescriptor, PluginContext, PluginDescriptor, Surface } from '../../app/shared/types';
import { requireAppContext, buildTemplateContext } from '../_shared/pluginContext';

/** Shape of `app.plugins['git-actions']`. */
interface GitActionsAppConfig {
  placement?: 'group' | 'popup' | 'menu'; // default 'group'
  confirm?: {
    stashPush?: boolean; // default true
    pull?: boolean;      // default false
    push?: boolean;      // default false
    fetch?: boolean;     // default false
  };
}

type ActionId = 'fetch' | 'pull' | 'push' | 'stash-push';

interface ActionDef {
  id: ActionId;
  label: string;
  icon: string;
  gitArgs: string[];
  confirmLabel: string;
}

const ACTIONS: ActionDef[] = [
  { id: 'fetch', label: 'Fetch', icon: 'refresh-cw', gitArgs: ['fetch'], confirmLabel: 'Fetch?' },
  { id: 'pull', label: 'Pull', icon: 'download', gitArgs: ['pull'], confirmLabel: 'Pull?' },
  { id: 'push', label: 'Push', icon: 'upload', gitArgs: ['push'], confirmLabel: 'Push?' },
  { id: 'stash-push', label: 'Stash push', icon: 'archive', gitArgs: ['stash', 'push'], confirmLabel: 'Stash?' },
];

function confirmEnabled(cfg: GitActionsAppConfig | undefined, id: ActionId): boolean {
  switch (id) {
    case 'fetch': return cfg?.confirm?.fetch ?? false;
    case 'pull': return cfg?.confirm?.pull ?? false;
    case 'push': return cfg?.confirm?.push ?? false;
    case 'stash-push': return cfg?.confirm?.stashPush ?? true;
  }
}

/**
 * Synchronous dirty check, deliberately not `getGitInfo` from
 * backend/git/gitUtils.ts: that helper is async (execFile-based), but
 * `describe()` runs synchronously (pluginDescriptorService calls
 * `mod.describe(ctx)` without awaiting) — an async describe() would hand
 * back a Promise where a descriptor object is expected and fail validation.
 */
function isDirtySync(repoPath: string): boolean {
  try {
    const out = execFileSync('git', ['-C', repoPath, 'status', '--porcelain'], { encoding: 'utf-8' });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function buildItems(surface: Surface, cfg: GitActionsAppConfig | undefined, title: string, visible: boolean): ControlDescriptor[] {
  return ACTIONS.map((action) => ({
    id: action.id,
    action: 'button',
    surface,
    label: action.label,
    title,
    icon: action.icon,
    visible,
    confirm: confirmEnabled(cfg, action.id) ? action.confirmLabel : undefined,
  }));
}

export function describe(ctx: PluginContext): PluginDescriptor {
  const { app, appSurface } = requireAppContext(ctx);
  const cfg = app.plugins?.['git-actions'] as GitActionsAppConfig | undefined;
  const placement = cfg?.placement ?? 'group';
  const surface: Surface = placement === 'menu' ? 'menu' : (appSurface ?? 'list');

  const hasRepo = !!app.repoPath;
  const dirty = hasRepo ? isDirtySync(app.repoPath!) : false;
  const title = hasRepo ? (dirty ? 'Uncommitted changes' : 'Clean working tree') : '';

  const items = buildItems(surface, cfg, title, hasRepo);
  const mode = (surface === 'list' && placement === 'popup') ? 'popup' : 'buttons';

  return {
    kind: 'group',
    surface,
    label: 'Git',
    icon: 'git-branch',
    visible: items.some((item) => item.visible),
    mode,
    items,
  };
}

export async function invoke(ctx: PluginContext, input: Record<string, unknown>): Promise<void> {
  const { status } = requireAppContext(ctx);
  const actionId = input.action as ActionId | undefined;
  const action = ACTIONS.find((a) => a.id === actionId);
  if (!action) throw new Error(`git-actions: unknown action "${String(actionId)}"`);

  const command = ctx.host.template(`git -C {repoPath} ${action.gitArgs.join(' ')}`, buildTemplateContext(ctx));
  await ctx.host.runProcess(command, { window: `plugin-git-actions-${status.name}-${action.id}` });
}
