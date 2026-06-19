// Limite de requêtes côté client : referme la porte sur les rafales / bots qui
// passent par l'application (fenêtre glissante par « route » = collection + type).
// Note : c'est la 1re barrière (UX + abus accidentel). La barrière réseau contre
// les bots externes = Firebase App Check (cf. core/firebase.js).

const WINDOWS = {}
// Limites généreuses pour l'usage normal, mais qui cassent une rafale automatique.
const LIMITS = {
  write: { max: 40, perMs: 10000 },  // 40 écritures / 10 s par collection
  read:  { max: 120, perMs: 10000 }  // 120 lectures / 10 s par collection
}

export function checkRate(routeKey, kind = 'write') {
  const now = Date.now()
  const { max, perMs } = LIMITS[kind] || LIMITS.write
  const key = `${kind}:${routeKey}`
  const arr = (WINDOWS[key] || []).filter((t) => now - t < perMs)
  if (arr.length >= max) {
    const wait = Math.ceil((perMs - (now - arr[0])) / 1000)
    throw new Error(`Trop de requêtes (${routeKey}) — réessayez dans ${wait}s.`)
  }
  arr.push(now)
  WINDOWS[key] = arr
}
