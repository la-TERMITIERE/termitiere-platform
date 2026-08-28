// COMPTABILITÉ — Comptabilité Analytique (aligné FEZIRE /accounting/analytical).
// Axes / centres de coûts & de profits. Un centre = un projet/secteur (agro, logistique…).
import { useMemo, useState } from 'react'
import { PieChart, Plus, Pencil, Trash2 } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { addItem, updateItem, removeItem } from '../../core/db'
import { formatMoney } from '../../utils/formatters'
import { useCompta } from './useCompta'
import { COL } from './data'

const vide = () => ({ code: '', libelle: '', type: 'cout' })

export default function Analytique() {
  const { centres, ecritures, loading } = useCompta()
  const [modal, setModal] = useState(null)

  // Répartition par axe : somme des lignes d'écritures validées portant un `axe`.
  const parAxe = useMemo(() => {
    const acc = {}
    ;(ecritures || []).filter((e) => e.statut === 'validee').forEach((e) => {
      (e.lignes || []).forEach((l) => {
        const axe = l.axe || e.secteur
        if (!axe) return
        acc[axe] ||= { charges: 0, produits: 0 }
        const c = String(l.compte || '')
        if (c.startsWith('6')) acc[axe].charges += Number(l.debit) || 0
        if (c.startsWith('7')) acc[axe].produits += Number(l.credit) || 0
      })
    })
    return acc
  }, [ecritures])

  const totaux = useMemo(() => {
    const v = Object.values(parAxe)
    const produits = v.reduce((s, x) => s + x.produits, 0)
    const charges = v.reduce((s, x) => s + x.charges, 0)
    return { produits, charges, marge: produits - charges }
  }, [parAxe])

  const enregistrer = async () => {
    const v = { code: modal.code.trim(), libelle: modal.libelle.trim(), type: modal.type }
    if (!v.libelle) return
    if (modal.id) await updateItem(COL.centres, modal.id, v)
    else await addItem(COL.centres, v)
    setModal(null)
  }
  const supprimer = async (c) => { if (confirm(`Supprimer le centre « ${c.libelle} » ?`)) await removeItem(COL.centres, c.id) }

  if (loading) return <div className="py-16 text-center text-gray-400">Chargement…</div>

  const centresCout = (centres || [])
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <PieChart className="text-orange-600" /> Comptabilité Analytique
          </h1>
          <p className="text-sm text-gray-500">Configurez vos axes analytiques et suivez la répartition réelle de vos coûts et de vos profits par projet ou département.</p>
        </div>
        <Button onClick={() => setModal(vide())}><Plus size={16} /> Créer un Centre</Button>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="REVENUS ANALYTIQUES" value={formatMoney(totaux.produits)} accent="#16a34a" icon={PieChart} />
        <StatCard title="DÉPENSES ANALYTIQUES" value={formatMoney(totaux.charges)} accent="#f59e0b" icon={PieChart} />
        <StatCard title="MARGE NETTE ANALYTIQUE" value={formatMoney(totaux.marge)} valueColor={totaux.marge >= 0 ? '#16a34a' : '#dc2626'} accent="#0ea5e9" icon={PieChart} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Distribution des Dépenses (Centres de Coûts)">
          {Object.keys(parAxe).length === 0
            ? <p className="py-6 text-center text-sm text-gray-400">Aucun coût comptabilisé pour le moment.</p>
            : Object.entries(parAxe).map(([axe, x]) => (
              <Ligne key={axe} label={axe} value={x.charges} />
            ))}
        </Card>
        <Card title="Distribution des Revenus (Centres de Profits)">
          {Object.keys(parAxe).length === 0
            ? <p className="py-6 text-center text-sm text-gray-400">Aucun profit comptabilisé pour le moment.</p>
            : Object.entries(parAxe).map(([axe, x]) => (
              <Ligne key={axe} label={axe} value={x.produits} />
            ))}
        </Card>
      </div>

      <Card title="Centres Analytiques configurés">
        <p className="mb-3 text-xs text-gray-500">Créez des centres analytiques pour affecter des dépenses/revenus spécifiques à des projets ou centres de coût.</p>
        {centresCout.length === 0 ? <p className="py-4 text-center text-sm text-gray-400">Aucun centre analytique configuré.</p> : (
          <div className="divide-y divide-gray-100 dark:divide-white/10">
            {centresCout.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 py-2">
                <span className="w-16 shrink-0 font-mono text-xs font-bold">{c.code || '—'}</span>
                <span className="flex-1 text-sm">{c.libelle}</span>
                <button onClick={() => setModal({ ...c })} className="rounded p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                <button onClick={() => supprimer(c)} className="rounded p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le centre' : 'Créer un Centre analytique'}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={enregistrer}>Enregistrer</Button></>}>
        {modal && (
          <div className="space-y-3">
            <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Code</label>
              <input value={modal.code} onChange={(e) => setModal({ ...modal, code: e.target.value })} placeholder="ex. AGRO" className="input-base" /></div>
            <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Libellé</label>
              <input value={modal.libelle} onChange={(e) => setModal({ ...modal, libelle: e.target.value })} placeholder="ex. MAXI-AGRO" className="input-base" /></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Ligne({ label, value }) {
  return <div className="flex items-center justify-between py-1 text-sm"><span className="capitalize text-gray-600 dark:text-gray-300">{label}</span><span className="font-semibold">{formatMoney(value)}</span></div>
}
