import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error('copy failed:', e)
    }
  }

  return (
    <button
      type="button"
      className="iconBtn copyBtn"
      title={copied ? 'Copied' : `Copy ${label}`}
      aria-label={`Copy ${label}`}
      onClick={() => { void handleClick() }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
