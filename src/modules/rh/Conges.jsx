// RH — Congés & Absences (Temps & Paie). Demande + validation, avec solde.
import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Check, X, UserRound, AlignLeft, Plane, Clock, Pencil, Trash2 } from 'lucide-react'
import { usePeutSupprimerRh, supprimerAvecRetour } from './suppression'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import StatCard from '../../shared/ui/StatCard'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { addItem, updateItem, removeItem } from '../../core/db'
import { toast } from '../../core/notifications'
import { formatDateShort, todayStr } from '../../utils/formatters'
import { TYPES_CONGE, STATUTS_CONGE, COL } from './store/rhStore'
import { useDroitAnnuel } from './droitConges'
import { PageHeader, Champ, ModalRh } from './rhui'
import DetailFiche from './DetailFiche'
import { OngletsBande, BoutonBande, ChampBande, CLASSE_CHAMP_BANDE } from '../../shared/ui/BandeauVolet'

const vide = () => ({ employeId: '', type: 'annuel', dateDebut: todayStr(), dateFin: todayStr(), motif: '' })
const nbJours = (d1, d2) => {
  if (!d1 || !d2) return 0
  const j = Math.round((new Date(d2) - new Date(d1)) / 864e5) + 1
  return j > 0 ? j : 0
}

export default function Conges() {
  const droitAnnuel = useDroitAnnuel()
  const { data: conges } = useCollection(COL.conges)
  const { data: employes } = useCollection(COL.employes)
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const peutSupprimer = usePeutSupprimerRh() // le bouton Supprimer est réservé à l'administration

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

  // Détail d'une demande de congé (au clic) : employé, type, période, durée, solde annuel et motif.
  const congeDetail = conges.find((c) => c.id === detailId)
  const ficheConge = (c) => ({
    titre: c.employeNom || empNom(c.employeId), sous: `Demande de congé · ${TYPES_CONGE[c.type]?.label || c.type}`,
    badge: { label: STATUTS_CONGE[c.statut || 'en_attente']?.label, tone: STATUTS_CONGE[c.statut || 'en_attente']?.tone },
    tuiles: [
      { icone: Plane, label: 'Type de congé', valeur: TYPES_CONGE[c.type]?.label || c.type },
      { icone: Clock, label: 'Durée', valeur: `${c.jours || nbJours(c.dateDebut, c.dateFin)} jour(s)` },
      { icone: CalendarDays, label: 'Du', valeur: c.dateDebut ? formatDateShort(c.dateDebut) : '' },
      { icone: CalendarDays, label: 'Au', valeur: c.dateFin ? formatDateShort(c.dateFin) : '' },
      ...(c.type === 'annuel' ? [{ icone: CalendarDays, label: 'Congé annuel pris cette année', valeur: `${soldeConsomme[c.employeId] || 0} / ${droitAnnuel} jours`, large: true }] : []),
      { icone: AlignLeft, label: 'Motif', valeur: c.motif, large: true }
    ]
  })

  async function save() {
    if (!modal.employeId) return toast.error('Sélectionnez un employé')
    const emp = employes.find((e) => e.id === modal.employeId)
    if (modal.dateFin < modal.dateDebut) return toast.error('La date de fin doit être après la date de début')
    const data = { employeId: modal.employeId, employeNom: emp?.nom || '', type: modal.type,
      dateDebut: modal.dateDebut, dateFin: modal.dateFin, jours: nbJours(modal.dateDebut, modal.dateFin),
      motif: modal.motif || '' }
    try {
      // Corriger une demande garde son statut (en attente, approuvée ou refusée) ; une nouvelle demande part en attente.
      if (modal.id) await updateItem(COL.conges, modal.id, data)
      else await addItem(COL.conges, { ...data, statut: 'en_attente' })
      toast.success(modal.id ? 'Demande corrigée ✓' : 'Demande enregistrée ✓'); setModal(null)
    } catch (err) { toast.error(err?.message || 'Enregistrement impossible : réessayez') }
  }
  async function decider(c, statut) {
    try { await updateItem(COL.conges, c.id, { statut }); toast.success(statut === 'approuve' ? 'Approuvé ✓' : 'Refusé') }
    catch (err) { toast.error(err?.message || 'Action impossible : réessayez') }
  }
  // Suppression réservée à l'administration ; la fenêtre « Motif » sert de confirmation.
  const supprimer = (c) => supprimerAvecRetour(() => removeItem(COL.conges, c.id), 'Demande supprimée')

  return (
    <div className="space-y-5">
      <PageHeader icon={CalendarDays} sousModule="Temps & Paie" titre="Congés & Absences" sousTitre="Demandes de congé, validation et soldes."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
          <BoutonBande anime icone={Plus} onClick={() => setModal(vide())}>Poser une demande</BoutonBande>
        </>} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard title="En attente" value={enAttente.length} accent="#f59e0b" icon={CalendarDays} />
        <StatCard title="Approuvés (à venir)" value={approuves.length} accent="#16a34a" icon={CalendarDays} />
        <StatCard title="Droit annuel" value={`${droitAnnuel} j`} accent="#0284c7" icon={CalendarDays} />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-white/10"><p className="font-bold text-gray-800 dark:text-gray-100">Demandes de congé</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th><th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Période</th><th className="px-3 py-2.5 text-center">Jours</th>
                <th className="px-3 py-2.5 text-center" title="Jours de congé annuel pris cette année, sur le droit annuel">Jours pris / droit</th><th className="px-3 py-2.5">Statut</th><th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {conges.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Aucune demande.</td></tr>}
              {conges.filter((c) => correspond(recherche, c.employeNom, empNom(c.employeId))).map((c) => (
                <tr key={c.id} onClick={() => setDetailId(c.id)} className="cursor-pointer hover:bg-sky-50/60 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{c.employeNom || empNom(c.employeId)}</td>
                  <td className="px-3 py-2"><Badge tone={TYPES_CONGE[c.type]?.tone || 'neutral'}>{TYPES_CONGE[c.type]?.label || c.type}</Badge></td>
                  <td className="px-3 py-2 text-gray-500">{formatDateShort(c.dateDebut)} → {formatDateShort(c.dateFin)}</td>
                  <td className="px-3 py-2 text-center font-semibold">{c.jours || nbJours(c.dateDebut, c.dateFin)}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{c.type === 'annuel' ? `${soldeConsomme[c.employeId] || 0}/${droitAnnuel}` : '—'}</td>
                  <td className="px-3 py-2"><Badge tone={STATUTS_CONGE[c.statut || 'en_attente']?.tone}>{STATUTS_CONGE[c.statut || 'en_attente']?.label}</Badge></td>
                  <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {(c.statut || 'en_attente') === 'en_attente' && (<>
                        <button onClick={() => decider(c, 'approuve')} className="rounded p-1.5 text-green-600 hover:bg-green-50" title="Approuver" aria-label="Approuver"><Check size={15} /></button>
                        <button onClick={() => decider(c, 'refuse')} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="Refuser" aria-label="Refuser"><X size={15} /></button>
                      </>)}
                      <button onClick={() => setModal({ ...c })} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Corriger la demande" aria-label="Corriger la demande"><Pencil size={14} /></button>
                      {peutSupprimer && <button onClick={() => supprimer(c)} className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600" title="Supprimer la demande" aria-label="Supprimer la demande"><Trash2 size={14} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DetailFiche fiche={congeDetail ? ficheConge(congeDetail) : null} onClose={() => setDetailId(null)}
        actions={congeDetail ? [
          ...((congeDetail.statut || 'en_attente') === 'en_attente' ? [
            { label: 'Refuser', icone: X, tone: 'danger', onClick: () => { decider(congeDetail, 'refuse'); setDetailId(null) } },
            { label: 'Approuver', icone: Check, tone: 'succes', onClick: () => { decider(congeDetail, 'approuve'); setDetailId(null) } }
          ] : []),
          { label: 'Corriger', icone: Pencil, tone: 'primaire', onClick: () => { setModal({ ...congeDetail }); setDetailId(null) } },
          ...(peutSupprimer ? [{ label: 'Supprimer', icone: Trash2, tone: 'danger', onClick: () => { const c = congeDetail; setDetailId(null); supprimer(c) } }] : [])
        ] : []} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Corriger la demande de congé' : 'Nouvelle demande de congé'} libelleSave={modal?.id ? 'Enregistrer' : 'Envoyer la demande'}
        icone={Plane} intro={modal?.id ? 'Corrigez les informations : le statut de la demande ne change pas.' : 'La demande part en attente : un responsable la valide ou la refuse.'} onSave={save}>
        {modal && (<>
          <Champ label="Employé" icone={UserRound} required>
            <select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner…</option>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <Champ label="Type de congé" icone={Plane}>
            <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">{Object.entries(TYPES_CONGE).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.droit} j)</option>)}</select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Du" icone={CalendarDays}>
              <input type="date" value={modal.dateDebut} onChange={(e) => setModal({ ...modal, dateDebut: e.target.value })} className="input-base" />
            </Champ>
            <Champ label="Au" icone={CalendarDays}>
              <input type="date" value={modal.dateFin} onChange={(e) => setModal({ ...modal, dateFin: e.target.value })} className="input-base" />
            </Champ>
          </div>
          <p className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-sm text-gray-600 backdrop-blur-md">
            <Clock size={16} className="text-gray-400" aria-hidden="true" /> Durée : <strong className="tabular-nums text-gray-800">{nbJours(modal.dateDebut, modal.dateFin)} jour(s)</strong>
          </p>
          <Champ label="Motif (facultatif)" icone={AlignLeft} haut>
            <textarea rows={2} value={modal.motif} onChange={(e) => setModal({ ...modal, motif: e.target.value })} className="input-base" />
          </Champ>
        </>)}
      </ModalRh>
    </div>
  )
}

