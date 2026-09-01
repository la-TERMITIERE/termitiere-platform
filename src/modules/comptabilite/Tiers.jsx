// COMPTABILITÉ — Comptabilité Tiers (aligné FEZIRE /accounting/partners).
import { useMemo, useState } from 'react'
import { Users, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Badge from '../../shared/ui/Badge'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { TYPES_TIERS, COL } from './data'

const vide = (type) => ({ type, nom: '', compte: TYPES_TIERS[type].compte, telephone: '', email: '', ville: '', note: '' })

export default function Tiers() {
  const { tiers, loading } = useCompta()
  const [tab, setTab] = useState('client')
  const [modal, setModal] = useState(null)

  const liste = useMemo(() => (tiers || []).filter((t) => (t.type || 'client') === tab), [tiers, tab])
  const totalCreances = useMemo(() => liste.reduce((s, t) => s + (Number(t.solde) || 0), 0), [liste])

  const enregistrer = async () => {
    const v = { type: modal.type, nom: modal.nom.trim(), compte: modal.compte, telephone: modal.telephone || '', email: modal.email || '', ville: modal.ville || '', note: modal.note || '' }
    if (!v.nom) return
    if (modal.id) await updateItem(COL.tiers, modal.id, v)
    else await addItem(COL.tiers, v)
    setModal(null)
  }
  const supprimer = async (t) => { if (confirm(`Supprimer « ${t.nom} » ?`)) await removeItem(COL.tiers, t.id) }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>
  const estClient = tab === 'client'

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <Users className="text-orange-600" /> Comptabilité Tiers
          </h1>
          <p className="text-sm text-gray-500">Gérez les comptes clients et fournisseurs, suivez les créances et dettes, effectuez les lettrages et planifiez vos paiements.</p>
        </div>
        <Button onClick={() => setModal(vide(tab))}><Plus size={16} /> {estClient ? 'Nouveau Client' : 'Nouveau Fournisseur'}</Button>
      </header>

      <div className="flex gap-1.5">
        {['client', 'fournisseur'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === t ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
            {t === 'client' ? 'Clients' : 'Fournisseurs'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title={estClient ? 'TOTAL CRÉANCES CLIENTS' : 'TOTAL DETTES FOURNISSEURS'} value={formatMoney(totalCreances)} accent={estClient ? '#0ea5e9' : '#dc2626'} icon={Users} />
        <StatCard title="Nombre de tiers" value={liste.length} accent="#0d9488" icon={Users} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="font-bold text-gray-800 dark:text-gray-100">{estClient ? 'Registre des Créances Clients' : 'Registre des Dettes Fournisseurs'}</p>
          <p className="text-xs text-gray-500">{estClient ? 'Suivi des factures de ventes et relances clients.' : 'Suivi des factures d\'achats et échéances de paiement.'}</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
              <th className="px-3 py-2.5">Nom</th><th className="px-3 py-2.5">Compte</th><th className="px-3 py-2.5">Contact</th>
              <th className="px-3 py-2.5 text-right">Solde</th><th className="w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {liste.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">{estClient ? 'Aucun client répertorié.' : 'Aucun fournisseur répertorié.'}</td></tr>}
            {liste.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{t.nom}{t.ville ? <span className="text-xs text-gray-400"> · {t.ville}</span> : ''}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.compte}</td>
                <td className="px-3 py-2 text-gray-500">{t.telephone || t.email || '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{formatMoney(t.solde || 0)}</td>
                <td className="px-2 py-2"><div className="flex justify-end gap-1">
                  <button onClick={() => setModal({ ...t })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                  <button onClick={() => supprimer(t)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le tiers' : (modal?.type === 'client' ? 'Nouveau Client' : 'Nouveau Fournisseur')}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Nom / Raison sociale"><input value={modal.nom} onChange={(e) => setModal({ ...modal, nom: e.target.value })} className="input-base" /></Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Compte de rattachement"><input value={modal.compte} onChange={(e) => setModal({ ...modal, compte: e.target.value.replace(/[^0-9]/g, '') })} className="input-base font-mono" /></Champ>
              <Champ label="Téléphone"><input value={modal.telephone} onChange={(e) => setModal({ ...modal, telephone: e.target.value })} className="input-base" /></Champ>
              <Champ label="Email"><input value={modal.email} onChange={(e) => setModal({ ...modal, email: e.target.value })} className="input-base" /></Champ>
              <Champ label="Ville"><input value={modal.ville} onChange={(e) => setModal({ ...modal, ville: e.target.value })} className="input-base" /></Champ>
            </div>
            <Champ label="Note"><textarea rows={2} value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
