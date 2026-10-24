import { Play, Square, RotateCcw, ExternalLink, Terminal, Zap, Flag, Wrench, GitBranch, Puzzle, Download, Upload, RefreshCw, Archive } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  play: Play,
  square: Square,
  'rotate-ccw': RotateCcw,
  'external-link': ExternalLink,
  terminal: Terminal,
  zap: Zap,
  flag: Flag,
  wrench: Wrench,
  'git-branch': GitBranch,
  download: Download,
  upload: Upload,
  'refresh-cw': RefreshCw,
  archive: Archive,
}

export const FALLBACK_ICON: LucideIcon = Puzzle
