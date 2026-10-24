import { ImageOff } from 'lucide-react'

// DynamicIcon's fallback is a bare zero-prop function — size/color never reach it
// (DynamicIcon spreads ...props to the resolved icon, not the fallback). A local
// zero-prop component is the only way to size the placeholder here.
export function IconFallback() {
  return <ImageOff size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
}
