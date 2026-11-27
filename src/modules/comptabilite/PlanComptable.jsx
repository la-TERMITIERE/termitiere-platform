// COMPTABILITÉ — Plan Comptable (aligné FEZIRE /accounting/accounts).
// Deux vues : le plan de l'entreprise (comptes par défaut + comptes personnalisés) et le
// référentiel SYSCOHADA Révisé complet (2 320 comptes, statique, cf. planReference.js),
// d'où l'on peut ajouter un compte à son plan.
import { useMemo, useState } from 'react'
import { BookMarked, Plus, Pencil, Trash2, Upload, Eraser, Library, CheckCircle2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { useCompta } from './useCompta'
import { CLASSES, COL, classeDe, TYPES_COMPTE } from './data'
import { REFERENTIEL, trouverReference, sensDuType } from './planReference'
import BandeauCompta, { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from './BandeauCompta'
import ChampRecherche from '../../shared/ui/ChampRecherche'

const VUES = [
  { id: 'plan', label: 'Plan de l\'entreprise' },
  { id: 'ref', label: `Référentiel SYSCOHADA (${REFERENTIEL.length.toLocaleString('fr-FR')})` }
]
const PAS_AFFICHAGE = 300 // lignes affichées à la fois dans le référentiel

const normaliser = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function PlanComptable() {
  const { plan } = useCompta()
  const [vue, setVue] = useState('plan')
  const [q, setQ] = useState('')
  const [classeSel, setClasseSel] = useState('')
  const [modal, setModal] = useState(null)

  const t = normaliser(q.trim())
  const correspond = (c) => (!classeSel || classeDe(c.num) === classeSel) &&
    (!t || c.num.startsWith(t) || normaliser(c.label).includes(t))

  const filtre = useMemo(() => plan.filter(correspond), [plan, t, classeSel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Comptes du référentiel déjà couverts par le plan de l'entreprise (101000 → 101).
  const refDansPlan = useMemo(() => {
    const m = new Map()
    plan.forEach((c) => { const r = trouverReference(c.num); if (r && !m.has(r.num)) m.set(r.num, c.num) })
    return m
  }, [plan])

  // Compteurs par catégorie (tuiles FEZIRE) de la vue affichée.
  const stats = useMemo(() => {
    const liste = vue === 'plan' ? plan : REFERENTIEL
    const s = { total: liste.length, ACTIF: 0, PASSIF: 0, CAPITAUX: 0, PRODUIT: 0, CHARGE: 0 }
    liste.forEach((c) => { const cat = TYPES_COMPTE[c.type]?.categorie; if (cat && s[cat] !== undefined) s[cat]++ })
    return s
  }, [plan, vue])

  const enregistrer = async () => {
    const num = String(modal.num || '').trim()
    const label = String(modal.label || '').trim()
    if (!num || !label) return
    const data = { num, label, type: modal.type || 'ASSET' }
    if (modal.id) await updateItem(COL.comptes, modal.id, data)
    else await addItem(COL.comptes, data)
    setModal(null)
  }
  const supprimer = async (compte) => {
    if (!compte.id) return
    if (confirm(`Supprimer le compte personnalisé ${compte.num} ?`)) await removeItem(COL.comptes, compte.id)
  }
  // Depuis le référentiel : on pré-remplit un compte à 6 chiffres (format du plan FEZIRE).
  const ajouterDepuisRef = (r) => setModal({ num: r.num.padEnd(6, '0'), label: r.label, type: r.type })

  const existeDeja = modal && !modal.id && plan.some((c) => c.num === String(modal.num))

  return (
    <div className="space-y-5">
      <BandeauCompta icone={BookMarked} titre="Plan Comptable" sous="Gérez le plan de comptes de votre entreprise : Plan SYSCOHADA Révisé">
        <OngletsBande options={VUES} valeur={vue} onChange={setVue} />
        <ChampRecherche variant="glass" value={q} onChange={setQ} placeholder="Numéro ou libellé…" />
        <ChampBande label="Classe">
          <select value={classeSel} onChange={(e) => setClasseSel(e.target.value)} className={CLASSE_CHAMP_BANDE}>
            <option value="">Toutes les classes</option>
            {CLASSES.map((c) => <option key={c.num} value={c.num}>Classe {c.num} - {c.label}</option>)}
          </select>
        </ChampBande>
        {vue === 'plan' && <>
          <BoutonBande icone={Upload} plein={false} disabled title="Prochainement">Importer</BoutonBande>
          <BoutonBande icone={Eraser} plein={false} disabled title="Prochainement">Vider le plan</BoutonBande>
          <BoutonBande icone={Plus} onClick={() => setModal({ num: '', label: '', type: 'ASSET' })}>Créer un compte</BoutonBande>
        </>}
      </BandeauCompta>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Tuile label="Total comptes" value={stats.total} />
        <Tuile label="Actifs" value={stats.ACTIF} />
        <Tuile label="Passifs" value={stats.PASSIF} />
        <Tuile label="Capitaux" value={stats.CAPITAUX} />
        <Tuile label="Produits" value={stats.PRODUIT} />
        <Tuile label="Charges" value={stats.CHARGE} />
      </div>

      {vue === 'plan'
        ? <VuePlan filtre={filtre} onEdit={setModal} onDelete={supprimer} />
        : <VueReferentiel key={`${t}|${classeSel}`} lignes={REFERENTIEL.filter(correspond)} refDansPlan={refDansPlan} onAjouter={ajouterDepuisRef} />}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le compte' : 'Créer un compte'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer} disabled={existeDeja}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Numéro de compte (6 chiffres)</label>
              <input value={modal.num} onChange={(e) => setModal({ ...modal, num: e.target.value.replace(/[^0-9]/g, '') })} placeholder="ex. 607000" inputMode="numeric" className="input-base font-mono" />
              {existeDeja
                ? <p className="mt-1 text-xs font-semibold text-red-600">Ce numéro existe déjà dans votre plan.</p>
                : <p className="mt-1 text-xs text-gray-400">Le 1er chiffre détermine la classe SYSCOHADA (1 à 9).</p>}</div>
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Intitulé / Libellé</label>
              <input value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} placeholder="ex. Achats de carburant" className="input-base" /></div>
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Type de compte</label>
              <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">
                {Object.entries(TYPES_COMPTE).map(([k, v]) => <option key={k} value={k}>{k} : {v.label}</option>)}
              </select></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

const ENTETE = 'bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5'

function VuePlan({ filtre, onEdit, onDelete }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={ENTETE}>
              <th className="px-3 py-2.5">N° Compte</th><th className="px-3 py-2.5">Intitulé / Libellé</th>
              <th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Sens</th><th className="px-3 py-2.5">Statut</th><th className="w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {CLASSES.filter((cl) => filtre.some((c) => classeDe(c.num) === cl.num)).map((cl) => (
              <FragmentClasse key={cl.num} classe={cl}
                comptes={filtre.filter((c) => classeDe(c.num) === cl.num)}
                onEdit={onEdit} onDelete={onDelete} />
            ))}
            {filtre.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun compte ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function FragmentClasse({ classe, comptes, onEdit, onDelete }) {
  return (
    <>
      <LigneClasse classe={classe} colSpan={6} />
      {comptes.map((c) => (
        <tr key={c.num} className="group hover:bg-gray-50 dark:hover:bg-white/5">
          <td className="px-3 py-2 font-mono text-xs font-bold">{c.num}</td>
          <td className="px-3 py-2 text-gray-800 dark:text-gray-100">{c.label}</td>
          <td className="px-3 py-2"><Badge tone="neutral">{c.type || 'ASSET'}</Badge></td>
          <td className="px-3 py-2 text-xs text-gray-500">{sensDuType(c.type || 'ASSET')}</td>
          <td className="px-3 py-2"><Badge tone="info">Imputable</Badge></td>
          <td className="px-2 py-2"><div className="flex justify-end gap-1">
            <button onClick={() => onEdit({ num: c.num, label: c.label, type: c.type, id: c.id })} className="rounded p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
            {c.source === 'perso' && <button onClick={() => onDelete(c)} className="rounded p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
          </div></td>
        </tr>
      ))}
    </>
  )
}

function LigneClasse({ classe, colSpan }) {
  return (
    <tr className="bg-orange-50/50 dark:bg-orange-500/10">
      <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-bold uppercase text-orange-700 dark:text-orange-400">
        Classe {classe.num} - {classe.label} <span className="font-normal normal-case text-gray-400">· {classe.desc}</span>
      </td>
    </tr>
  )
}

// Référentiel complet : arborescence par nombre de chiffres (classe → compte → sous-compte).
function VueReferentiel({ lignes, refDansPlan, onAjouter }) {
  const [max, setMax] = useState(PAS_AFFICHAGE)
  const visibles = lignes.slice(0, max)
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-white/10">
        <Library size={14} className="text-orange-600" />
        Nomenclature officielle SYSCOHADA Révisé, en lecture seule. Les comptes cochés sont déjà dans votre plan ; le bouton + ajoute un compte à votre plan.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={ENTETE}>
              <th className="px-3 py-2.5">N° Compte</th><th className="px-3 py-2.5">Intitulé / Libellé</th>
              <th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Sens</th><th className="px-3 py-2.5">Votre plan</th><th className="w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {visibles.map((r) => {
              const classe = r.niveau === 1 ? CLASSES.find((c) => c.num === r.num) : null
              const dansPlan = refDansPlan.get(r.num)
              return (
                <tr key={r.num} className={`group ${r.niveau === 1 ? 'bg-orange-50/50 dark:bg-orange-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                  <td className={`py-1.5 pr-3 font-mono text-xs ${r.niveau <= 2 ? 'font-bold' : 'text-gray-600 dark:text-gray-300'}`} style={{ paddingLeft: `${0.75 + (r.niveau - 1) * 0.6}rem` }}>{r.num}</td>
                  <td className={`px-3 py-1.5 ${r.niveau === 1 ? 'text-xs font-bold uppercase text-orange-700 dark:text-orange-400' : r.niveau === 2 ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}>
                    {r.label}{classe && <span className="font-normal normal-case text-gray-400"> · Classe {classe.num}</span>}
                  </td>
                  <td className="px-3 py-1.5"><Badge tone="neutral">{r.type}</Badge></td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{sensDuType(r.type)}</td>
                  <td className="px-3 py-1.5">{dansPlan && <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700" title={`Compte ${dansPlan} de votre plan`}><CheckCircle2 size={13} /> {dansPlan}</span>}</td>
                  <td className="px-2 py-1.5 text-right">
                    {r.niveau >= 2 && !dansPlan && (
                      <button onClick={() => onAjouter(r)} title="Ajouter ce compte à votre plan" className="rounded p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-orange-50 hover:text-orange-600"><Plus size={14} /></button>
                    )}
                  </td>
                </tr>
              )
            })}
            {lignes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Aucun compte ne correspond.</td></tr>}
          </tbody>
        </table>
      </div>
      {lignes.length > max && (
        <div className="flex items-center justify-center gap-3 border-t border-gray-100 px-3 py-3 text-xs text-gray-500 dark:border-white/10">
          {max.toLocaleString('fr-FR')} comptes affichés sur {lignes.length.toLocaleString('fr-FR')}
          <Button variant="ghost" onClick={() => setMax(max + PAS_AFFICHAGE * 2)}>Afficher plus</Button>
          <Button variant="ghost" onClick={() => setMax(lignes.length)}>Tout afficher</Button>
        </div>
      )}
    </Card>
  )
}

function Tuile({ label, value }) {
  return <Card className="!p-3"><div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div><div className="text-xl font-extrabold">{Number(value).toLocaleString('fr-FR')}</div></Card>
}
