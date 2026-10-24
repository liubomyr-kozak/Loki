// The Loki glyph from the app icon (icons/source/loki-icon.svg), drawn in
// the theme accent so the header mark matches the icon and the tint.
export function LokiMark({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="lokiMark"
      width={size}
      height={size}
      viewBox="252 312 520 444"
      fill="none"
      stroke="currentColor"
      strokeWidth={56}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M282 342H742L512 726Z" />
      <path d="M410 342L512 520L614 342" />
    </svg>
  )
}
