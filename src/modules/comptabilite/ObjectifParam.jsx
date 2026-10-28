// Réglage de l'objectif mensuel de recettes d'un secteur, à poser dans les Paramètres du module (cf. ParamsCarte).
// Le même objectif alimente le KPI « Recettes du mois » du tableau de bord du module et le Suivi journalier de la Comptabilité.
import { useEffect, useState } from 'react'
import { Target, Save, Eraser, Sparkles } from 'lucide-react'
import { ParamsCarte, TuileVerre, CHAMP_VERRE } from '../../shared/ui/ParamsVerre'
import { useAuth } from '../../hooks/useAuth'
import { isFullAccessRole } from '../../core/roles'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatMoney } from '../../utils/formatters'
import { POLES } from './journalCalculs'
import { useQuotas, useRealiseMois, fixerObjectif, avancement, etatAvancement } from './quotas'

const chiffres = (v) => String(v ?? '').replace(/\D/g, '')
const espace = (v) => (chiffres(v) ? Number(chiffres(v)).toLocaleString('fr-FR') : '')

export default function ObjectifParam({ poleId, couleur = '#ea580c', moduleId = 'comptabilite', large = true, index = 0, titre = 'Objectif de recettes du mois' }) {
  const { user, role } = useAuth()
  const { quotas, charge } = useQuotas()
  const { realise } = useRealiseMois(poleId)
  const enregistre = quotas[poleId] || 0
  const [valeur, setValeur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const peutModifier = isFullAccessRole(role)
  useEffect(() => { setValeur(enregistre ? String(enregistre) : '') }, [enregistre, charge, poleId])
  const propose = Number(chiffres(valeur)) || 0
  const pct = avancement(realise, propose)
  const etat = etatAvancement(pct)
  const secteur = POLES.find((p) => p.id === poleId)?.label || poleId

  async function enregistrer() {
    setEnvoi(true)
    try {
      await fixerObjectif(poleId, propose, user)
      await audit(moduleId, 'OBJECTIF', `Objectif mensuel de recettes ${secteur} : ${propose.toLocaleString('fr-FR')} FCFA`)
      toast.success(propose ? 'Objectif enregistré ✓' : 'Objectif retiré ✓')
    } catch (e) { toast.error(e.message) } finally { setEnvoi(false) }
  }

  return (
    <ParamsCarte index={index} icone={Target} couleur={couleur} large={large} titre={titre}
      sous="Le montant de recettes que le secteur doit atteindre chaque mois. Il s'affiche sur le tableau de bord du module et dans la Comptabilité."
      droite={enregistre > 0 && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3 py-1 text-xs font-extrabold text-gray-700 shadow-sm"><Sparkles size={13} style={{ color: couleur }} /> {formatMoney(enregistre)} / mois</span>}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <label className="mb-1 block text-[11px] font-extrabold uppercase tracking-wide text-gray-500">Objectif mensuel</label>
          <div className="relative">
            <input inputMode="numeric" value={espace(valeur)} onChange={(e) => setValeur(chiffres(e.target.value))} disabled={!peutModifier}
              placeholder="Aucun objectif" aria-label="Objectif mensuel de recettes" className={`w-full pr-24 text-right ${CHAMP_VERRE} disabled:opacity-60`} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">FCFA / mois</span>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">Laissez vide pour ne pas fixer d'objectif.{!peutModifier && ' Seule l\'administration peut le modifier.'}</p>
        </div>
        <TuileVerre icone={Target} couleur={propose > 0 ? etat.couleur : '#94a3b8'} titre="Recettes de ce mois"
          valeur={formatMoney(realise)} sous={propose > 0 ? `${Math.round(pct)} % de l'objectif · ${etat.libelle}` : "Pas d'objectif fixé"} />
      </div>
      {peutModifier && (
        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
          {propose > 0 && (
            <button type="button" onClick={() => setValeur('')} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-white/80 hover:text-red-500">
              <Eraser size={14} /> Retirer
            </button>
          )}
          <button type="button" onClick={enregistrer} disabled={propose === enregistre || envoi}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_20px_-10px_rgba(0,0,0,0.5)] transition-all enabled:hover:-translate-y-0.5 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${couleur}, ${couleur}cc)` }}>
            <Save size={16} /> {envoi ? 'Enregistrement…' : "Enregistrer l'objectif"}
          </button>
        </div>
      )}
    </ParamsCarte>
  )
}
ObjectifParam.accepteRang = true
