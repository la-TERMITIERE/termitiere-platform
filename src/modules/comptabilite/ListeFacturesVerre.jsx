// Détail du chiffre d'affaires d'un module (au clic sur le KPI « Recettes du mois » ou « CA période ») : chiffres clés, puis les factures
// regroupées par jour, chacune sur une ligne en verre (client, numéro, détail éventuel, montant). Même langage visuel dans tous les modules.
//   items : [{ id, date, titre, sous, pastilles: [{ label, valeur }], extra, montant }]
//   poleId + avecObjectif : ajoute l'objectif du mois et le pourcentage atteint (à n'utiliser que sur le mois en cours).
import { Wallet, FileText, Target, Percent, CalendarDays } from 'lucide-react'
import { TuileVerre } from '../../shared/ui/ParamsVerre'
import { icone3D } from '../../utils/color'
import { formatMoney } from '../../utils/formatters'
import { useQuotas, useRealiseMois, avancement, etatAvancement } from './quotas'

// « Mardi 27 octobre » : jour de la semaine en toutes lettres.
const jourLong = (d) => {
  const t = new Date(`${d}T12:00:00`)
  if (Number.isNaN(t.getTime())) return d || 'Sans date'
  const txt = t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}

function TuilesObjectif({ poleId }) {
  const { quotas } = useQuotas()
  const { realise } = useRealiseMois(poleId)
  const cible = quotas[poleId] || 0
  if (!cible) return <TuileVerre className="col-span-2" icone={Target} couleur="#94a3b8" titre="Objectif du mois" valeur="Non fixé" sous="À régler dans Paramètres" />
  const pct = avancement(realise, cible)
  const etat = etatAvancement(pct)
  return (
    <>
      <TuileVerre icone={Target} couleur="#64748b" titre="Objectif du mois" valeur={formatMoney(cible)} />
      <TuileVerre icone={Percent} couleur={etat.couleur} titre="Atteint" valeur={`${Math.round(pct)} %`} sous={etat.libelle} />
    </>
  )
}

export default function ListeFacturesVerre({ items, couleur = '#16a34a', poleId, avecObjectif = false, vide = 'Aucune facture sur la période.', libelleTotal = "Chiffre d'affaires" }) {
  const lignes = [...items].sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : (a.date || '') > (b.date || '') ? -1 : 0))
  const total = lignes.reduce((s, o) => s + (Number(o.montant) || 0), 0)
  const jours = []
  lignes.forEach((o) => {
    let g = jours[jours.length - 1]
    if (!g || g.date !== o.date) { g = { date: o.date, lignes: [], total: 0 }; jours.push(g) }
    g.lignes.push(o)
    g.total += Number(o.montant) || 0
  })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <TuileVerre icone={Wallet} couleur={couleur} titre={libelleTotal} valeur={formatMoney(total)} />
        <TuileVerre icone={FileText} couleur="#64748b" titre="Factures" valeur={lignes.length} sous={jours.length ? `sur ${jours.length} jour${jours.length > 1 ? 's' : ''}` : undefined} />
        {avecObjectif && poleId && <TuilesObjectif poleId={poleId} />}
      </div>
      {lignes.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">{vide}</p>
      ) : (
        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
          {jours.map((g, gi) => (
            <section key={g.date || gi} className="ed-entree" style={{ animationDelay: `${Math.min(gi, 8) * 50}ms` }}>
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-gray-500">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={icone3D(couleur)}><CalendarDays size={12} /></span>
                  {jourLong(g.date)}
                  <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-black/5">{g.lignes.length}</span>
                </p>
                <span className="text-xs font-extrabold text-gray-700">{formatMoney(g.total)}</span>
              </div>
              <div className="space-y-1.5">
                {g.lignes.map((o, i) => (
                  <div key={o.id ?? i} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 px-3 py-2.5 shadow-[0_8px_18px_-14px_rgba(26,26,26,0.4),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={icone3D(couleur)}><FileText size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">{o.titre || '—'}</p>
                      {(o.sous || o.extra) && <p className="text-[11px] text-gray-500">{[o.sous, o.extra].filter(Boolean).join(' · ')}</p>}
                      {o.pastilles?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {o.pastilles.map((p, k) => (
                            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-black/5">
                              {p.label} <span className="font-extrabold" style={{ color: couleur }}>{p.valeur}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-extrabold text-green-700 ring-1 ring-green-100">{formatMoney(o.montant)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
