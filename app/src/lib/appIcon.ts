import { iconNames } from 'lucide-react/dynamic'
import type { AppConfig } from '../api'

export type IconName = (typeof iconNames)[number]

export const ICON_NAME_SET: ReadonlySet<IconName> = new Set(iconNames)

export function isIconName(v: string): v is IconName {
  return ICON_NAME_SET.has(v as IconName)
}

export type EffectiveIcon = { kind: 'library'; name: IconName } | { kind: 'placeholder' }

export function resolveAppIcon(icon: AppConfig['icon'] | undefined): EffectiveIcon {
  if (!icon) return { kind: 'placeholder' }
  if (!isIconName(icon)) return { kind: 'placeholder' }
  return { kind: 'library', name: icon }
}
