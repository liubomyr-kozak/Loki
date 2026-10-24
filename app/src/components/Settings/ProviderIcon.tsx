import { Box, Cog, Layers, MonitorCog, SquareTerminal } from 'lucide-react'

export function ProviderIcon({ icon, id }: { icon: string; id: string }) {
  const key = (icon || id || '').toLowerCase()
  switch (key) {
    case 'square-terminal':
    case 'terminal':
    case 'tmux':
      return <SquareTerminal size={18} />
    case 'layers':
    case 'detached':
    case 'process':
      return <Layers size={18} />
    case 'settings-2':
    case 'init-service':
    case 'service':
    case 'systemd':
    case 'launchd':
      return <Cog size={18} />
    case 'app-window':
    case 'windows-service':
    case 'windows':
      return <MonitorCog size={18} />
    default:
      return <Box size={18} />
  }
}
