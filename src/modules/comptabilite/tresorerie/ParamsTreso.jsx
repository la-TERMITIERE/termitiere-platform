// TRÉSORERIE — Paramètres : où atterrit l'argent de chaque secteur (et d'où sortent les
// dépenses), délai de paiement par défaut, seuil d'alerte global, tranches de la balance âgée.
import { useState } from 'react'
import { Settings, Plus, Trash2 } from 'lucide-react'
import Card from '../../../shared/ui/Card'
import Button from '../../../shared/ui/Button'
import { setItem } from '../../../core/db'
import { audit } from '../../../core/audit'
import { toast } from '../../../core/notifications'
import BandeauCompta from '../BandeauCompta'
import { useTresorerie } from './useTresorerie'
import { COL_TRESO, TRANCHES_DEFAUT } from './logic'
import { Champ, ChoixCompte } from './ui'
import { LIBELLE_SECTEUR } from '../../../shared/ventes'

const SITES = { logistique: ['lome', 'kara'], gym: ['lome', 'kara'] }
const AFFECTATIONS = [
  ...Object.entries(LIBELLE_SECTEUR).flatMap(([k, l]) => [
    { cle: k, label: `Ventes ${l}` },
    ...(SITES[k] || []).map((s) => ({ cle: `${k}:${s}`, label: `Ventes ${l} : site ${s === 'lome' ? 'Lomé' : 'Kara'}` }))
  ]),
  { cle: 'depense', label: 'Dépenses décaissées (E-DÉPENSES) et salaires' }
]

export default function ParamsTreso() {
  const { params, soldes, loading } = useTresorerie()
  const [v, setV] = useState(null)
  const cur = v || params
  const maj = (p) => setV({ ...cur, ...p })
  const enregistrer = async () => {
    const tranches = (cur.tranches || []).map((t) => ({ min: Number(t.min) || 0, max: t.max === '' || t.max === null || t.max === undefined ? null : Number(t.max), label: t.label || '' }))
    await setItem(COL_TRESO.params, 'config', { delaiPaiement: Number(cur.delaiPaiement) || 30, seuilAlerte: Number(cur.seuilAlerte) || 0, tranches, affectations: cur.affectations || {} })
    await audit('comptabilite', 'TRESORERIE', 'Paramètres de trésorerie modifiés')
    toast.success('Paramètres enregistrés ✓')
    setV(null)
  }
  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Settings} titre="Paramètres de trésorerie" sous="Affectation des recettes et des dépenses aux comptes, délai de paiement, seuil d'alerte, tranches de la balance âgée." />
      <Card>
        <p className="font-bold text-gray-800">Affectation aux comptes</p>
        <p className="mb-3 text-xs text-gray-500">Le compte qui reçoit les ventes encaissées de chaque secteur, et celui d'où sortent les dépenses. Sans choix : la caisse centrale. Un site sans choix suit son secteur.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {AFFECTATIONS.map((a) => (
            <Champ key={a.cle} label={a.label}><ChoixCompte comptes={soldes} value={cur.affectations?.[a.cle] || ''} onChange={(id) => maj({ affectations: { ...(cur.affectations || {}), [a.cle]: id } })} /></Champ>
          ))}
        </div>
      </Card>
      <Card>
        <div className="grid gap-3 md:grid-cols-2">
          <Champ label="Délai de paiement par défaut (jours)" aide="Échéance d'une vente à crédit sans échéance précisée."><input type="number" min="0" value={cur.delaiPaiement} onChange={(e) => maj({ delaiPaiement: e.target.value })} className="input-base" /></Champ>
          <Champ label="Seuil d'alerte des liquidités (XOF)" aide="Les Prévisions signalent un solde projeté sous ce seuil."><input type="number" min="0" value={cur.seuilAlerte} onChange={(e) => maj({ seuilAlerte: e.target.value })} className="input-base" /></Champ>
        </div>
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between"><p className="font-bold text-gray-800">Tranches de la balance âgée</p>
          <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => maj({ tranches: TRANCHES_DEFAUT })}>Par défaut</Button><Button size="sm" variant="ghost" onClick={() => maj({ tranches: [...(cur.tranches || []), { min: '', max: '', label: '' }] })}><Plus size={14} /> Tranche</Button></div></div>
        {(cur.tranches || []).map((t, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <input type="number" min="0" value={t.min} onChange={(e) => maj({ tranches: cur.tranches.map((x, k) => (k === i ? { ...x, min: e.target.value } : x)) })} className="input-base !w-24" placeholder="De (j)" />
            <input type="number" min="0" value={t.max ?? ''} onChange={(e) => maj({ tranches: cur.tranches.map((x, k) => (k === i ? { ...x, max: e.target.value } : x)) })} className="input-base !w-24" placeholder="À (vide = ∞)" />
            <input value={t.label} onChange={(e) => maj({ tranches: cur.tranches.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} className="input-base" placeholder="Libellé" />
            <button type="button" onClick={() => maj({ tranches: cur.tranches.filter((_, k) => k !== i) })} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        ))}
      </Card>
      <div className="flex justify-end"><Button onClick={enregistrer} disabled={!v}>Enregistrer les paramètres</Button></div>
    </div>
  )
}
