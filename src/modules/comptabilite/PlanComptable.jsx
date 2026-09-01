// COMPTABILITÉ — Plan Comptable (aligné FEZIRE /accounting/accounts).
import { useMemo, useState } from 'react'
import { BookMarked, Plus, Search, Pencil, Trash2, Upload, Eraser } from 'lucide-react'
import Card from '../../shared/ui/Card'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { useCompta } from './useCompta'
import { CLASSES, COL, classeDe, TYPES_COMPTE } from './data'

export default function PlanComptable() {
  const { plan, comptesPerso } = useCompta()
  const [q, setQ] = useState('')
  const [classeSel, setClasseSel] = useState('')
  const [modal, setModal] = useState(null)

  const filtre = useMemo(() => {
    const t = q.trim().toLowerCase()
    return plan.filter((c) => {
      if (classeSel && classeDe(c.num) !== classeSel) return false
      if (!t) return true
      return c.num.includes(t) || (c.label || '').toLowerCase().includes(t)
    })
  }, [plan, q, classeSel])

  // Compteurs par catégorie (tuiles FEZIRE).
  const stats = useMemo(() => {
    const s = { total: plan.length, ACTIF: 0, PASSIF: 0, CAPITAUX: 0, PRODUIT: 0, CHARGE: 0 }
    plan.forEach((c) => { const cat = TYPES_COMPTE[c.type]?.categorie; if (cat && s[cat] !== undefined) s[cat]++ })
    return s
  }, [plan])

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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <BookMarked className="text-orange-600" /> Plan Comptable
          </h1>
          <p className="text-sm text-gray-500">Gérez le plan de comptes de votre entreprise. <Badge tone="primary" className="ml-1">Plan SYSCOHADA Révisé</Badge></p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled title="Prochainement"><Upload size={15} /> Importer</Button>
          <Button variant="outline" disabled title="Prochainement"><Eraser size={15} /> Vider le plan</Button>
          <Button onClick={() => setModal({ num: '', label: '', type: 'ASSET' })}><Plus size={16} /> Créer un compte</Button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Tuile label="Total comptes" value={stats.total} />
        <Tuile label="Actifs" value={stats.ACTIF} />
        <Tuile label="Passifs" value={stats.PASSIF} />
        <Tuile label="Capitaux" value={stats.CAPITAUX} />
        <Tuile label="Produits" value={stats.PRODUIT} />
        <Tuile label="Charges" value={stats.CHARGE} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un compte (numéro ou libellé)…"
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-white/5" />
          </div>
          <select value={classeSel} onChange={(e) => setClasseSel(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
            <option value="">Toutes les classes</option>
            {CLASSES.map((c) => <option key={c.num} value={c.num}>Classe {c.num} - {c.label}</option>)}
          </select>
        </div>
      </Card>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">N° Compte</th><th className="px-3 py-2.5">Intitulé / Libellé</th>
                <th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Statut</th><th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {CLASSES.filter((cl) => filtre.some((c) => classeDe(c.num) === cl.num)).map((cl) => (
                <FragmentClasse key={cl.num} classe={cl}
                  comptes={filtre.filter((c) => classeDe(c.num) === cl.num)}
                  onEdit={setModal} onDelete={supprimer} />
              ))}
              {filtre.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Aucun compte ne correspond.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le compte' : 'Créer un compte'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Numéro de compte (6 chiffres)</label>
              <input value={modal.num} onChange={(e) => setModal({ ...modal, num: e.target.value.replace(/[^0-9]/g, '') })} placeholder="ex. 607000" inputMode="numeric" className="input-base font-mono" />
              <p className="mt-1 text-xs text-gray-400">Le 1er chiffre détermine la classe SYSCOHADA (1 à 9).</p></div>
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Intitulé / Libellé</label>
              <input value={modal.label} onChange={(e) => setModal({ ...modal, label: e.target.value })} placeholder="ex. Achats de carburant" className="input-base" /></div>
            <div><label className="mb-1 block text-sm font-semibold text-gray-600 dark:text-gray-300">Type de compte</label>
              <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">
                {Object.entries(TYPES_COMPTE).map(([k, v]) => <option key={k} value={k}>{k} — {v.label}</option>)}
              </select></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function FragmentClasse({ classe, comptes, onEdit, onDelete }) {
  return (
    <>
      <tr className="bg-orange-50/50 dark:bg-orange-500/10">
        <td colSpan={5} className="px-3 py-1.5 text-xs font-bold uppercase text-orange-700 dark:text-orange-400">
          Classe {classe.num} - {classe.label} <span className="font-normal normal-case text-gray-400">· {classe.desc}</span>
        </td>
      </tr>
      {comptes.map((c) => (
        <tr key={c.num} className="group hover:bg-gray-50 dark:hover:bg-white/5">
          <td className="px-3 py-2 font-mono text-xs font-bold">{c.num}</td>
          <td className="px-3 py-2 text-gray-800 dark:text-gray-100">{c.label}</td>
          <td className="px-3 py-2"><Badge tone="neutral">{c.type || 'ASSET'}</Badge></td>
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

function Tuile({ label, value }) {
  return <Card className="!p-3"><div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div><div className="text-xl font-extrabold">{value}</div></Card>
}
