// Détail des recettes du mois d'un secteur (au clic sur le KPI « Recettes du mois ») : réalisé, objectif, reste à réaliser et liste des recettes.
import { useNavigate } from 'react-router-dom'
import { Wallet, Target, TrendingUp, TrendingDown, Percent, ArrowRight, CalendarDays } from 'lucide-react'
import Modal from '../../shared/ui/Modal'
import Button from '../../shared/ui/Button'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import { glassModalProps, icone3D } from '../../utils/color'
import { formatMoney } from '../../utils/formatters'
import { useQuotas, useRealiseMois, avancement, etatAvancement, texteEcart } from './quotas'

// `lien` : { to, label } : bouton qui mène au volet du module où ces recettes se saisissent (paiements, factures…).
// « 27 octobre 2026 » en toutes lettres, avec le jour de la semaine (« Mardi 27 octobre »).
const jourLong = (d) => {
  const t = new Date(`${d}T12:00:00`)
  if (Number.isNaN(t.getTime())) return d
  const txt = t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

// « Paiement : Naël AKPAKPO (Garde Naël semaine du 19 au 23/10/26) » devient { type: 'Paiement', nom: 'Naël AKPAKPO', detail: 'Garde Naël semaine du 19 au 23/10/26' }.
const decouper = (libelle) => {
  const texte = libelle || 'Recette'
  const [tete, ...reste] = texte.split(' : ')
  const type = reste.length ? tete : ''
  const corps = reste.length ? reste.join(' : ') : texte
  const m = corps.match(/^(.*?)\s*\((.*)\)\s*$/)
  return m ? { type, nom: m[1] || corps, detail: m[2] } : { type, nom: corps, detail: '' }
}

export default function DetailRecettesModal({ poleId, couleur = '#16a34a', titre = 'Recettes du mois', lien, onClose }) {
  const navigate = useNavigate()
  const { quotas } = useQuotas()
  const { realise, precedent, details } = useRealiseMois(poleId)
  const diff = realise - precedent
  const cible = quotas[poleId] || 0
  const pct = avancement(realise, cible)
  const etat = etatAvancement(pct)
  const ecart = cible - realise
  // Recettes regroupées par jour (la plus récente d'abord), avec le sous-total de chaque jour.
  const jours = []
  details.forEach((o) => {
    let g = jours[jours.length - 1]
    if (!g || g.date !== o.date) { g = { date: o.date, lignes: [], total: 0 }; jours.push(g) }
    g.lignes.push(o)
    g.total += Number(o.montant) || 0
  })
  return (
    <Modal open onClose={onClose} size="lg" title={titre} {...glassModalProps(couleur)}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
        {lien && <Button onClick={() => { onClose(); navigate(lien.to) }} style={{ backgroundColor: couleur }}>{lien.label} <ArrowRight size={16} /></Button>}
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <TuileVerre icone={Wallet} couleur={couleur} titre="Recettes réalisées" valeur={formatMoney(realise)} sous={`${details.length} recette${details.length > 1 ? 's' : ''}`} />
          <TuileVerre icone={Target} couleur={cible > 0 ? '#64748b' : '#94a3b8'} titre="Objectif du mois" valeur={cible > 0 ? formatMoney(cible) : 'Non fixé'} sous={cible > 0 ? undefined : 'À régler dans Paramètres'} />
          {cible > 0 && <TuileVerre icone={Percent} couleur={etat.couleur} titre="Atteint" valeur={`${Math.round(pct)} %`} sous={etat.libelle} />}
          {cible > 0 && <TuileVerre icone={TrendingUp} couleur={ecart > 0 ? '#f59e0b' : '#16a34a'} titre={ecart > 0 ? 'Reste à réaliser' : 'Objectif dépassé de'} valeur={formatMoney(Math.abs(ecart))} />}
          <TuileVerre className="col-span-2" icone={diff >= 0 ? TrendingUp : TrendingDown} couleur={diff >= 0 ? '#16a34a' : '#dc2626'} titre="Écart avec le mois précédent" valeur={texteEcart(diff)} sous={`Mois précédent, à la même date : ${formatMoney(precedent)}`} />
        </div>
        {details.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune recette enregistrée ce mois-ci.</p>
        ) : (
          <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
            {jours.map((g, gi) => (
              <section key={g.date} className="ed-entree" style={{ animationDelay: `${Math.min(gi, 8) * 50}ms` }}>
                {/* En-tête du jour : date, nombre de recettes et sous-total. */}
                <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                  <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(couleur)}><CalendarDays size={12} /></span>
                    {jourLong(g.date)}
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-black/5">{g.lignes.length}</span>
                  </p>
                  <span className="text-xs font-extrabold text-gray-700">{formatMoney(g.total)}</span>
                </div>
                <div className="space-y-1.5">
                  {g.lignes.map((o, i) => {
                    const l = decouper(o.libelle)
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><Wallet size={16} /></span>
                        <div className="min-w-0 flex-1">
                          {l.type && <p className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: couleur }}>{l.type}</p>}
                          <p className="truncate text-sm font-semibold text-gray-800">{l.nom}</p>
                          {l.detail && <p className="line-clamp-2 text-[11px] leading-snug text-gray-500">{l.detail}</p>}
                        </div>
                        <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-extrabold text-green-700 ring-1 ring-green-100">{formatMoney(o.montant)}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
            <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/80 px-4 py-2.5 shadow-sm">
              <span className="text-xs font-extrabold uppercase tracking-wide text-gray-500">Total du mois</span>
              <span className="text-base font-black text-gray-800">{formatMoney(realise)}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
