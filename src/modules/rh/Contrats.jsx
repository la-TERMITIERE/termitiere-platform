// RH : Contrats de travail (Collaborateurs & Contrats).
// Tant qu'un contrat est valide, deux boutons : Prolonger (nouvelle date de fin, historique conservé) et Résilier (fenêtre de justification
// comme pour une suppression : motif obligatoire, tracé dans le Journal). Un contrat résilié reste dans la liste, avec son motif.
import { useMemo, useState } from 'react'
import { FileText, Plus, Pencil, Trash2, AlertTriangle, UserRound, Banknote, CalendarDays, CalendarPlus, Ban, Info, Check } from 'lucide-react'
import Card from '../../shared/ui/Card'
import ChampRecherche, { correspond } from '../../shared/ui/ChampRecherche'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { addItem, updateItem, removeItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { formatMoney, formatDateShort, todayStr } from '../../utils/formatters'
import { icone3D, glassModalProps } from '../../utils/color'
import { TYPES_CONTRAT, COL } from './store/rhStore'
import { PageHeader, Champ, ModalRh } from './rhui'
import DetailFiche from './DetailFiche'
import { BoutonBande } from '../../shared/ui/BandeauVolet'

const BLEU = '#0284c7'
const vide = () => ({ employeId: '', type: 'cdi', dateDebut: todayStr(), dateFin: '', salaire: 0, poste: '' })
const MOTIFS_RESILIATION = ['Démission', 'Licenciement', 'Fin de période d\'essai', 'Fin de mission', 'Accord commun']
const MIN_MOTIF = 3
// Ajoute des mois à une date AAAA-MM-JJ.
const plusMois = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10) }

export default function Contrats() {
  const user = useAuth((s) => s.user)
  const { data: contrats } = useCollection(COL.contrats)
  const { data: employes } = useCollection(COL.employes)
  const [recherche, setRecherche] = useState('')
  const [modal, setModal] = useState(null)
  const [prolonge, setProlonge] = useState(null) // { contrat, dateFin }
  const [resilie, setResilie] = useState(null)   // { contrat, motif, date }
  const [detailId, setDetailId] = useState(null)
  const today = todayStr()
  const dans30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  const empNom = (id) => employes.find((e) => e.id === id)?.nom || '—'
  const enrichis = useMemo(() => contrats.map((c) => {
    const resiliee = c.statut === 'resilie'
    const expire = !resiliee && !!c.dateFin && c.dateFin < today
    return {
      ...c, resiliee, expire,
      echeanceProche: !resiliee && !!c.dateFin && c.dateFin >= today && c.dateFin <= dans30,
      valide: !resiliee && !expire // valide : ni résilié ni arrivé à échéance
    }
  }), [contrats, today, dans30])

  async function save() {
    if (!modal.employeId) return toast.error('Sélectionnez un employé')
    const emp = employes.find((e) => e.id === modal.employeId)
    const data = {
      employeId: modal.employeId, employeNom: emp?.nom || '', type: modal.type,
      dateDebut: modal.dateDebut, dateFin: modal.type === 'cdi' ? '' : (modal.dateFin || ''),
      salaire: Number(modal.salaire) || 0, poste: modal.poste || emp?.poste || ''
    }
    if (modal.id) await updateItem(COL.contrats, modal.id, data)
    else await addItem(COL.contrats, data)
    toast.success('Contrat enregistré ✓'); setModal(null)
  }
  async function supprimer(c) { if (confirm('Supprimer ce contrat ?')) { await removeItem(COL.contrats, c.id); toast.success('Supprimé') } }

  async function prolonger() {
    const { contrat: c, dateFin } = prolonge
    if (!dateFin || dateFin <= c.dateFin) return toast.error(`La nouvelle date de fin doit être après le ${formatDateShort(c.dateFin)}`)
    const historique = [...(c.prolongations || []), { ancienneFin: c.dateFin, nouvelleFin: dateFin, le: new Date().toISOString(), par: user?.nom || '' }]
    await updateItem(COL.contrats, c.id, { dateFin, prolongations: historique })
    await audit('rh', 'CONTRAT_PROLONGE', `${c.employeNom || empNom(c.employeId)} : fin du ${formatDateShort(c.dateFin)} repoussée au ${formatDateShort(dateFin)}`)
    toast.success(`Contrat prolongé jusqu'au ${formatDateShort(dateFin)} ✓`); setProlonge(null)
  }
  async function resilier() {
    const { contrat: c, date } = resilie
    const motif = resilie.motif.trim()
    if (motif.length < MIN_MOTIF) return
    await updateItem(COL.contrats, c.id, { statut: 'resilie', motifResiliation: motif, dateResiliation: date || today, resiliePar: user?.nom || '', resilieLe: new Date().toISOString() })
    await audit('rh', 'CONTRAT_RESILIE', `${c.employeNom || empNom(c.employeId)} (${TYPES_CONTRAT[c.type]?.label || c.type}) résilié : ${motif}`)
    toast.success('Contrat résilié'); setResilie(null)
  }

  const alertes = enrichis.filter((c) => c.echeanceProche).length
  // Détail d'un contrat (au clic) : dates, salaire, statut, historique des prolongations et motif d'une résiliation.
  const contratDetail = enrichis.find((c) => c.id === detailId)
  const ficheContrat = (c) => ({
    titre: c.employeNom || empNom(c.employeId), sous: `${TYPES_CONTRAT[c.type]?.label || c.type}${c.poste ? ` · ${c.poste}` : ''}`,
    badge: c.resiliee ? { label: 'Résilié', tone: 'danger' } : c.expire ? { label: 'Expiré', tone: 'danger' } : c.echeanceProche ? { label: 'Échéance proche', tone: 'warning' } : { label: 'Actif', tone: 'success' },
    tuiles: [
      { icone: FileText, label: 'Type de contrat', valeur: `${TYPES_CONTRAT[c.type]?.label || c.type}${TYPES_CONTRAT[c.type]?.desc ? ` : ${TYPES_CONTRAT[c.type].desc}` : ''}`, large: true },
      { icone: CalendarDays, label: 'Début', valeur: c.dateDebut ? formatDateShort(c.dateDebut) : '' },
      { icone: CalendarDays, label: 'Fin', valeur: c.dateFin ? formatDateShort(c.dateFin) : 'Sans date de fin' },
      { icone: Banknote, label: 'Salaire', valeur: c.salaire ? formatMoney(c.salaire) : '' },
      { icone: UserRound, label: 'Poste', valeur: c.poste },
      ...(c.prolongations?.length ? [{ icone: CalendarPlus, label: `Prolongations (${c.prolongations.length})`, large: true, couleur: '#16a34a',
        valeur: c.prolongations.map((p) => `Du ${formatDateShort(p.ancienneFin)} au ${formatDateShort(p.nouvelleFin)}${p.par ? ` (par ${p.par})` : ''}`).join(' · ') }] : []),
      ...(c.resiliee ? [
        { icone: Ban, label: `Résilié le ${c.dateResiliation ? formatDateShort(c.dateResiliation) : ''}${c.resiliePar ? ` par ${c.resiliePar}` : ''}`, valeur: c.motifResiliation || 'Aucun motif', large: true, couleur: '#dc2626' }
      ] : [])
    ]
  })
  const motifSaisi = resilie ? resilie.motif.trim().length : 0
  const motifValide = motifSaisi >= MIN_MOTIF

  return (
    <div className="space-y-5">
      <PageHeader icon={FileText} sousModule="Collaborateurs & Contrats" titre="Contrats de travail" sousTitre="CDI, CDD et autres contrats, avec suivi des échéances."
        action={<>
          <ChampRecherche variant="glass" value={recherche} onChange={setRecherche} placeholder="Rechercher un employé…" />
          <BoutonBande anime icone={Plus} onClick={() => setModal(vide())}>Nouveau contrat</BoutonBande>
        </>} />

      {alertes > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          <AlertTriangle size={16} /> {alertes} contrat(s) arrivent à échéance dans moins de 30 jours : vous pouvez les prolonger.
        </div>
      )}

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-white/5">
                <th className="px-3 py-2.5">Employé</th><th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Début</th><th className="px-3 py-2.5">Fin</th>
                <th className="px-3 py-2.5 text-right">Salaire</th><th className="px-3 py-2.5">Statut</th>
                <th className="px-3 py-2.5 text-right">Action</th><th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {enrichis.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Aucun contrat enregistré.</td></tr>}
              {enrichis.filter((c) => correspond(recherche, c.employeNom, empNom(c.employeId))).map((c) => (
                <tr key={c.id} onClick={() => setDetailId(c.id)} className="group cursor-pointer hover:bg-sky-50/60 dark:hover:bg-white/5">
                  <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{c.employeNom || empNom(c.employeId)}</td>
                  <td className="px-3 py-2"><Badge tone="info">{TYPES_CONTRAT[c.type]?.label || c.type}</Badge></td>
                  <td className="px-3 py-2 text-gray-500">{formatDateShort(c.dateDebut)}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {c.resiliee ? `Résilié le ${formatDateShort(c.dateResiliation)}` : c.dateFin ? formatDateShort(c.dateFin) : '—'}
                    {(c.prolongations?.length || 0) > 0 && <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-px text-[10px] font-bold text-sky-700" title="Nombre de prolongations">prolongé {c.prolongations.length} fois</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{c.salaire ? formatMoney(c.salaire) : '—'}</td>
                  <td className="px-3 py-2">
                    {c.resiliee ? <span title={`Motif : ${c.motifResiliation || '—'}${c.resiliePar ? ` (par ${c.resiliePar})` : ''}`}><Badge tone="danger">Résilié</Badge></span>
                      : c.expire ? <Badge tone="danger">Expiré</Badge> : c.echeanceProche ? <Badge tone="warning">Échéance proche</Badge> : <Badge tone="success">Actif</Badge>}
                    {c.resiliee && c.motifResiliation && <p className="mt-0.5 max-w-[14rem] truncate text-[11px] text-gray-400" title={c.motifResiliation}>{c.motifResiliation}</p>}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {c.valide && (
                      <div className="flex justify-end gap-1.5">
                        {c.dateFin && (
                          <button type="button" onClick={() => setProlonge({ contrat: c, dateFin: '' })}
                            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-gradient-to-b from-white/90 to-sky-50/70 px-2.5 py-1 text-xs font-bold text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_12px_-8px_rgba(2,132,199,0.6)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-sky-300 active:scale-95">
                            <CalendarPlus size={13} aria-hidden="true" /> Prolonger
                          </button>
                        )}
                        <button type="button" onClick={() => setResilie({ contrat: c, motif: '', date: today })}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-gradient-to-b from-white/90 to-red-50/70 px-2.5 py-1 text-xs font-bold text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,1),0_6px_12px_-8px_rgba(220,38,38,0.6)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-red-300 active:scale-95">
                          <Ban size={13} aria-hidden="true" /> Résilier
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                    <button onClick={() => setModal({ ...c })} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"><Pencil size={14} /></button>
                    <button onClick={() => supprimer(c)} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DetailFiche fiche={contratDetail ? ficheContrat(contratDetail) : null} onClose={() => setDetailId(null)}
        actions={contratDetail ? [
          ...(contratDetail.valide && contratDetail.dateFin ? [{ label: 'Prolonger', icone: CalendarPlus, tone: 'succes', onClick: () => { setProlonge({ contrat: contratDetail, dateFin: '' }); setDetailId(null) } }] : []),
          ...(contratDetail.valide ? [{ label: 'Résilier', icone: Ban, tone: 'danger', onClick: () => { setResilie({ contrat: contratDetail, motif: '', date: today }); setDetailId(null) } }] : []),
          { label: 'Modifier', icone: Pencil, tone: 'primaire', onClick: () => { setModal({ ...contratDetail }); setDetailId(null) } }
        ] : []} />

      <ModalRh open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Modifier le contrat' : 'Nouveau contrat'}
        icone={FileText} intro="Le contrat de travail d'un employé : type, salaire et dates." onSave={save}>
        {modal && (<>
          <Champ label="Employé" icone={UserRound} required>
            <select value={modal.employeId} onChange={(e) => setModal({ ...modal, employeId: e.target.value })} className="input-base">
              <option value="">Sélectionner…</option>
              {employes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Type de contrat" icone={FileText}>
              <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value })} className="input-base">{Object.entries(TYPES_CONTRAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </Champ>
            <Champ label="Salaire (XOF)" icone={Banknote}>
              <input type="number" value={modal.salaire} onChange={(e) => setModal({ ...modal, salaire: e.target.value })} className="input-base" />
            </Champ>
            <Champ label="Date de début" icone={CalendarDays}>
              <input type="date" value={modal.dateDebut} onChange={(e) => setModal({ ...modal, dateDebut: e.target.value })} className="input-base" />
            </Champ>
            {modal.type !== 'cdi' && (
              <Champ label="Date de fin" icone={CalendarDays}>
                <input type="date" value={modal.dateFin} onChange={(e) => setModal({ ...modal, dateFin: e.target.value })} className="input-base" />
              </Champ>
            )}
          </div>
        </>)}
      </ModalRh>

      {/* Prolonger : nouvelle date de fin, avec des raccourcis (+1, +3, +6 mois, +1 an) à partir de la fin actuelle. */}
      <ModalRh open={!!prolonge} onClose={() => setProlonge(null)} title="Prolonger le contrat" libelleSave="Prolonger" icone={CalendarPlus}
        titreHero="Prolonger le contrat de :"
        intro={prolonge ? <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-white"><UserRound size={15} aria-hidden="true" />{prolonge.contrat.employeNom || empNom(prolonge.contrat.employeId)}</span> : ''}
        onSave={prolonger}>
        {prolonge && (<>
          <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-sm text-gray-600 backdrop-blur-md">
            <CalendarDays size={16} className="text-gray-400" aria-hidden="true" />
            {TYPES_CONTRAT[prolonge.contrat.type]?.label} · fin actuelle : <strong className="text-gray-800">{formatDateShort(prolonge.contrat.dateFin)}</strong>
          </p>
          <Champ label="Prolonger jusqu'au" icone={CalendarPlus} required>
            <input type="date" value={prolonge.dateFin} min={plusMois(prolonge.contrat.dateFin, 0)} onChange={(e) => setProlonge({ ...prolonge, dateFin: e.target.value })} className="input-base" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[[1, '+ 1 mois'], [3, '+ 3 mois'], [6, '+ 6 mois'], [12, '+ 1 an']].map(([n, label]) => {
                const cible = plusMois(prolonge.contrat.dateFin, n)
                return <button key={n} type="button" data-actif={prolonge.dateFin === cible} onClick={() => setProlonge({ ...prolonge, dateFin: cible })}
                  className="rh-pastille inline-flex items-center rounded-full px-3 py-1 text-xs font-bold">{label}</button>
              })}
            </div>
          </Champ>
        </>)}
      </ModalRh>

      {/* Résilier : fenêtre de justification, comme pour une suppression (motif obligatoire, tracé dans le Journal). */}
      <Modal open={!!resilie} onClose={() => setResilie(null)} size="sm" title="Motif de la résiliation" {...glassModalProps('#dc2626')}
        footer={<>
          <Button variant="ghost" onClick={() => setResilie(null)}>Annuler</Button>
          <Button disabled={!motifValide} onClick={resilier} style={{ backgroundColor: '#dc2626' }}><Ban size={15} /> Résilier le contrat</Button>
        </>}>
        <style>{`
          @keyframes resil-secoue { 0%, 70%, 100% { transform: rotate(0deg); } 76% { transform: rotate(-12deg); } 84% { transform: rotate(10deg); } 92% { transform: rotate(-6deg); } }
          @keyframes resil-halo { 0%, 100% { transform: scale(0.9); opacity: 0.2; } 50% { transform: scale(1.3); opacity: 0.4; } }
          @media (prefers-reduced-motion: reduce) { .resil-anim { animation: none !important; } }
        `}</style>
        {resilie && (
          <div className="params-verre space-y-3" style={{ '--p-accent': '#dc2626' }}>
            <div className="flex flex-col items-center gap-2.5 text-center">
              <div className="relative">
                <span aria-hidden="true" className="resil-anim absolute inset-0 rounded-2xl blur-md" style={{ background: '#dc2626', animation: 'resil-halo 2.6s ease-in-out infinite' }} />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl" style={icone3D('#dc2626')}>
                  <Ban size={26} className="resil-anim" style={{ animation: 'resil-secoue 3s ease-in-out infinite' }} />
                </span>
              </div>
              <p className="text-sm text-gray-600">Vous allez résilier le contrat de</p>
              <p className="-mt-1.5 max-w-full truncate rounded-full border border-white/80 bg-white/70 px-3.5 py-1 text-sm font-extrabold text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-md">
                {resilie.contrat.employeNom || empNom(resilie.contrat.employeId)} · {TYPES_CONTRAT[resilie.contrat.type]?.label}
              </p>
            </div>

            <div className="fg-tuile">
              <label htmlFor="motif-resiliation" className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-gray-500">
                <span>Motif (obligatoire)</span>
                <span className={`inline-flex items-center gap-1 normal-case tracking-normal tabular-nums ${motifValide ? 'text-green-600' : 'text-gray-400'}`}>
                  {motifValide ? <><Check size={12} aria-hidden="true" /> Prêt</> : `${motifSaisi}/${MIN_MOTIF} caractères`}
                </span>
              </label>
              <textarea id="motif-resiliation" autoFocus rows={3} value={resilie.motif} onChange={(e) => setResilie({ ...resilie, motif: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && motifValide) resilier() }}
                placeholder="Pourquoi résiliez-vous ce contrat ?" className="input-base resize-none" />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {MOTIFS_RESILIATION.map((m) => (
                  <button key={m} type="button" data-actif={resilie.motif === m} onClick={() => setResilie({ ...resilie, motif: m })}
                    className="rh-pastille inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold">{m}</button>
                ))}
              </div>
            </div>

            <div className="fg-tuile">
              <label htmlFor="date-resiliation" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gray-500">Date d'effet</label>
              <input id="date-resiliation" type="date" value={resilie.date} onChange={(e) => setResilie({ ...resilie, date: e.target.value })} className="input-base" />
            </div>

            <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
              <Info size={12} className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
              Le motif est enregistré dans le Journal avec votre nom. Le contrat reste dans la liste, marqué « Résilié ».
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
