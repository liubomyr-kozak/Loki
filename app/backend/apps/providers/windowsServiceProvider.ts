import { registerProvider, SessionProvider, Availability } from '../sessionProvider';
import { makePlaceholderProvider } from './initServiceProvider';

function availability(): Availability {
  return { available: false, reason: 'Windows Services require Windows.', unsupportedPlatform: process.platform !== 'win32' };
}

export const windowsServiceProvider: SessionProvider = makePlaceholderProvider(
  {
    id: 'windows-service',
    label: 'Windows Service',
    description: 'Runs each app as a Windows Service, managed via sc.exe.',
    icon: 'app-window',
    platforms: ['win32'],
    benefits: ['Survives logout', 'Managed via sc.exe', 'Not yet implemented'],
    notImplementedLabel: 'windowsServiceProvider',
  },
  availability
);

registerProvider(windowsServiceProvider);
