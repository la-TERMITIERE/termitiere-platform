// COMPTABILITÉ — paramètres du module.
import { useState } from 'react'
import { Settings, Info, Plus, Trash2, Landmark, Pencil, Check, X } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { PLAN_COMPTABLE_DEFAUT, JOURNAUX, TAUX_TVA, CATEGORIES_IMMO, COL } from './data'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'

const BANQUES_COURANTES = ['SUNU Banque', 'NSIA Banque']

// Banques de l'entreprise : proposées à chaque dépôt ou retrait (Comptabilité, Mouvements bancaires).
// Chaque banque est un COMPTE BANCAIRE : elle porte son numéro de compte (obligatoire à l'ajout). Les banques créées
// avant cette règle n'en ont pas encore : elles sont signalées et se complètent avec le crayon.
function Banques() {
  const { data: banques } = useCollection(COL.banques)
  const [nom, setNom] = useState('')
  const [numero, setNumero] = useState('')
  const [edition, setEdition] = useState(null) // { id, nom, numero }
  const norm = (v) => String(v || '').trim().toLowerCase()
  const existe = (n, num, sauf) => banques.some((b) => b.id !== sauf && norm(b.nom) === norm(n) && norm(b.numero) === norm(num))

  async function ajouter() {
    const v = nom.trim()
    const num = numero.trim()
    if (!v) return toast.error('Nom de la banque requis')
    if (!num) return toast.error('Numéro de compte requis')
    if (existe(v, num)) return toast.error('Ce compte existe déjà')
    await addItem(COL.banques, { nom: v, numero: num })
    toast.success(`${v} : compte ${num} ajouté ✓`)
    setNom(''); setNumero('')
  }
  async function enregistrerEdition() {
    const v = edition.nom.trim()
    const num = edition.numero.trim()
    if (!v || !num) return toast.error('Nom et numéro de compte requis')
    if (existe(v, num, edition.id)) return toast.error('Ce compte existe déjà')
    await updateItem(COL.banques, edition.id, { nom: v, numero: num })
    toast.success('Compte mis à jour ✓')
    setEdition(null)
  }
  async function supprimer(b) {
    if (!confirm(`Supprimer le compte « ${b.nom}${b.numero ? ` : ${b.numero}` : ''} » ? Les mouvements déjà enregistrés gardent son nom.`)) return
    await removeItem(COL.banques, b.id)
  }
  const proposees = BANQUES_COURANTES.filter((n) => !banques.some((b) => norm(b.nom) === norm(n)))
  const sansNumero = banques.filter((b) => !(b.numero || '').trim()).length
  const champ = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5'

  return (
    <Card title="Banques et numéros de compte">
      <p className="mb-3 text-xs text-gray-500">Les comptes bancaires de l'entreprise. Chaque dépôt ou retrait enregistré dans « Mouvements bancaires » précise dans lequel il a été fait.</p>
      {sansNumero > 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          {sansNumero} compte{sansNumero > 1 ? 's' : ''} sans numéro : cliquez sur le crayon pour le renseigner.
        </p>
      )}
      <div className="mb-3 space-y-2">
        {banques.length === 0 && <p className="text-sm text-gray-400">Aucune banque enregistrée.</p>}
        {[...banques].sort((a, b) => (a.nom || '').localeCompare(b.nom || '')).map((b) => (
          edition?.id === b.id ? (
            <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 p-2">
              <input value={edition.nom} onChange={(e) => setEdition((x) => ({ ...x, nom: e.target.value }))} aria-label="Nom de la banque" className={`min-w-[160px] flex-1 ${champ}`} />
              <input value={edition.numero} onChange={(e) => setEdition((x) => ({ ...x, numero: e.target.value }))} aria-label="Numéro de compte" placeholder="Numéro de compte" autoFocus className={`min-w-[180px] flex-1 ${champ}`} />
              <button type="button" onClick={enregistrerEdition} title="Enregistrer" className="rounded-lg bg-teal-600 p-2 text-white hover:bg-teal-700"><Check size={15} /></button>
              <button type="button" onClick={() => setEdition(null)} title="Annuler" className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"><X size={15} /></button>
            </div>
          ) : (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
              <span className="flex min-w-0 items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                <Landmark size={14} className="shrink-0 text-orange-600" /> {b.nom}
                {(b.numero || '').trim()
                  ? <span className="rounded-full bg-teal-50 px-2 py-0.5 font-mono text-xs font-bold text-teal-700">N° {b.numero}</span>
                  : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">N° à renseigner</span>}
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => setEdition({ id: b.id, nom: b.nom || '', numero: b.numero || '' })} title="Modifier / renseigner le numéro" className="rounded p-1 text-gray-400 hover:bg-orange-50 hover:text-orange-600"><Pencil size={14} /></button>
                <button type="button" onClick={() => supprimer(b)} title="Supprimer" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
              </span>
            </div>
          )
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ajouter() }} className="flex flex-wrap items-center gap-2">
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom de la banque, ex : SUNU Banque" aria-label="Nom de la banque" className={`min-w-[200px] flex-1 ${champ}`} />
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Numéro de compte *" aria-label="Numéro de compte" className={`min-w-[200px] flex-1 font-mono ${champ}`} />
        <button type="submit" disabled={!nom.trim() || !numero.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus size={15} /> Ajouter le compte</button>
      </form>
      {proposees.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          Nom rapide :
          {proposees.map((n) => (
            <button key={n} type="button" onClick={() => setNom(n)} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 font-bold text-orange-700 hover:bg-orange-100">{n}</button>
          ))}
        </div>
      )}
    </Card>
  )
}

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
