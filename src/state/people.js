// Annuaire des membres connus (pseudo, shiba, photo) : sert à afficher la photo de chacun
// partout (messages, jeux, classements), même quand la donnée d'origine n'a que l'identifiant.
import { signal } from '@preact/signals'

export const people = signal({})

export function rememberPeople(list) {
  if (!list?.length) return
  const next = { ...people.value }
  let changed = false
  for (const p of list) {
    if (!p?.id) continue
    const prev = next[p.id]
    const merged = { ...prev, ...p }
    if (!prev || prev.photoUrl !== merged.photoUrl || prev.pseudo !== merged.pseudo || prev.coat !== merged.coat || JSON.stringify(prev.acc) !== JSON.stringify(merged.acc)) {
      next[p.id] = merged
      changed = true
    }
  }
  if (changed) people.value = next
}
