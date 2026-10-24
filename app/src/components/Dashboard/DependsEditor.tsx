import { ChipListEditor } from './ChipListEditor'

export function DependsEditor({
  names,
  allApps,
  onChange,
}: {
  names: string[]
  allApps: Record<string, { label: string }>
  onChange: (next: string[]) => Promise<void> | void
}) {
  const addable = Object.keys(allApps)
    .filter((k) => !names.includes(k))
    .map((k) => ({ key: k, label: allApps[k]?.label ?? k }))

  return (
    <ChipListEditor
      selectedKeys={names}
      chipLabel={(k) => allApps[k]?.label ?? k}
      addable={addable}
      onAdd={(dep) => { if (!dep) return; onChange([...names, dep]) }}
      onRemove={(dep) => onChange(names.filter((n) => n !== dep))}
      addButtonLabel="+ Add dependency"
      searchPlaceholder="Search…"
      hideAddWhenEmpty
    />
  )
}
