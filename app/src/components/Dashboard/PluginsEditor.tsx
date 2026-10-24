import { ChipListEditor } from './ChipListEditor'

export function PluginsEditor({
  plugins,
  allPlugins,
  onChange,
}: {
  plugins: Record<string, Record<string, unknown>>
  allPlugins: { id: string; name: string }[]
  onChange: (next: Record<string, Record<string, unknown>>) => Promise<void> | void
}) {
  const nameById = (id: string) => allPlugins.find((p) => p.id === id)?.name ?? id
  const addable = allPlugins
    .filter((p) => !(p.id in plugins))
    .map((p) => ({ key: p.id, label: p.name ?? p.id }))

  return (
    <ChipListEditor
      selectedKeys={Object.keys(plugins)}
      chipLabel={nameById}
      addable={addable}
      onAdd={(id) => {
        if (!id) return
        onChange({ ...plugins, [id]: {} })
      }}
      onRemove={(id) => {
        const next = { ...plugins }
        delete next[id]
        onChange(next)
      }}
      addButtonLabel="+ Add plugin"
      searchPlaceholder="Search…"
      hideAddWhenEmpty
    />
  )
}
