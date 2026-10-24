import { ChipListEditor } from './ChipListEditor'
import { ALL_ID } from '../../lib/constants'

export function GroupsEditor({
  groups,
  allGroups,
  onChange,
}: {
  groups: string[]
  allGroups: string[]
  onChange: (next: string[]) => Promise<void> | void
}) {
  const addable = allGroups
    .filter((g) => !groups.includes(g))
    .map((g) => ({ key: g, label: g }))

  return (
    <ChipListEditor
      selectedKeys={groups}
      chipLabel={(g) => g}
      addable={addable}
      onAdd={(g) => { if (!g) return; onChange([...groups, g]) }}
      onRemove={(g) => onChange(groups.filter((n) => n !== g))}
      addButtonLabel="+ Add group"
      searchPlaceholder="Search or create…"
      allowCreate
      hasExactMatch={(q) => allGroups.includes(q) || q === ALL_ID}
      createLabel={(q) => `Create "${q}"`}
    />
  )
}
