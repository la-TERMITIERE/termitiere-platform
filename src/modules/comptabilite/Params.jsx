// COMPTABILITÉ — paramètres du module.
import { useState } from 'react'
import { Settings, Info, Plus, Trash2, Landmark } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { PLAN_COMPTABLE_DEFAUT, JOURNAUX, TAUX_TVA, CATEGORIES_IMMO, COL } from './data'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'

const BANQUES_COURANTES = ['SUNU Banque', 'NSIA Banque']

// Banques de l'entreprise : proposées à chaque dépôt ou retrait (Comptabilité, Mouvements bancaires).
function Banques() {
  const { data: banques } = useCollection(COL.banques)
  const [nom, setNom] = useState('')
  const norm = (v) => String(v || '').trim().toLowerCase()
  const existe = (n) => banques.some((b) => norm(b.nom) === norm(n))

  async function ajouter(n) {
    const v = String(n || '').trim()
    if (!v) return
    if (existe(v)) return toast.error('Cette banque existe déjà')
    await addItem(COL.banques, { nom: v })
    toast.success(`${v} ajoutée ✓`)
    setNom('')
  }
  async function supprimer(b) {
    if (!confirm(`Supprimer la banque « ${b.nom} » ? Les mouvements déjà enregistrés gardent son nom.`)) return
    await removeItem(COL.banques, b.id)
  }
  const proposees = BANQUES_COURANTES.filter((n) => !existe(n))

  return (
    <Card title="Banques">
      <p className="mb-3 text-xs text-gray-500">Les banques de l'entreprise. Chaque dépôt ou retrait enregistré dans « Mouvements bancaires » précise dans laquelle il a été fait.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {banques.length === 0 && <p className="text-sm text-gray-400">Aucune banque enregistrée.</p>}
        {[...banques].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((b) => (
          <span key={b.id} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
            <Landmark size={14} className="text-orange-600" /> {b.nom}
            <button type="button" onClick={() => supprimer(b)} title="Supprimer" className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
          </span>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ajouter(nom) }} className="flex flex-wrap items-center gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la banque, ex : SUNU Banque" aria-label="Nom de la banque"
          className="min-w-[220px] flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5" />
        <button type="submit" disabled={!nom.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus size={15} /> Ajouter la banque</button>
      </form>
      {proposees.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          Ajout rapide :
          {proposees.map((n) => (
            <button key={n} type="button" onClick={() => ajouter(n)} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-bold text-orange-700 hover:bg-orange-100">+ {n}</button>
          ))}
        </div>
      )}
    </Card>
  )
}
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

export default function Params() {
  return (
    <div className="space-y-5">
      <BandeauCompta icone={Settings} titre="Paramètres comptables" sous={"Référentiel et conventions du module"} />

      <Banques />

      <Card title="Référentiel">
        <div className="grid gap-3 sm:grid-cols-2">
          <Item label="Norme comptable" value="SYSCOHADA révisé (OHADA)" />
          <Item label="Devise" value="Franc CFA : XOF (BCEAO)" />
          <Item label="Comptes au plan par défaut" value={`${PLAN_COMPTABLE_DEFAUT.length} comptes`} />
          <Item label="Taux de TVA" value={TAUX_TVA.map((t) => t.label).join(' · ')} />
        </div>
      </Card>

      <Card title="Journaux disponibles">
        <div className="flex flex-wrap gap-2">
          {JOURNAUX.map((j) => <Badge key={j.code} tone={j.tone}>{j.code} : {j.label}</Badge>)}
        </div>
      </Card>

      <Card title="Durées d'amortissement par défaut">
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES_IMMO.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/5">
              <span>{c.label} <span className="font-mono text-xs text-gray-400">({c.compte})</span></span>
              <span className="font-semibold">{c.amortissable ? `${c.dureeAmort} ans` : 'non amortissable'}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
          <Info size={18} className="mt-0.5 shrink-0 text-sky-500" />
          <div className="space-y-1">
            <p className="font-semibold text-gray-800 dark:text-gray-100">Prochaine étape : passerelles automatiques</p>
            <p>Les achats/dépenses saisis dans les autres modules (MAXI-AGRO, LOGISTIQUE, BRIQUETERIE, E-DÉPENSES, E-VOYAGE…) seront convertis automatiquement en écritures comptables (journal Achats/Caisse/Banque) selon le plan comptable ci-dessus : sur le modèle des passerelles déjà en place dans E-DÉPENSES.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Item({ label, value }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/5">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="font-semibold text-gray-800 dark:text-gray-100">{value}</div>
    </div>
  )
}
