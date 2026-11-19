// Magasin Blobs en mémoire pour les tests : mêmes sémantiques (onlyIfNew, onlyIfMatch, list),
// avec de petits délais aléatoires pour entrelacer les opérations concurrentes.
const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3))

export class MemoryStore {
  constructor() {
    this.data = new Map()
    this.n = 0
  }
  async get(key, { type } = {}) {
    await tick()
    const e = this.data.get(key)
    if (!e) return null
    return type === 'json' ? JSON.parse(e.v) : e.v
  }
  async getWithMetadata(key, { type } = {}) {
    await tick()
    const e = this.data.get(key)
    if (!e) return null
    return { data: type === 'json' ? JSON.parse(e.v) : e.v, etag: e.etag, metadata: e.meta || {} }
  }
  async setJSON(key, value, opts = {}) {
    return this.set(key, JSON.stringify(value), opts)
  }
  async set(key, value, opts = {}) {
    await tick()
    const cur = this.data.get(key)
    if (opts.onlyIfNew && cur) return { modified: false }
    if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false }
    const etag = `"${++this.n}"`
    this.data.set(key, { v: value, etag, meta: opts.metadata })
    return { modified: true, etag }
  }
  async delete(key) {
    await tick()
    this.data.delete(key)
  }
  async list({ prefix = '', directories = false } = {}) {
    await tick()
    const keys = [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort()
    if (!directories) return { blobs: keys.map((key) => ({ key, etag: this.data.get(key).etag })), directories: [] }
    const dirs = new Set()
    const blobs = []
    for (const k of keys) {
      const rest = k.slice(prefix.length)
      const i = rest.indexOf('/')
      if (i >= 0) dirs.add(prefix + rest.slice(0, i))
      else blobs.push({ key: k, etag: this.data.get(k).etag })
    }
    return { blobs, directories: [...dirs] }
  }
}
