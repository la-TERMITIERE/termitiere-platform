// E-TACHES : moteur d'analyse par acteur et par niveau hiérarchique (repris de l'ancienne application, mêmes règles).
//   Toutes les mesures sont RAPPORTÉES À UNE FENÊTRE calendaire, sinon comparer une période à la précédente n'aurait aucun sens :
//   reçues = confiées pendant la fenêtre · livrées = clôturées pendant la fenêtre · taux = part des reçues terminées ·
//   ponctualité = part des livraisons dans les délais · manquées = échéances tombées dans la fenêtre sans tâche terminée ·
//   pilotées = tâches confiées à d'autres pendant la fenêtre.
import { todayStr } from '../../utils/formatters'
import { dateAttribution, joursEntre } from './pilotageCalculs'

// ── Niveaux hiérarchiques ───────────────────────────────────────────────────────────────────────────────────────
export const NIVEAUX = [
  { n: 1, code: 'PAU', label: 'PAU', full: 'Personne autorisée', desc: 'Sommet du circuit de décision et d\'autorisation.', color: '#5b2c8d' },
  { n: 2, code: 'GE', label: 'GE', full: 'Gérance exécutive', desc: 'Direction exécutive de l\'entreprise.', color: '#1557b0' },
  { n: 3, code: 'DIR', label: 'Directeurs', full: 'Les directeurs', desc: 'Directions métier (dont DF et DA-RH).', color: '#0a8043' },
  { n: 4, code: 'RP', label: 'Resp. pôles', full: 'Les responsables de pôle', desc: 'Encadrement intermédiaire : pôles, départements, chantiers.', color: '#b06000' },
  { n: 5, code: 'AUT', label: 'Autres', full: 'Les autres', desc: 'Agents et collaborateurs sans fonction d\'encadrement.', color: '#3c4043' },
  { n: 6, code: 'STA', label: 'Stagiaires', full: 'Les stagiaires', desc: 'Personnes en stage, quelle que soit la direction d\'accueil.', color: '#8430ce' }
]
export const niveauDef = (n) => NIVEAUX[Math.max(1, Math.min(6, Number(n) || 5)) - 1]

// Déduction du niveau à partir du rôle de la plateforme et du poste déclaré. L'ORDRE des tests est la règle métier :
// « stagiaire » l'emporte sur tout, puis le rôle, puis les intitulés de poste.
export function niveauAuto(p) {
  const poste = String(p?.poste || '').toLowerCase().trim()
  if (/stagiaire|\bstage\b/.test(poste)) return 6
  const role = p?.role
  if (role === 'pau') return 1
  if (role === 'ge') return 2
  if (['df', 'directeur', 'rh'].includes(role)) return 3
  if (['gerant', 'gerante_garderie', 'chef_projet', 'controleur', 'superviseur'].includes(role)) return 4
  if (/personne autoris/.test(poste)) return 1
  if (/g[ée]ran[tc][a-z]*\s+ex[ée]cuti|g[ée]rance\s+ex[ée]cutive/.test(poste)) return 2
  if (/directeur|directrice|\bdf\b|\bda-?rh\b|\bdg\b|\bpdg\b/.test(poste)) return 3
  if (/responsable|\bchef\b|superviseur|coordonnateur|coordinateur|g[ée]rant/.test(poste)) return 4
  return 5
}
// Niveau effectif : correction manuelle (collection taches_niveaux) sinon déduction.
export const niveauDe = (p, corrections = {}) => { const c = Number(corrections[p.uid]); return c >= 1 && c <= 6 ? c : niveauAuto(p) }

// ── Fenêtres calendaires ────────────────────────────────────────────────────────────────────────────────────────
export const UNITES = {
  week: { label: 'Semaine' }, month: { label: 'Mois' }, quarter: { label: 'Trimestre' }, semester: { label: 'Semestre' }, year: { label: 'Année' }
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function semaine(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const n = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - n)
  return Math.ceil((((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)
}
export function fenetre(unite, decalage = 0) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  let a, b, label, longLabel
  if (unite === 'month') {
    a = new Date(now.getFullYear(), now.getMonth() + decalage, 1); b = new Date(a.getFullYear(), a.getMonth() + 1, 0)
    label = a.toLocaleString('fr-FR', { month: 'short', year: '2-digit' }); longLabel = a.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })
  } else if (unite === 'quarter') {
    const q = Math.floor(now.getMonth() / 3) + decalage
    a = new Date(now.getFullYear(), q * 3, 1); b = new Date(a.getFullYear(), a.getMonth() + 3, 0)
    label = `T${a.getMonth() / 3 + 1} ${String(a.getFullYear()).slice(2)}`; longLabel = `trimestre ${a.getMonth() / 3 + 1} ${a.getFullYear()}`
  } else if (unite === 'semester') {
    const s = Math.floor(now.getMonth() / 6) + decalage
    a = new Date(now.getFullYear(), s * 6, 1); b = new Date(a.getFullYear(), a.getMonth() + 6, 0)
    const num = a.getMonth() / 6 + 1
    label = `${num === 1 ? '1er' : '2d'} sem. ${String(a.getFullYear()).slice(2)}`; longLabel = `${num === 1 ? '1er' : '2d'} semestre ${a.getFullYear()}`
  } else if (unite === 'year') {
    a = new Date(now.getFullYear() + decalage, 0, 1); b = new Date(now.getFullYear() + decalage, 11, 31)
    label = String(a.getFullYear()); longLabel = `année ${a.getFullYear()}`
  } else {
    const j = now.getDay() || 7
    a = new Date(now); a.setDate(now.getDate() - (j - 1) + decalage * 7); b = new Date(a); b.setDate(a.getDate() + 6)
    const c = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    label = `S${semaine(a)}`; longLabel = `semaine ${semaine(a)} (du ${c(a)} au ${c(b)})`
  }
  return { from: ymd(a), to: ymd(b), label, longLabel }
}
// Les `n` dernières fenêtres, de la plus ancienne à la période en cours.
export const fenetres = (unite, n = 6) => Array.from({ length: n }, (_, i) => fenetre(unite, -(n - 1 - i)))

// ── Statistiques d'un acteur sur une fenêtre ────────────────────────────────────────────────────────────────────
export function statsActeur(taches, uid, w, jour = todayStr()) {
  let recues = 0, terminees = 0, livrees = 0, ponctuelles = 0, manquees = 0, sommeDelai = 0, nDelai = 0, pilotees = 0, piloteesFinies = 0
  taches.forEach((t) => {
    const attribuee = dateAttribution(t)
    const dedans = !!attribuee && attribuee >= w.from && attribuee <= w.to
    if (t.destUid === uid) {
      if (dedans) { recues++; if (t.statut === 'Terminé') terminees++ }
      if (t.statut === 'Terminé' && t.dateCloture && t.dateCloture >= w.from && t.dateCloture <= w.to) {
        livrees++
        if (!t.dateLimite || t.dateCloture <= t.dateLimite) ponctuelles++
        if (attribuee) { sommeDelai += Math.max(0, joursEntre(attribuee, t.dateCloture)); nDelai++ }
      }
      if (t.statut !== 'Terminé' && t.dateLimite && t.dateLimite >= w.from && t.dateLimite <= w.to && t.dateLimite < jour) manquees++
    }
    if (dedans && t.parUid === uid && t.destUid !== uid) { pilotees++; if (t.statut === 'Terminé') piloteesFinies++ }
  })
  return {
    recues, terminees, livrees, manquees, pilotees, piloteesFinies, _ponctuelles: ponctuelles, _delaiSomme: sommeDelai, _delaiN: nDelai,
    taux: recues ? Math.round((terminees * 100) / recues) : 0, ponctualite: livrees ? Math.round((ponctuelles * 100) / livrees) : 0, delai: nDelai ? Math.round(sommeDelai / nDelai) : 0,
    innovation: 0, reflexion: 0, idees: 0, traces: 0
  }
}

// Somme d'un groupe : les taux se recalculent sur les totaux, ils ne se moyennent pas.
export function sommeStats(liste) {
  const a = { recues: 0, terminees: 0, livrees: 0, manquees: 0, pilotees: 0, piloteesFinies: 0, _ponctuelles: 0, _delaiSomme: 0, _delaiN: 0, innovation: 0, reflexion: 0, idees: 0, traces: 0 }
  liste.forEach((s) => Object.keys(a).forEach((k) => { a[k] += s[k] || 0 }))
  a.taux = a.recues ? Math.round((a.terminees * 100) / a.recues) : 0
  a.ponctualite = a.livrees ? Math.round((a._ponctuelles * 100) / a.livrees) : 0
  a.delai = a._delaiN ? Math.round(a._delaiSomme / a._delaiN) : 0
  return a
}

// ── Innovation et réflexion : comptées à partir des traces écrites ──────────────────────────────────────────────
//   💡 Innovation = 4×idée retenue + 2×idée à l'étude + 1×idée nouvelle ou écartée (statut d'aujourd'hui)
//   🧠 Réflexion  = 4×rapport + 2×objectif posé + 1×commentaire (tâche, idée, objectif)
const POIDS_INNOV = { 'Nouvelle': 1, 'À l\'étude': 2, 'Retenue': 4, 'Écartée': 1 }
const POIDS_REFLEX = { message: 1, idee_commentaire: 1, objectif_commentaire: 1, objectif: 2, rapport: 4 }
const jourDe = (ts) => (ts ? ymd(new Date(ts)) : '')

export function evenementsActivite({ messages = [], objectifs = [], rapports = [], idees = [] }) {
  const ev = []
  messages.forEach((m) => ev.push({ uid: m.uid, date: jourDe(m.ts || m.createdAt), kind: 'message' }))
  objectifs.forEach((o) => {
    ev.push({ uid: o.parUid, date: jourDe(o.createdAt), kind: 'objectif' })
    ;(o.commentaires || []).forEach((c) => ev.push({ uid: c.uid, date: jourDe(c.ts), kind: 'objectif_commentaire' }))
  })
  rapports.forEach((r) => ev.push({ uid: r.parUid, date: jourDe(r.ts || r.createdAt), kind: 'rapport' }))
  idees.forEach((i) => {
    ev.push({ uid: i.parUid, date: jourDe(i.createdAt), kind: 'idee', statut: i.statut })
    ;(i.commentaires || []).forEach((c) => ev.push({ uid: c.uid, date: jourDe(c.ts), kind: 'idee_commentaire' }))
  })
  return ev
}

export function scoresActivite(evenements, uid, w) {
  let innovation = 0, reflexion = 0, idees = 0, traces = 0
  evenements.forEach((e) => {
    if (e.uid !== uid || !e.date || e.date < w.from || e.date > w.to) return
    if (e.kind === 'idee') { innovation += POIDS_INNOV[e.statut] || 1; idees++ }
    if (POIDS_REFLEX[e.kind]) { reflexion += POIDS_REFLEX[e.kind]; traces++ }
  })
  return { innovation, reflexion, idees, traces }
}

// Statistiques complètes (tâches + activité) avec un cache par rendu.
export function creerCalculateur(taches, evenements, jour = todayStr()) {
  const memo = new Map()
  return (uid, w) => {
    const cle = `${uid}|${w.from}|${w.to}`
    if (!memo.has(cle)) memo.set(cle, { ...statsActeur(taches, uid, w, jour), ...scoresActivite(evenements, uid, w) })
    return memo.get(cle)
  }
}

// Score composite d'un directeur (sur 100) : complétion 50 %, pénalités de retard et de démarrage tardif.
export function scoreDirecteur({ assignees, enRetard, demarrageTardif, tauxCompletion }) {
  if (!assignees) return 50
  let s = tauxCompletion * 0.5 + 50
  s -= Math.min(30, enRetard * 2)
  s -= Math.min(20, demarrageTardif)
  return Math.max(0, Math.min(100, Math.round(s)))
}
