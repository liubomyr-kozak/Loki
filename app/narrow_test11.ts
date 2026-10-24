type A = { surface: string; action: 'a' }
type B = { surface: string; action: 'b' }
type Group = { kind: 'group'; surface: string }
declare const desc: A | B | Group
if ('kind' in desc) {
} else {
  const y: A | B = desc
}
