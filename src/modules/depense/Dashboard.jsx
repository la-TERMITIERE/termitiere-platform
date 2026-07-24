// Dashboard Dépenses — budget alloué vs dépensé, par secteur, pour le mois en cours.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, Receipt, AlertTriangle, Repeat, Stamp, HeartHandshake, HandCoins, History } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import Button from '../../shared/ui/Button'
import Modal from '../../shared/ui/Modal'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { SECTEURS, MOIS_LABELS, STATUTS_DECAISSEMENT, sourceFinancementDefaut } from './data'
import { budgetSecteur, depenseNetteSecteurMois, totalDepenses, statutBudget, secteursEnAlerte, moisPrecedent, depensesEnCircuit, depensesProjetVersSecteurs, coutsMatieresBriqueterie } from './logic'
import { formatDateShort, genId, todayStr } from '../../utils/formatters'

const now = new Date()
const REAL_ANNEE = now.getFullYear()
const REAL_MOIS = now.getMonth() + 1

export default function Dashboard() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depensesReelles } = useCollection('depense_depenses')
  const { data: depensesProjet }  = useCollection('projet_depenses')
  const { data: projetsTous }     = useCollection('projets')
  const { data: inventairesBriq } = useCollection('evenementiel_inventaires')
  const { data: remboursementsPau } = useCollection('depense_pau_remboursements')
  // Dépenses de E-G.Pro (par secteur) + coût matières Briqueterie, inclus en lecture seule — pas de double saisie.
  const depenses = useMemo(() => [
    ...depensesReelles,
    ...depensesProjetVersSecteurs(depensesProjet, projetsTous),
    ...coutsMatieresBriqueterie(inventairesBriq)
  ], [depensesReelles, depensesProjet, projetsTous, inventairesBriq])
  const { user } = useAuth()
  const navigate = useNavigate()

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [reconduisant, setReconduisant] = useState(false)
  const [remboursement, setRemboursement] = useState(null) // { montant, date, motif } quand le modal est ouvert
  const [rembSaving, setRembSaving] = useState(false)
  const [histoRembOuvert, setHistoRembOuvert] = useState(false)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const parSecteur = useMemo(() => SECTEURS.map((s) => {
    const alloue = budgetSecteur(budgets, s.id, annee, mois)
    const depense = depenseNetteSecteurMois(depenses, remboursementsPau, s.id, annee, mois)
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return { ...s, alloue, depense, reste: alloue - depense, pct, statut: statutBudget(pct) }
  }), [budgets, depenses, remboursementsPau, annee, mois])

  const totalAlloue = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const secteursDepasses = parSecteur.filter((x) => x.statut.key === 'depasse').length

  const recentes = useMemo(() => {
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    return depenses.filter((d) => (d.date || '').startsWith(prefixe))
      .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
  }, [depenses, annee, mois])

  const alertes = useMemo(() => secteursEnAlerte(budgets, depenses, annee, mois, remboursementsPau), [budgets, depenses, annee, mois, remboursementsPau])
  const enAttenteCount = useMemo(() => depensesEnCircuit(depenses).length, [depenses])

  // Dette envers le PAU : ce que l'entreprise a reçu de sa poche (apport) MOINS ce qu'elle
  // lui a déjà restitué (remboursements) = ce qu'elle lui doit encore. Lecture seule côté
  // dépenses ; les remboursements, eux, sont une vraie écriture (collection dédiée).
  const financement = useMemo(() => {
    const estPau = (d) => (d.sourceFinancement || sourceFinancementDefaut) === 'pau'
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    const cumulPau = totalDepenses(depenses.filter(estPau))
    const cumulEntreprise = totalDepenses(depenses.filter((d) => !estPau(d)))
    const cumulRembourse = totalDepenses(remboursementsPau)
    const detteNette = cumulPau - cumulRembourse
    const moisPau = totalDepenses(depenses.filter((d) => estPau(d) && (d.date || '').startsWith(prefixe)))
    const moisRembourse = totalDepenses(remboursementsPau.filter((r) => (r.date || '').startsWith(prefixe)))
    const total = cumulPau + cumulEntreprise
    return { cumulPau, cumulEntreprise, cumulRembourse, detteNette, moisPau, moisRembourse, pct: total > 0 ? Math.round((cumulPau / total) * 100) : 0 }
  }, [depenses, remboursementsPau, annee, mois])

  const ouvrirRemboursement = () => setRemboursement({ montant: '', date: todayStr(), motif: '', secteurId: '' })
  const ouvrirRemboursement = () => setRemboursement({ montant: '', date: todayStr(), motif: '' })

  async function confirmerRemboursement() {
    if (!remboursement) return
    const montant = Number(remboursement.montant)
    if (!remboursement.montant || montant <= 0) return toast.error('Montant requis')
    if (montant > financement.detteNette) return toast.error(`Le montant dépasse la dette restante (${financement.detteNette.toLocaleString('fr-FR')} FCFA)`)
    if (!remboursement.date) return toast.error('Date requise')
    setRembSaving(true)
    try {
      const id = genId()
      await setItem('depense_pau_remboursements', id, {
        id, montant, date: remboursement.date, motif: remboursement.motif.trim(),
        enregistrePar: user?.nom || user?.login || '—', createdAt: Date.now()
      })
      await audit('depense', 'PAU_REMBOURSEMENT', `${montant.toLocaleString('fr-FR')} FCFA remboursés au PAU${remboursement.motif ? ' — ' + remboursement.motif.trim() : ''}`, { montant, date: remboursement.date })
      toast.success('Remboursement enregistré ✓')
      setRemboursement(null)
    } finally {
      setRembSaving(false)
    }
  }

  // Reconduction des dépenses récurrentes du mois précédent → uniquement visible sur le mois réel en cours.
  const estMoisCourant = annee === REAL_ANNEE && mois === REAL_MOIS
  const depensesAReconduire = useMemo(() => {
    if (!estMoisCourant) return []
    const prec = moisPrecedent(annee, mois)
    const prefixePrec = `${prec.annee}-${String(prec.mois).padStart(2, '0')}`
    const prefixeCourant = `${annee}-${String(mois).padStart(2, '0')}`
    const recurrentesPrec = depenses.filter((d) => d.recurrente && (d.date || '').startsWith(prefixePrec))
    return recurrentesPrec.filter((d) => !depenses.some((x) =>
      (x.date || '').startsWith(prefixeCourant) && x.secteurId === d.secteurId &&
      x.categorie === d.categorie && Number(x.montant) === Number(d.montant)
    ))
  }, [depenses, annee, mois, estMoisCourant])

  async function reconduireDepenses() {
    if (reconduisant || depensesAReconduire.length === 0) return
    setReconduisant(true)
    try {
      for (const d of depensesAReconduire) {
        const id = genId()
        await setItem('depense_depenses', id, {
          id, secteurId: d.secteurId, categorie: d.categorie, montant: d.montant,
          date: todayStr(), description: d.description || '', piece: null,
          recurrente: true, imprevue: false, statut: 'decaissee', enregistrePar: user?.nom || '—', createdAt: Date.now()
        })
      }
      await audit('depense', 'DEPENSE_RECONDUITE', `${depensesAReconduire.length} dépense(s) récurrente(s) reconduite(s)`, { count: depensesAReconduire.length })
      toast.success(`${depensesAReconduire.length} dépense(s) reconduite(s) ✓`)
    } finally {
      setReconduisant(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(180,83,9,0.35),0_8px_20px_-8px_rgba(180,83,9,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(180,83,9,0.85) 0%, rgba(120,53,15,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#B45309', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
          }}>
            <Wallet size={26} color="white" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-extrabold">Dépenses</h2>
          <p className="text-sm text-white/80">Suivi du budget alloué et des dépenses par secteur</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => changerMois(-1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronLeft size={16} />
        </button>
        <span className="text-lg font-extrabold text-gray-800">{MOIS_LABELS[mois - 1]} {annee}</span>
        <button onClick={() => changerMois(1)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* ── Demandes de décaissement à traiter ── */}
      {enAttenteCount > 0 && (
        <button onClick={() => navigate('/depense/autorisations')}
          className="group flex w-full items-center gap-3 rounded-2xl border-l-4 border-amber-500 bg-gradient-to-r from-amber-50/95 via-amber-50/70 to-amber-50/30 px-4 py-3.5 text-left shadow-[0_16px_36px_-16px_rgba(180,83,9,0.28)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_rgba(180,83,9,0.38)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 shadow-[0_4px_10px_-2px_rgba(180,83,9,0.5)]">
            <Stamp size={18} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-amber-900">{enAttenteCount} demande{enAttenteCount > 1 ? 's' : ''} de décaissement à traiter</p>
            <p className="text-xs text-amber-600">Cliquez pour ouvrir l'autorisation de décaissement</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">{enAttenteCount}</span>
          <ChevronRight size={18} className="shrink-0 text-amber-400 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {/* ── Alerte secteurs en attention / dépassement ── */}
      {alertes.length > 0 && (() => {
        const nbDepasses = alertes.filter((s) => s.statut.key === 'depasse').length
        const nbAttention = alertes.length - nbDepasses
        const ouvrirSecteur = (s) => navigate('/depense/recettes-depenses', { state: { openSecteurId: s.id, annee, mois } })
        return (
          <div className="group w-full rounded-2xl border-l-4 border-red-500 bg-gradient-to-r from-red-50/95 via-red-50/70 to-red-50/30 px-4 py-3.5 shadow-[0_16px_36px_-16px_rgba(220,38,38,0.28)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_rgba(220,38,38,0.38)]">
            <button onClick={() => navigate('/depense/recettes-depenses')} title="Voir tous les secteurs"
              className="flex w-full flex-wrap items-center gap-3 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500 shadow-[0_4px_10px_-2px_rgba(220,38,38,0.5)]">
                <AlertTriangle size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-red-900">{alertes.length} secteur{alertes.length > 1 ? 's' : ''} à surveiller</p>
                <p className="text-xs text-red-500">
                  {MOIS_LABELS[mois - 1]} {annee}
                  {nbDepasses > 0 && <span className="ml-1.5">· {nbDepasses} dépassé{nbDepasses > 1 ? 's' : ''}</span>}
                  {nbAttention > 0 && <span className="ml-1.5">· {nbAttention} en attention</span>}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">{alertes.length}</span>
              <ChevronRight size={18} className="shrink-0 text-red-400 transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {alertes.map((s) => {
                const depasse = s.statut.key === 'depasse'
                return (
                  <button key={s.id} onClick={() => ouvrirSecteur(s)} title="Voir le détail de ce secteur"
                    className={`rounded-xl border bg-white/80 px-3 py-2 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${depasse ? 'border-red-200 hover:border-red-300' : 'border-amber-200 hover:border-amber-300'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-xs font-bold ${depasse ? 'text-red-700' : 'text-amber-700'}`}>
                        {depasse ? '🔴' : '🟠'} {s.label}
                      </span>
                      <span className={`shrink-0 text-xs font-black ${depasse ? 'text-red-700' : 'text-amber-700'}`}>{s.pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-1.5 rounded-full ${depasse ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, s.pct)}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Dépenses récurrentes à reconduire ── */}
      {depensesAReconduire.length > 0 && (
        <button onClick={reconduireDepenses} disabled={reconduisant}
          className="group flex w-full items-center gap-3 rounded-2xl border-l-4 border-sky-500 bg-gradient-to-r from-sky-50/95 via-sky-50/70 to-sky-50/30 px-4 py-3.5 text-left shadow-[0_16px_36px_-16px_rgba(2,132,199,0.28)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_rgba(2,132,199,0.38)] disabled:opacity-60 disabled:hover:translate-y-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 shadow-[0_4px_10px_-2px_rgba(2,132,199,0.5)]">
            <Repeat size={18} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sky-900">{depensesAReconduire.length} dépense{depensesAReconduire.length > 1 ? 's' : ''} récurrente{depensesAReconduire.length > 1 ? 's' : ''} à reconduire ce mois-ci</p>
            <p className="text-xs text-sky-600">
              {reconduisant ? 'Reconduction en cours…' : 'Cliquez pour les ajouter automatiquement au mois en cours'}
            </p>
          </div>
          {!reconduisant && <ChevronRight size={18} className="shrink-0 text-sky-400 transition-transform group-hover:translate-x-0.5" />}
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Budget alloué" value={`${totalAlloue.toLocaleString('fr-FR')} FCFA`} icon={Receipt} accent="#B45309"
          onClick={() => navigate('/depense/recettes-depenses')} />
        <StatCard title="Total dépensé" value={`${totalDepense.toLocaleString('fr-FR')} FCFA`} icon={TrendingDown} accent="#dc2626"
          onClick={() => navigate('/depense/liste')} />
        <StatCard title="Reste global" value={`${(totalAlloue - totalDepense).toLocaleString('fr-FR')} FCFA`} icon={Wallet}
          accent={(totalAlloue - totalDepense) < 0 ? '#dc2626' : '#16a34a'} />
        <StatCard title="Secteurs en dépassement" value={secteursDepasses} icon={AlertTriangle}
          accent={secteursDepasses > 0 ? '#dc2626' : '#16a34a'}
          valueColor={secteursDepasses > 0 ? '#dc2626' : undefined}
          sub={secteursDepasses > 0 ? 'à surveiller' : 'tout va bien'} />
      </div>

      {/* Dette envers le PAU : ce que l'entreprise a reçu de sa poche (apport) et lui doit
          encore restituer. Le remboursement réduit la dette nette — traçabilité complète. */}
      {financement.cumulPau > 0 && (
        <div className="rounded-2xl border border-violet-200/60 bg-violet-50/60 px-4 py-3 shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
          <div className="flex flex-wrap items-center gap-2">
            <HeartHandshake size={18} className="text-violet-600" />
            <p className="font-bold text-violet-900">Dette envers le PAU</p>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-violet-700 shadow-sm">{financement.pct}% du financement total</span>
            <div className="ml-auto flex items-center gap-2">
              {financement.cumulRembourse > 0 && (
                <button onClick={() => setHistoRembOuvert((o) => !o)}
                  className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-600 shadow-sm hover:bg-violet-50">
                  <History size={12} /> Historique
                </button>
              )}
              {financement.detteNette > 0 && (
                <button onClick={ouvrirRemboursement}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_-2px_rgba(124,58,237,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-[0_7px_18px_-4px_rgba(124,58,237,0.7)]">
                  <HandCoins size={14} /> Rembourser
                </button>
              )}
            </div>
          </div>

          {/* Dette nette — l'info la plus importante, mise en avant */}
          <div className="mt-2 rounded-xl bg-white/70 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Dette restante (à restituer)</p>
            <p className={`text-2xl font-black ${financement.detteNette > 0 ? 'text-violet-800' : 'text-green-700'}`}>
              {financement.detteNette.toLocaleString('fr-FR')} FCFA
              {financement.detteNette === 0 && <span className="ml-2 text-sm font-bold text-green-600">✓ Soldée</span>}
            </p>
          </div>

          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Apporté (cumulé)</p>
              <p className="text-lg font-black text-violet-800">{financement.cumulPau.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Déjà remboursé (cumulé)</p>
              <p className="text-lg font-black text-green-700">{financement.cumulRembourse.toLocaleString('fr-FR')} FCFA</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Fonds propres de l'entreprise (cumulé)</p>
              <p className="text-lg font-black text-gray-700">{financement.cumulEntreprise.toLocaleString('fr-FR')} FCFA</p>
            </div>
          </div>

          {/* Barre de remboursement de la dette */}
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
            <div className="h-2 rounded-full bg-green-500" style={{ width: `${financement.cumulPau > 0 ? Math.min(100, Math.round((financement.cumulRembourse / financement.cumulPau) * 100)) : 0}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-violet-500">
            {financement.cumulPau > 0 ? Math.round((financement.cumulRembourse / financement.cumulPau) * 100) : 0}% de la dette déjà restituée. Basé sur la « Source de financement » de chaque dépense + les remboursements enregistrés.
          </p>

          {histoRembOuvert && remboursementsPau.length > 0 && (
            <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-xl bg-white/70 p-2">
              {[...remboursementsPau].sort((a, b) => (a.date < b.date ? 1 : -1)).map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="min-w-0">
                    <span className="font-bold text-gray-800">{Number(r.montant).toLocaleString('fr-FR')} FCFA</span>
                    {r.motif && <span className="ml-2 truncate text-gray-500">{r.motif}</span>}
                  </div>
                  <span className="shrink-0 text-[10px] text-gray-400">{formatDateShort(r.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal enregistrement d'un remboursement au PAU */}
      <Modal open={!!remboursement} onClose={() => setRemboursement(null)} size="sm" title="Rembourser le PAU"
        panelClassName="bg-gradient-to-br from-violet-200/85 via-violet-100/75 to-purple-300/75 backdrop-blur-2xl backdrop-saturate-200"
        footer={<><Button variant="outline" onClick={() => setRemboursement(null)} disabled={rembSaving}>Annuler</Button><Button onClick={confirmerRemboursement} loading={rembSaving}>Enregistrer</Button></>}>
        {remboursement && (
          <div className="space-y-3">
            <p className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-violet-700">
              Dette restante : <strong>{financement.detteNette.toLocaleString('fr-FR')} FCFA</strong>
            </p>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Montant remboursé (FCFA) <span className="text-red-500">*</span></label>
              <input type="number" min="0" max={financement.detteNette}
                value={remboursement.montant} onChange={(e) => setRemboursement((r) => ({ ...r, montant: e.target.value }))}
                placeholder="0" className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Date <span className="text-red-500">*</span></label>
              <input type="date" value={remboursement.date} onChange={(e) => setRemboursement((r) => ({ ...r, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Motif / précision</label>
              <input value={remboursement.motif} onChange={(e) => setRemboursement((r) => ({ ...r, motif: e.target.value }))}
                placeholder="ex : Remboursement partiel sur trésorerie du mois"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            </div>
          </div>
        )}
      </Modal>

      <Card title="Répartition par secteur">
        <div className="space-y-2.5">
          {parSecteur.map((s) => (
            <div key={s.id} className="rounded-2xl border border-gray-200/60 bg-white/60 p-3.5 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150 transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(26,26,26,0.18)]"
              style={{ borderLeft: `4px solid ${s.color}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-gray-800">{s.label}</span>
                <Badge tone={s.statut.tone}>{s.statut.label}</Badge>
                <div className="ml-auto text-right text-sm text-gray-500">
                  <strong className="text-gray-800">{s.depense.toLocaleString('fr-FR')}</strong>
                  <span className="text-gray-400"> / {s.alloue.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-2.5 rounded-full transition-all ${s.statut.key === 'depasse' ? 'bg-red-500' : s.statut.key === 'attention' ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(s.pct, 100)}%` }}
                  />
                </div>
                <span className={`w-10 shrink-0 text-right text-xs font-bold ${s.statut.key === 'depasse' ? 'text-red-600' : s.statut.key === 'attention' ? 'text-amber-600' : 'text-green-600'}`}>
                  {s.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Dépenses récentes">
        {recentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Aucune dépense enregistrée ce mois.</p>
        ) : (
          <div className="space-y-1">
            {recentes.map((d) => {
              const secteur = SECTEURS.find((s) => s.id === d.secteurId)
              const statut = STATUTS_DECAISSEMENT[d.statut] || STATUTS_DECAISSEMENT.decaissee
              return (
                <div key={d.id} className="flex items-center justify-between rounded-2xl border border-gray-200/60 bg-white/50 px-3 py-2 text-sm shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
                  <div>
                    <span className="font-semibold">{secteur?.label || d.secteurId}</span>
                    <span className="ml-2 text-xs text-gray-400">{d.description || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statut.tone}>{statut.label}</Badge>
                    <span className="text-xs text-gray-400">{formatDateShort(d.date)}</span>
                    <span className="font-semibold text-gray-800">{Number(d.montant).toLocaleString('fr-FR')} FCFA</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
