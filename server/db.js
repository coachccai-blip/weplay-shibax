// Accès à Netlify Blobs.
// - Lectures en cohérence forte (état vivant à jour immédiatement).
// - Créations avec `onlyIfNew` (un seul appel gagne).
// - Mises à jour par écriture conditionnelle sur l'ETag (`onlyIfMatch`) : jamais de mise à jour perdue.
import { getStore } from '@netlify/blobs'
import { HttpError } from './http.js'

export const STORE_NAME = 'weplay-shibax'
export const SKIP = Symbol('skip')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function openStore() {
  const region = process.env.SHX_BLOBS_REGION
  return getStore({ name: STORE_NAME, consistency: 'strong', ...(region ? { region } : {}) })
}

export class Db {
  constructor(store = openStore()) {
    this.store = store
  }

  /** Lit un document JSON (null s'il n'existe pas). */
  async get(key) {
    return this.store.get(key, { type: 'json' })
  }

  /** Lit un document JSON avec son ETag. */
  async getE(key) {
    const r = await this.store.getWithMetadata(key, { type: 'json' })
    return r ? { data: r.data, etag: r.etag } : null
  }

  async put(key, value) {
    await this.store.setJSON(key, value)
  }

  /** Crée une clé seulement si elle n'existe pas. Vrai si cet appel l'a créée. */
  async create(key, value) {
    const r = await this.store.setJSON(key, value, { onlyIfNew: true })
    return r.modified
  }

  /** Écriture conditionnelle : réussit seulement si l'ETag n'a pas changé. */
  async putIfMatch(key, value, etag) {
    if (!etag) {
      await this.store.setJSON(key, value)
      return { modified: true }
    }
    return this.store.setJSON(key, value, { onlyIfMatch: etag })
  }

  async del(key) {
    await this.store.delete(key)
  }

  /** Liste les clés sous un préfixe (toutes les pages). */
  async keys(prefix) {
    const r = await this.store.list({ prefix })
    return r.blobs.map((b) => b.key)
  }

  /** Liste les « dossiers » directement sous un préfixe. */
  async dirs(prefix) {
    const r = await this.store.list({ prefix, directories: true })
    return r.directories.map((d) => (d.endsWith('/') ? d.slice(0, -1) : d))
  }

  async getBytes(key) {
    return this.store.getWithMetadata(key, { type: 'arrayBuffer' })
  }

  async createBytes(key, data, metadata) {
    const r = await this.store.set(key, data, { metadata, onlyIfNew: true })
    return r.modified
  }

  /**
   * Lecture-modification-écriture sans perte : relit et rejoue en cas de conflit.
   * `fn(draft, isNew)` modifie le brouillon (ou en renvoie un nouveau) ; renvoyer SKIP annule l'écriture.
   * Une erreur levée dans `fn` interrompt l'opération.
   */
  async mutate(key, fn, { create, attempts = 10 } = {}) {
    for (let i = 0; i < attempts; i++) {
      const cur = await this.getE(key)
      let draft
      if (cur) draft = structuredClone(cur.data)
      else if (create) draft = create()
      else return { value: null, changed: false, missing: true }
      const out = await fn(draft, !cur)
      if (out === SKIP) return { value: cur ? cur.data : null, changed: false }
      const next = out === undefined ? draft : out
      next._rev = (cur?.data?._rev || 0) + 1
      const res = cur
        ? await this.putIfMatch(key, next, cur.etag)
        : await this.store.setJSON(key, next, { onlyIfNew: true })
      if (res.modified) return { value: next, changed: true, previous: cur ? cur.data : null }
      await sleep(Math.min(300, 12 * 2 ** i) * (0.5 + Math.random()))
    }
    throw new HttpError(503, 'busy', 'Beaucoup d’activité en ce moment, réessaie dans un instant.')
  }
}

/** Exécute `fn` sur chaque élément avec une concurrence limitée ; conserve l'ordre. */
export async function pMap(items, fn, concurrency = 16) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/** Petit cache mémoire par instance (TTL court), pour les profils et comptes. */
export class TtlCache {
  constructor(ttlMs, max = 500) {
    this.ttl = ttlMs
    this.max = max
    this.map = new Map()
  }
  get(key) {
    const e = this.map.get(key)
    if (!e) return undefined
    if (Date.now() - e.at > this.ttl) {
      this.map.delete(key)
      return undefined
    }
    return e.value
  }
  set(key, value) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value)
    this.map.set(key, { value, at: Date.now() })
  }
  delete(key) {
    this.map.delete(key)
  }
}
