import { registerProvider, SessionProvider, StartArgs, SessionInfo, Availability, Platform } from '../sessionProvider';

export interface PlaceholderProviderMeta {
  id: string;
  label: string;
  description: string;
  icon: string;
  platforms: Platform[];
  benefits: string[];
  notImplementedLabel: string;
}

export function makePlaceholderProvider(meta: PlaceholderProviderMeta, availability: () => Availability): SessionProvider {
  function notImplemented(): never {
    throw new Error(`${meta.notImplementedLabel}: not implemented`);
  }

  function start(_a: StartArgs): { pid: number; session?: string } {
    notImplemented();
  }

  function stop(_name: string): void {
    notImplemented();
  }

  function runCommand(_windowLabel: string, _cwd: string, _shell: string, _command: string): void {
    notImplemented();
  }

  function listSessions(): SessionInfo[] {
    return [];
  }

  function sessionAlive(_name: string): boolean {
    return false;
  }

  function getAttachCommand(): string | null {
    return null;
  }

  return {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    platforms: meta.platforms,
    recommended: false,
    benefits: meta.benefits,
    availability,
    start,
    stop,
    listSessions,
    sessionAlive,
    getAttachCommand,
    runCommand,
    settings: [],
  };
}

function availability(): Availability {
  return { available: false, reason: 'Not yet implemented — coming in a future release.' };
}

export const initServiceProvider: SessionProvider = makePlaceholderProvider(
  {
    id: 'init-service',
    label: 'Init service',
    description: 'Runs each app as a systemd (Linux) or launchd (macOS) service that survives logout.',
    icon: 'settings-2',
    platforms: ['darwin', 'linux'],
    benefits: ['Survives logout', 'Managed by the host init system', 'Not yet implemented'],
    notImplementedLabel: 'initServiceProvider',
  },
  availability
);

registerProvider(initServiceProvider);
