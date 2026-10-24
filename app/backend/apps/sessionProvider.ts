import { Config } from '../../shared/types';

export interface StartArgs {
  name: string;
  startCommand: string;
  repoPath: string;
  shell: string;
  env: NodeJS.ProcessEnv;
  port?: number;
  environment?: string;
}

export interface SessionInfo {
  name: string;
  alive: boolean;
  target?: string;
}

export interface SessionState {
  present: boolean;
  dead: boolean;
  pid: number | null;
}

export type SessionSnapshot = unknown;

export interface GetAttachCommandOpts {
  /** Kept for API compatibility; tmux no longer uses iTerm's -CC control mode. */
  controlMode?: boolean;
}

export type Platform = 'darwin' | 'linux' | 'win32';

export interface Availability {
  available: boolean;
  reason: string;
  unsupportedPlatform?: boolean;
}

export type ProviderSettingFieldKind = 'text' | 'path' | 'select' | 'boolean';

export interface ProviderSettingField {
  key: string;
  label: string;
  desc?: string;
  kind?: ProviderSettingFieldKind;
  options?: { value: string; label: string }[];
  advanced?: boolean;
  copyable?: boolean;
}

export interface SessionProvider {
  id: string;
  label: string;
  description: string;
  icon: string;
  platforms: Platform[];
  recommended: boolean;
  benefits: string[];
  advancedDescription?: string;
  availability(opts?: { bypassCache?: boolean }): Availability;
  start(a: StartArgs): { pid: number; session?: string };
  stop(name: string): void;
  listSessions(): SessionInfo[];
  sessionAlive(name: string, snapshot?: SessionSnapshot): boolean;
  getAttachCommand(name: string, opts?: GetAttachCommandOpts): string | null;
  settings?: ProviderSettingField[];

  snapshot?(): SessionSnapshot;
  sessionState?(name: string, snapshot?: SessionSnapshot): SessionState;
  setSessionLabel?(name: string, label: string): void;
  runCommand?(windowLabel: string, cwd: string, shell: string, command: string): void;
  /**
   * When a terminal is already attached to this provider's session, switch it
   * to `name` and return true, so the caller focuses that terminal instead of
   * opening another window.
   */
  focusExisting?(name: string): boolean;
}

const providers: SessionProvider[] = [];

export function registerProvider(p: SessionProvider): void {
  if (providers.some(existing => existing.id === p.id)) return;
  providers.push(p);
}

export function getProviders(): SessionProvider[] {
  return providers.slice();
}

export function resolveProvider(config?: Config | null): SessionProvider {
  const preferredId = config?.global?.sessionProvider;
  if (preferredId) {
    const preferred = providers.find(p => p.id === preferredId);
    if (preferred && preferred.availability().available) return preferred;
  }
  const fallback = providers.find(p => p.availability().available);
  if (fallback) return fallback;
  throw new Error(
    'No session provider available. Import a provider module (e.g. "./providers/detachedProvider") before resolving one.'
  );
}

export function computeRecommendedId(): string | undefined {
  const platform = process.platform as Platform;
  const hostRecommended = providers.find(
    p => p.platforms.includes(platform) && p.recommended && p.availability().available
  );
  if (hostRecommended) return hostRecommended.id;
  const fallback = providers.find(p => p.availability().available);
  return fallback?.id;
}

export interface ProviderMetaEntry {
  id: string;
  label: string;
  description: string;
  icon: string;
  platforms: Platform[];
  recommended: boolean;
  benefits: string[];
  advancedDescription: string;
  available: boolean;
  unavailableReason?: string;
  settings: ProviderSettingField[];
}

export function listProviderMeta(config?: Config | null): {
  providers: ProviderMetaEntry[];
  activeId: string;
  recommendedId?: string;
} {
  const meta: ProviderMetaEntry[] = providers.map(p => {
    const avail = p.availability();
    return {
      id: p.id,
      label: p.label,
      description: p.description,
      icon: p.icon,
      platforms: p.platforms,
      recommended: p.recommended,
      benefits: p.benefits,
      advancedDescription: p.advancedDescription ?? 'Advanced settings for this provider.',
      available: avail.available,
      unavailableReason: avail.available ? undefined : avail.reason,
      settings: p.settings ?? [],
    };
  });
  const active = resolveProvider(config);
  return { providers: meta, activeId: active.id, recommendedId: computeRecommendedId() };
}
