// COMPTABILITÉ — onglets Journaux, Exercices et Modèles de l'écran « Écritures & journaux »
// (alignés FEZIRE /accounting/journal-entries).
//  - Journaux : activité de chaque journal (nombre de pièces, totaux, dernière pièce).
//  - Exercices : ouverture / clôture. Un exercice clôturé VERROUILLE les écritures saisies à
//    la main dont la date y tombe (plus de création, modification, validation ni suppression).
//  - Modèles : écritures répétitives (loyer, abonnements…) à appliquer en un clic.
import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Lock, Unlock, Play } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { formatMoney, formatDateShort } from '../../utils/formatters'
import { useCollection } from '../../hooks/useFirestore'
import { JOURNAUX, COL } from './data'
import { totalDebit, totalCredit, compteDeResultat } from './logic'

// Exercice qui couvre une date (bornes debut/fin incluses ; à défaut, l'année civile `annee`).
export function exerciceDe(date, exercices = []) {
  const d = String(date || '').slice(0, 10)
  return exercices.find((x) => x.debut && x.fin && d >= x.debut && d <= x.fin)
    || exercices.find((x) => !x.debut && String(x.annee || x.nom || '').slice(0, 4) === d.slice(0, 4)) || null
}
export const estVerrouillee = (date, exercices) => exerciceDe(date, exercices)?.statut === 'cloture'

export function JournauxOnglet({ ecritures, onFiltrer }) {
  const stats = useMemo(() => JOURNAUX.map((j) => {
    const ecs = ecritures.filter((e) => e.journal === j.code && e.statut === 'validee')
    const derniere = ecs.reduce((m, e) => (String(e.date) > m ? String(e.date) : m), '')
    return { ...j, nb: ecs.length, debit: ecs.reduce((s, e) => s + totalDebit(e.lignes), 0), credit: ecs.reduce((s, e) => s + totalCredit(e.lignes), 0), auto: ecs.filter((e) => e.source === 'auto').length, derniere }
  }), [ecritures])
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3"><p className="font-bold text-gray-800">Journaux</p><p className="text-xs text-gray-500">Activité des 11 journaux (écritures validées). Touchez un journal pour voir ses écritures.</p></div>
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Journal</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Pièces</th><th className="px-3 py-2 text-right">Dont auto</th><th className="px-3 py-2 text-right">Total débit</th><th className="px-3 py-2 text-right">Total crédit</th><th className="px-3 py-2">Dernière pièce</th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {stats.map((j) => (
            <tr key={j.code} onClick={() => onFiltrer(j.code)} className="cursor-pointer hover:bg-gray-50">
              <td className="px-3 py-2"><Badge tone={j.tone}>{j.code}</Badge></td><td className="px-3 py-2 font-medium">{j.label}</td><td className="px-3 py-2 font-mono text-xs text-gray-500">{j.type}</td>
              <td className="px-3 py-2 text-right">{j.nb}</td><td className="px-3 py-2 text-right text-gray-500">{j.auto}</td>
              <td className="px-3 py-2 text-right">{formatMoney(j.debit)}</td><td className="px-3 py-2 text-right">{formatMoney(j.credit)}</td>
              <td className="px-3 py-2 font-mono text-xs">{j.derniere ? formatDateShort(j.derniere) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function ExercicesOnglet({ exercices, mvtsValides, ecritures, user }) {
  const [modal, setModal] = useState(null)
  const enregistrer = async () => {
    if (!modal.nom?.trim() || !modal.debut || !modal.fin || modal.fin < modal.debut) return
    const doc = { nom: modal.nom.trim(), debut: modal.debut, fin: modal.fin, annee: modal.debut.slice(0, 4), statut: modal.statut || 'ouvert' }
    if (modal.id) await updateItem(COL.exercices, modal.id, doc)
    else await addItem(COL.exercices, doc)
    setModal(null)
  }
  const basculer = async (x) => {
    const brouillons = ecritures.filter((e) => e.source !== 'auto' && e.statut !== 'validee' && String(e.date) >= x.debut && String(e.date) <= x.fin)
    if (x.statut !== 'cloture') {
      if (brouillons.length && !confirm(`${brouillons.length} écriture(s) en brouillon dans cet exercice : elles seront figées en brouillon. Clôturer quand même ?`)) return
      if (!confirm(`Clôturer « ${x.nom} » ? Les écritures saisies à la main sur cette période ne pourront plus être créées, modifiées ni supprimées.`)) return
    } else if (!confirm(`Rouvrir « ${x.nom} » ?`)) return
    const statut = x.statut === 'cloture' ? 'ouvert' : 'cloture'
    await updateItem(COL.exercices, x.id, { statut, [statut === 'cloture' ? 'clotureLe' : 'rouvertLe']: new Date().toISOString().slice(0, 10), par: user?.nom || '' })
    await audit('comptabilite', 'EXERCICE', `${x.nom} : ${statut === 'cloture' ? 'clôturé' : 'rouvert'}`)
  }
  const tri = [...exercices].sort((a, b) => String(b.debut || b.annee).localeCompare(String(a.debut || a.annee)))
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center border-b border-gray-100 px-4 py-3">
        <div className="mr-auto"><p className="font-bold text-gray-800">Exercices fiscaux</p><p className="text-xs text-gray-500">Un exercice clôturé verrouille ses écritures manuelles. Résultat calculé sur les écritures validées.</p></div>
        <Button size="sm" onClick={() => { const y = new Date().getFullYear(); setModal({ nom: `Exercice ${y}`, debut: `${y}-01-01`, fin: `${y}-12-31`, statut: 'ouvert' }) }}><Plus size={14} /> Nouvel exercice</Button>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Exercice</th><th className="px-3 py-2">Période</th><th className="px-3 py-2 text-right">Produits</th><th className="px-3 py-2 text-right">Charges</th><th className="px-3 py-2 text-right">Résultat</th><th className="px-3 py-2">Statut</th><th className="w-28"></th></tr></thead>
        <tbody className="divide-y divide-gray-100">
          {tri.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucun exercice déclaré : les écritures sont rattachées à leur année civile.</td></tr>}
          {tri.map((x) => {
            const r = x.debut && x.fin ? compteDeResultat(mvtsValides, { debut: x.debut, fin: x.fin }) : null
            return (
              <tr key={x.id}>
                <td className="px-3 py-2 font-medium">{x.nom}</td>
                <td className="px-3 py-2 font-mono text-xs">{x.debut ? `${formatDateShort(x.debut)} → ${formatDateShort(x.fin)}` : x.annee}</td>
                <td className="px-3 py-2 text-right">{r ? formatMoney(r.produits) : '—'}</td><td className="px-3 py-2 text-right">{r ? formatMoney(r.charges) : '—'}</td>
                <td className={`px-3 py-2 text-right font-bold ${r && r.resultat < 0 ? 'text-red-600' : 'text-green-700'}`}>{r ? formatMoney(r.resultat) : '—'}</td>
                <td className="px-3 py-2">{x.statut === 'cloture' ? <Badge tone="neutral"><Lock size={11} /> Clôturé</Badge> : <Badge tone="success">Ouvert</Badge>}</td>
                <td className="px-2 py-2"><div className="flex justify-end gap-1">
                  {x.statut !== 'cloture' && <button title="Modifier" onClick={() => setModal({ ...x })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>}
                  <button title={x.statut === 'cloture' ? 'Rouvrir' : 'Clôturer'} onClick={() => basculer(x)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100">{x.statut === 'cloture' ? <Unlock size={14} /> : <Lock size={14} />}</button>
                  {x.statut !== 'cloture' && <button title="Supprimer" onClick={async () => { if (confirm(`Supprimer « ${x.nom} » ?`)) await removeItem(COL.exercices, x.id) }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>}
                </div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier l\'exercice' : 'Nouvel exercice'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase text-gray-500">Nom<input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base mt-1" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold uppercase text-gray-500">Début<input type="date" value={modal.debut} onChange={(e) => setModal({ ...modal, debut: e.target.value })} className="input-base mt-1" /></label>
              <label className="block text-xs font-semibold uppercase text-gray-500">Fin<input type="date" value={modal.fin} onChange={(e) => setModal({ ...modal, fin: e.target.value })} className="input-base mt-1" /></label>
            </div>
            {modal.fin && modal.debut && modal.fin < modal.debut && <p className="text-xs text-red-600">La fin doit suivre le début.</p>}
          </div>
        )}
      </Modal>
    </Card>
  )
}

export function ModelesOnglet({ plan, onAppliquer }) {
  const { data: modeles } = useCollection(COL.modeles)
  const [modal, setModal] = useState(null)
  const enregistrer = async () => {
    const lignes = (modal.lignes || []).filter((l) => l.compte).map((l) => ({ compte: String(l.compte), libelle: l.libelle || '', debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))
    if (!modal.nom?.trim() || lignes.length < 2) return
    const doc = { nom: modal.nom.trim(), journal: modal.journal || 'OD', libelle: modal.libelle || '', lignes }
    if (modal.id) await updateItem(COL.modeles, modal.id, doc)
    else await addItem(COL.modeles, doc)
    setModal(null)
  }
  const setLigne = (i, p) => setModal({ ...modal, lignes: modal.lignes.map((l, k) => (k === i ? { ...l, ...p } : l)) })
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center border-b border-gray-100 px-4 py-3">
        <div className="mr-auto"><p className="font-bold text-gray-800">Modèles d'écritures</p><p className="text-xs text-gray-500">Saisies répétitives (loyer, abonnement, dotation…) : appliquez un modèle pour pré-remplir une écriture. Montants à 0 = à compléter.</p></div>
        <Button size="sm" onClick={() => setModal({ nom: '', journal: 'OD', libelle: '', lignes: [{ compte: '', libelle: '', debit: '', credit: '' }, { compte: '', libelle: '', debit: '', credit: '' }] })}><Plus size={14} /> Nouveau modèle</Button>
      </div>
      <div className="divide-y divide-gray-100">
        {modeles.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun modèle.</p>}
        {modeles.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <Badge tone="neutral">{m.journal}</Badge>
            <div className="mr-auto"><p className="font-semibold text-gray-800">{m.nom}</p><p className="text-xs text-gray-500">{(m.lignes || []).map((l) => `${l.compte}${l.debit ? ` D ${formatMoney(l.debit)}` : ''}${l.credit ? ` C ${formatMoney(l.credit)}` : ''}`).join(' · ')}</p></div>
            <Button size="sm" onClick={() => onAppliquer(m)}><Play size={13} /> Appliquer</Button>
            <button title="Modifier" onClick={() => setModal({ ...m, lignes: (m.lignes || []).map((l) => ({ ...l, debit: l.debit || '', credit: l.credit || '' })) })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Pencil size={14} /></button>
            <button title="Supprimer" onClick={async () => { if (confirm(`Supprimer le modèle « ${m.nom} » ?`)) await removeItem(COL.modeles, m.id) }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} size="lg" title={modal?.id ? 'Modifier le modèle' : 'Nouveau modèle'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block text-xs font-semibold uppercase text-gray-500">Nom<input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base mt-1" placeholder="ex. Loyer mensuel du siège" /></label>
              <label className="block text-xs font-semibold uppercase text-gray-500">Journal<select value={modal.journal} onChange={(e) => setModal({ ...modal, journal: e.target.value })} className="input-base mt-1">{JOURNAUX.map((j) => <option key={j.code} value={j.code}>{j.code}</option>)}</select></label>
            </div>
            <label className="block text-xs font-semibold uppercase text-gray-500">Libellé de l'écriture<input value={modal.libelle} onChange={(e) => setModal({ ...modal, libelle: e.target.value })} className="input-base mt-1" /></label>
            {modal.lignes.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input list="plan-comptes-modeles" value={l.compte} onChange={(e) => setLigne(i, { compte: e.target.value.replace(/[^0-9]/g, '') })} className="input-base !w-28 font-mono" placeholder="Compte" />
                <input value={l.libelle} onChange={(e) => setLigne(i, { libelle: e.target.value })} className="input-base" placeholder="Libellé" />
                <input type="number" min="0" value={l.debit} onChange={(e) => setLigne(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} className="input-base !w-28" placeholder="Débit" />
                <input type="number" min="0" value={l.credit} onChange={(e) => setLigne(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} className="input-base !w-28" placeholder="Crédit" />
                <button type="button" onClick={() => setModal({ ...modal, lignes: modal.lignes.filter((_, k) => k !== i) })} className="px-1 text-gray-400 hover:text-red-600">×</button>
              </div>
            ))}
            <datalist id="plan-comptes-modeles">{plan.map((c) => <option key={c.num} value={c.num}>{c.label}</option>)}</datalist>
            <button type="button" className="text-xs font-semibold text-orange-600" onClick={() => setModal({ ...modal, lignes: [...modal.lignes, { compte: '', libelle: '', debit: '', credit: '' }] })}>+ Ajouter une ligne</button>
          </div>
        )}
      </Modal>
    </Card>
  )
}
