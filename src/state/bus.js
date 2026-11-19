// Petit relais entre modules (évite les imports circulaires) : demander une synchronisation immédiate.
export const bus = {
  syncNow: null,
}

export function syncSoon() {
  bus.syncNow?.()
}
