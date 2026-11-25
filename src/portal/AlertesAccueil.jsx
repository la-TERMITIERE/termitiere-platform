// Alertes de la page d'accueil réunies en UN SEUL BANDEAU de verre : « À traiter : 2 demandes de salaire · 5 demandes d'accès · 1 prime… ».
// Un clic sur le bandeau ouvre la liste, rangée par sorte de demande (tuiles bento) ; chaque ligne a son bouton « Étudier » (qui ouvre la fiche où
// l'on valide ou refuse, motif obligatoire pour un refus) et, selon le cas, d'autres boutons (« Non », « Effectué »…). Une demande traitée
// disparaît d'elle-même du bandeau.
//   items : [{ id, categorie?, icone, couleur, titre, sous, action: { label, onClick, loading?, icone? }, action2?, fait?, onOpen? }]
//
// La CROIX masque le bandeau pour le moment seulement : il REVIENT au créneau suivant (avant midi, de midi à 16 h, après 16 h) tant que
// quelque chose reste à traiter, et tout de suite si une NOUVELLE demande arrive. Le masquage est propre à la personne et à l'appareil.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2, X, CheckCheck, BellRing, Search } from 'lucide-react'
import Modal from '../shared/ui/Modal'
import { icone3D, glassModalProps } from '../utils/color'
import { useAuth } from '../hooks/useAuth'

const DEBUTS_CRENEAUX = [0, 12, 16] // heures : avant midi, midi à 16 h, après 16 h

// Début du créneau de la journée où l'on se trouve.
export function debutCreneau(ts = Date.now()) {
  const d = new Date(ts)
  const h = d.getHours()
  d.setHours([...DEBUTS_CRENEAUX].reverse().find((x) => h >= x), 0, 0, 0)
  return d.getTime()
}
// Quand le bandeau masqué maintenant reviendra (pour l'infobulle de la croix).
export const prochainRappel = (ts = Date.now()) => { const h = new Date(ts).getHours(); return h < 12 ? 'à midi' : h < 16 ? 'à 16 h' : 'demain matin' }

// Sortes de demandes : libellé au singulier et au pluriel, pour le résumé du bandeau.
const CATEGORIES = {
  salaire: ['demande de salaire', 'demandes de salaire'],
  mission: ['ordre de mission', 'ordres de mission'],
  avance: ['avance ou prêt', 'avances et prêts'],
  prime: ['prime', 'primes'],
  decaisse: ['décaissement', 'décaissements'],
  paiement: ['paiement à confirmer', 'paiements à confirmer'],
  annonce: ['annonce', 'annonces'],
  acces: ["demande d'accès", "demandes d'accès"],
  echeance: ['échéance RH', 'échéances RH'],
  autre: ['alerte', 'alertes']
}
const categorieDe = (it) => (it.categorie && CATEGORIES[it.categorie] ? it.categorie : (CATEGORIES[String(it.id).split('_')[0]] ? String(it.id).split('_')[0] : 'autre'))
const libelleCategorie = (cat, n) => `${n} ${CATEGORIES[cat][n > 1 ? 1 : 0]}`

const cle = (uid, titre) => `bandeau_ferme:${uid || 'anonyme'}:${titre}`
const lire = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* stockage indisponible : le masquage ne survit pas au rechargement */ } }

export default function AlertesAccueil({ items, titre = 'À traiter' }) {
  const uid = useAuth((s) => s.user?.uid)
  const [ouvert, setOuvert] = useState(false)
  const [ferme, setFerme] = useState(() => lire(cle(uid, titre)))
  const [maintenant, setMaintenant] = useState(() => Date.now())
  // Le créneau change en cours de session : on réévalue régulièrement pour que le bandeau revienne seul, sans recharger la page.
  useEffect(() => { const t = setInterval(() => setMaintenant(Date.now()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { setFerme(lire(cle(uid, titre))) }, [uid, titre])

  const groupes = useMemo(() => {
    const map = new Map()
    items.forEach((it) => {
      const c = categorieDe(it)
      if (!map.has(c)) map.set(c, { cat: c, icone: it.icone, couleur: it.couleur, items: [] })
      map.get(c).items.push(it)
    })
    return [...map.values()]
  }, [items])

  if (!items.length) return null
  // Masqué pour ce créneau, sauf si une demande nouvelle est apparue depuis.
  const dejaVues = new Set(ferme?.ids || [])
  const masque = ferme && ferme.ts >= debutCreneau(maintenant) && items.every((it) => dejaVues.has(it.id))

  const fermer = (e) => {
    e.stopPropagation()
    const v = { ts: Date.now(), ids: items.map((it) => it.id) }
    setFerme(v)
    ecrire(cle(uid, titre), v)
  }
  // Une action qui ouvre une fiche ferme d'abord la liste, pour que la fiche passe au premier plan.
  const agir = (fn, garderOuvert = false) => { if (!garderOuvert) setOuvert(false); fn() }

  return (
    <>
      {!masque && (
        <section aria-label={titre} className="ed-entree mb-5">
          <div role="button" tabIndex={0} onClick={() => setOuvert(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOuvert(true) } }}
            className="group relative flex cursor-pointer flex-wrap items-center gap-3 overflow-hidden rounded-[1.75rem] border border-white/70 p-3 pr-2 shadow-[0_18px_36px_-22px_rgba(120,30,20,0.55),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-2xl backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-20px_rgba(120,30,20,0.6),inset_0_1px_0_rgba(255,255,255,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BC3C31]/40 dark:border-white/10 sm:flex-nowrap sm:p-3.5"
            style={{ background: 'linear-gradient(110deg, rgba(188,60,49,0.16) 0%, rgba(255,255,255,0.66) 42%, rgba(255,255,255,0.5) 100%)' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent dark:from-white/10" />
            <span aria-hidden="true" className="pointer-events-none absolute -left-12 top-0 h-full w-10 -skew-x-12 bg-white/50 opacity-0 blur-sm transition-all duration-700 group-hover:left-[105%] group-hover:opacity-100" />
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={icone3D('#BC3C31')}>
              <BellRing size={20} aria-hidden="true" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black tabular-nums text-white">{items.length}</span>
            </span>
            <div className="relative min-w-0 flex-1 basis-56">
              <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <span className="relative flex h-2 w-2" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
                {titre}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {groupes.map((g) => (
                  <span key={g.cat} className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/75 py-0.5 pl-1 pr-2.5 text-[12px] font-extrabold text-gray-700 shadow-[0_4px_10px_-6px_rgba(0,0,0,0.35)]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full" style={icone3D(g.couleur)}>{g.icone ? <g.icone size={11} aria-hidden="true" /> : null}</span>
                    {libelleCategorie(g.cat, g.items.length)}
                  </span>
                ))}
              </div>
            </div>
            <span className="relative inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-extrabold text-white shadow-[0_8px_16px_-8px_rgba(188,60,49,0.8),inset_0_1px_0_rgba(255,255,255,0.45)]"
              style={{ background: 'linear-gradient(145deg, #d4574b, #BC3C31)' }}>
              <Search size={13} aria-hidden="true" />Voir les demandes<ChevronRight size={13} aria-hidden="true" />
            </span>
            <button type="button" onClick={fermer} aria-label={`Masquer le bandeau : il revient ${prochainRappel(maintenant)}, ou dès qu'une nouvelle demande arrive`}
              title={`Masquer : revient ${prochainRappel(maintenant)}, ou dès qu'une nouvelle demande arrive`}
              className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/80 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <Modal open={ouvert} onClose={() => setOuvert(false)} size="lg" title={`${titre} (${items.length})`} {...glassModalProps('#BC3C31')}>
        <div className="grid gap-3">
          {groupes.map((g, gi) => (
            <section key={g.cat} className="ed-entree overflow-hidden rounded-3xl border border-white/80 bg-white/55 shadow-[0_12px_26px_-18px_rgba(26,26,26,0.45),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl" style={{ animationDelay: `${gi * 60}ms` }}>
              <h3 className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-extrabold text-gray-800" style={{ background: `linear-gradient(110deg, ${g.couleur}24, transparent 70%)` }}>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={icone3D(g.couleur)}>{g.icone ? <g.icone size={15} aria-hidden="true" /> : null}</span>
                <span className="first-letter:uppercase">{libelleCategorie(g.cat, g.items.length)}</span>
              </h3>
              <ul className="divide-y divide-white/70">
                {g.items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 basis-52">
                      <span className="block text-[13px] font-extrabold leading-tight text-gray-800 dark:text-gray-100">{it.titre}</span>
                      <span className="block text-[11px] leading-snug text-gray-600 dark:text-gray-400">{it.sous}</span>
                    </span>
                    {it.action2 && (
                      <button type="button" title={it.action2.title || it.action2.label} onClick={() => agir(it.action2.onClick)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/80 bg-white/75 px-2.5 py-1.5 text-xs font-bold text-gray-600 shadow-[0_6px_12px_-8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all hover:bg-white hover:text-gray-900 active:scale-95">
                        {it.action2.icone && <it.action2.icone size={12} aria-hidden="true" />}{it.action2.label}
                      </button>
                    )}
                    {it.fait && (
                      <button type="button" title={it.fait.title || 'Marquer comme effectué : ne sera plus rappelé à personne'} onClick={() => agir(it.fait.onClick, true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50/90 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 active:scale-95">
                        <CheckCheck size={13} aria-hidden="true" />{it.fait.label || 'Effectué'}
                      </button>
                    )}
                    <button type="button" disabled={it.action.loading} onClick={() => agir(it.action.onClick, !!it.action.garderOuvert)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-white shadow-[0_6px_12px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.45)] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-70"
                      style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${it.couleur} 78%, white), ${it.couleur})` }}>
                      {it.action.loading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : (it.action.icone ? <it.action.icone size={13} aria-hidden="true" /> : <Search size={13} aria-hidden="true" />)}{it.action.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Modal>
    </>
  )
}
