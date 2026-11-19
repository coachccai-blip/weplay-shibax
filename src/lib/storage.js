// Stockage local tolérant (navigation privée, stockage bloqué).

const memory = new Map()

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return memory.has(key) ? memory.get(key) : fallback
  }
}

export function save(key, value) {
  memory.set(key, value)
  try {
    if (value === null || value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stockage indisponible : on garde la valeur en mémoire */
  }
}
