// E-TACHES, Pilotage : périodes, découpage en tranches et calculs d'évolution (repris de l'ancienne application, mêmes règles).
import { todayStr } from '../../utils/formatters'

export const MODES_PERIODE = [
  { id: 'all', label: 'Tout' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: '30 derniers jours' },
  { id: 'quarter', label: 'Ce trimestre' },
  { id: 'year', label: 'Cette année' },
  { id: 'custom', label: 'Personnalisée' }
]

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseYmd = (s) => { const p = String(s || '').split('-'); return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])) : null }
export const joursEntre = (a, b) => Math.floor((new Date(b) - new Date(a)) / 86400000)

// Date à laquelle la tâche a été confiée (création ; à défaut le début ou l'échéance).
export const dateAttribution = (t) => (t.createdAt ? ymd(new Date(t.createdAt)) : t.dateDebut || t.dateLimite || '')

// Bornes { from, to } d'une période ; null = sans borne.
export function bornesPilotage({ mode, from, to }) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  let a = null, b = null
  if (mode === 'week') { const j = now.getDay() || 7; a = new Date(now); a.setDate(now.getDate() - (j - 1)); b = new Date(a); b.setDate(a.getDate() + 6) }
  else if (mode === 'month') { a = new Date(now); a.setDate(now.getDate() - 29); b = new Date(now) }
  else if (mode === 'quarter') { const q = Math.floor(now.getMonth() / 3); a = new Date(now.getFullYear(), q * 3, 1); b = new Date(now.getFullYear(), q * 3 + 3, 0) }
  else if (mode === 'year') { a = new Date(now.getFullYear(), 0, 1); b = new Date(now.getFullYear(), 11, 31) }
  else if (mode === 'custom') { a = parseYmd(from); b = parseYmd(to) }
  return { from: a ? ymd(a) : null, to: b ? ymd(b) : null }
}

export function filtrerParPeriode(taches, periode) {
  const { from, to } = bornesPilotage(periode)
  if (!from && !to) return taches.slice()
  return taches.filter((t) => { const d = dateAttribution(t); return !!d && (!from || d >= from) && (!to || d <= to) })
}

function numeroSemaine(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const n = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - n)
  return Math.ceil((((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)
}

// Tranches du graphique : jours (≤ 14 j), semaines (≤ 90 j) ou mois ; six derniers mois quand la période est ouverte.
export function tranches(periode) {
  const { from, to } = bornesPilotage(periode)
  const out = []
  if (!from || !to) {
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d1 = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const d2 = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      out.push({ label: d1.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }), from: ymd(d1), to: ymd(d2) })
    }
    return out
  }
  const debut = parseYmd(from), fin = parseYmd(to)
  const jours = Math.round((fin - debut) / 86400000) + 1
  if (jours <= 0) return out
  if (jours <= 14) {
    for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) out.push({ label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), from: ymd(d), to: ymd(d) })
  } else if (jours <= 90) {
    for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 7)) {
      const e = new Date(d); e.setDate(d.getDate() + 6); if (e > fin) e.setTime(fin.getTime())
      out.push({ label: `S${numeroSemaine(d)} ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`, from: ymd(d), to: ymd(e) })
    }
  } else {
    for (let d = new Date(debut.getFullYear(), debut.getMonth(), 1); d <= fin; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      out.push({ label: d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }), from: ymd(d < debut ? debut : d), to: ymd(dernier > fin ? fin : dernier) })
    }
  }
  return out
}

// Une ligne par tranche : créées, terminées, échues non finies, démarrage tardif, taux de complétion.
export function serieEvolution(taches, periode, jour = todayStr()) {
  return tranches(periode).map((b) => {
    const dedans = taches.filter((t) => { const d = dateAttribution(t); return d >= b.from && d <= b.to })
    const terminees = taches.filter((t) => t.statut === 'Terminé' && t.dateCloture && t.dateCloture >= b.from && t.dateCloture <= b.to).length
    const echues = taches.filter((t) => t.statut !== 'Terminé' && t.dateLimite && t.dateLimite >= b.from && t.dateLimite <= b.to).length
    const tardif = dedans.filter((t) => t.statut === 'À faire' && t.dateDebut && t.dateDebut <= jour).length
    return { label: b.label, creees: dedans.length, terminees, echues, tardif, taux: dedans.length ? Math.round((terminees * 100) / dedans.length) : null }
  })
}

export function plafond(v) {
  if (v <= 5) return 5
  if (v <= 10) return 10
  if (v <= 20) return 20
  if (v <= 50) return 50
  if (v <= 100) return 100
  const m = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / m) * m
}
