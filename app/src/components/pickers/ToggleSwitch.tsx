export interface ToggleSwitchProps {
  label: string
  title: string
  checked: boolean
  disabled?: boolean
  unmanaged: boolean
  onChange: (checked: boolean) => void
}

export function ToggleSwitch({ label, title, checked, disabled, unmanaged, onChange }: ToggleSwitchProps) {
  return (
    <label
      className={`switch${unmanaged ? ' unmanaged' : ''}`}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="slider" />
      <span className="switchLabel">{label}</span>
    </label>
  )
}
