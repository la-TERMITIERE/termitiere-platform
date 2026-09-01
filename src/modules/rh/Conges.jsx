// RH — Congés & Absences (Temps & Paie). Demande + validation, avec solde.
import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Check, X } from 'lucide-react'
import Card from '../../shared/ui/Card'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { TYPES_CONGE, STATUTS_CONGE, DROIT_CONGE_ANNUEL, COL } from './store/rhStore'

const vide = () => ({ employeId: '', type: 'annuel', dateDebut: todayStr(), dateFin: todayStr(), motif: '' })
const nbJours = (d1, d2) => {
  if (!d1 || !d2) return 0
  const j = Math.round((new Date(d2) - new Date(d1)) / 864e5) + 1
  return j > 0 ? j : 0
}

export default function Conges() {
  const { data: conges } = useCollection(COL.conges)
  const { data: employes } = useCollection(COL.employes)
  const [modal, setModal] = useState(null)

  const empNom = (id) => employes.find((e) => e.id === id)?.nom || '—'
  const enAttente = conges.filter((c) => (c.statut || 'en_attente') === 'en_attente')
  const approuves = conges.filter((c) => c.statut === 'approuve')

  // Solde annuel congés payés consommé par employé (année courante).
  const soldeConsomme = useMemo(() => {
    const annee = todayStr().slice(0, 4)
    const acc = {}
    conges.filter((c) => c.statut === 'approuve' && c.type === 'annuel' && (c.dateDebut || '').startsWith(annee))
      .forEach((c) => { acc[c.employeId] = (acc[c.employeId] || 0) + nbJours(c.dateDebut, c.dateFin) })
    return acc
  }, [conges])

  async function save() {
    if (!modal.employeId) return toast.error('Sélectionnez un employé')
    const emp = employes.find((e) => e.id === modal.employeId)
    const data = { employeId: modal.employeId, employeNom: emp?.nom || '', type: modal.type,
      dateDebut: modal.dateDebut, dateFin: modal.dateFin, jours: nbJours(modal.dateDebut, modal.dateFin),
      motif: modal.motif || '', statut: 'en_attente' }
    await addItem(COL.conges, data)
    toast.success('Demande enregistrée ✓'); setModal(null)
  }
  async function decider(c, statut) { await updateItem(COL.conges, c.id, { statut }); toast.success(statut === 'approuve' ? 'Approuvé ✓' : 'Refusé') }
  async function supprimer(c) { if (confirm('Supprimer cette demande ?')) await removeItem(COL.conges, c.id) }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-sky-600">Temps & Paie</div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-gray-900 dark:text-gray-50">
            <CalendarDays className="text-sky-600" /> Congés & Absences
          </h1>
          <p className="text-sm text-gray-500">Demandes de congé, validation et soldes.</p>
        </div>
        <Button style={{ background: '#0284c7' }} onClick={() => setModal(vide())}><Plus size={16} /> Poser une demande</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard title="En attente" value={enAttente.length} accent="#f59e0b" icon={CalendarDays} />
        <StatCard title="Approuvés (à venir)" value={approuves.length} accent="#16a34a" icon={CalendarDays} />
        <StatCard title="Droit annuel" value={`${DROIT_CONGE_ANNUEL} j`} accent="#0284c7" icon={CalendarDays} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10"><p className="font-bold text-gray-800 dark:text-gray-100">Demandes de congé</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th><th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Période</th><th className="px-3 py-2.5 text-center">Jours</th>
                <th className="px-3 py-2.5 text-center">Solde conso.</th><th className="px-3 py-2.5">Statut</th><th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {conges.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucune demande.</td></tr>}
              {conges.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{c.employeNom || empNom(c.employeId)}</td>
                  <td className="px-3 py-2"><Badge tone={TYPES_CONGE[c.type]?.tone || 'neutral'}>{TYPES_CONGE[c.type]?.label || c.type}</Badge></td>
                  <td className="px-3 py-2 text-gray-500">{formatDateShort(c.dateDebut)} → {formatDateShort(c.dateFin)}</td>
                  <td className="px-3 py-2 text-center font-semibold">{c.jours || nbJours(c.dateDebut, c.dateFin)}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{c.type === 'annuel' ? `${soldeConsomme[c.employeId] || 0}/${DROIT_CONGE_ANNUEL}` : '—'}</td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_CONGE[c.statut || 'en_attente']?.tone}>{STATUTS_CONGE[c.statut || 'en_attente']?.label}</Badge></td>
                  <td className="px-2 py-2 text-right">
                    {(c.statut || 'en_attente') === 'en_attente' ? (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => decider(c, 'approuve')} className="rounded p-1.5 text-green-600 hover:bg-green-50" title="Approuver"><Check size={15} /></button>
                        <button onClick={() => decider(c, 'refuse')} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Refuser"><X size={15} /></button>
                      </div>
                    ) : <button onClick={() => supprimer(c)} className="text-xs text-gray-400 hover:text-red-600">Suppr.</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title="Nouvelle demande de congé"
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Annuler</Button><Button onClick={save}>Envoyer la demande</Button></>}>
        {modal && (
          <div className="space-y-3">
            <Champ label="Employé"><select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner…</option>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select></Champ>
            <Champ label="Type de congé"><select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">{Object.entries(TYPES_CONGE).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.droit} j)</option>)}</select></Champ>
            <div className="grid grid-cols-2 gap-3">
              <Champ label="Du"><input type="date" value={modal.dateDebut} onChange={(e) => setModal({ ...modal, dateDebut: e.target.value })} className="input-base" /></Champ>
              <Champ label="Au"><input type="date" value={modal.dateFin} onChange={(e) => setModal({ ...modal, dateFin: e.target.value })} className="input-base" /></Champ>
            </div>
            <p className="text-sm text-gray-500">Durée : <strong>{nbJours(modal.dateDebut, modal.dateFin)} jour(s)</strong></p>
            <Champ label="Motif (facultatif)"><textarea rows={2} value={modal.motif} onChange={(e) => setModal({ ...modal, motif: e.target.value })} className="input-base" /></Champ>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Champ({ label, children }) {
  return <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>{children}</div>
}
