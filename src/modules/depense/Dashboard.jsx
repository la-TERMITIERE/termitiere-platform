// Dashboard Dépenses — budget alloué vs dépensé, par secteur, pour le mois en cours.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Wallet, TrendingDown, Receipt, AlertTriangle, Repeat, Stamp } from 'lucide-react'
import StatCard from '../../shared/ui/StatCard'
import Card from '../../shared/ui/Card'
import Badge from '../../shared/ui/Badge'
import { useCollection } from '../../hooks/useFirestore'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { setItem } from '../../core/db'
import { audit } from '../../core/audit'
import { toast } from '../../core/notifications'
import { SECTEURS, MOIS_LABELS, STATUTS_DECAISSEMENT } from './data'
import { budgetSecteur, depensesSecteurMois, totalDepenses, statutBudget, secteursEnAlerte, moisPrecedent, depensesEnCircuit } from './logic'
import { formatDateShort, genId, todayStr } from '../../utils/formatters'

const now = new Date()
const REAL_ANNEE = now.getFullYear()
const REAL_MOIS = now.getMonth() + 1

export default function Dashboard() {
  const { data: budgets }  = useCollection('depense_budgets')
  const { data: depenses } = useCollection('depense_depenses')
  const { user } = useAuth()
  const navigate = useNavigate()

  const [annee, setAnnee] = useState(now.getFullYear())
  const [mois, setMois]   = useState(now.getMonth() + 1)
  const [reconduisant, setReconduisant] = useState(false)

  const changerMois = (delta) => {
    let m = mois + delta, a = annee
    if (m < 1) { m = 12; a -= 1 }
    if (m > 12) { m = 1; a += 1 }
    setMois(m); setAnnee(a)
  }

  const parSecteur = useMemo(() => SECTEURS.map((s) => {
    const alloue = budgetSecteur(budgets, s.id, annee, mois)
    const listeDep = depensesSecteurMois(depenses, s.id, annee, mois)
    const depense = totalDepenses(listeDep)
    const pct = alloue > 0 ? Math.round((depense / alloue) * 100) : (depense > 0 ? 100 : 0)
    return { ...s, alloue, depense, reste: alloue - depense, pct, statut: statutBudget(pct) }
  }), [budgets, depenses, annee, mois])

  const totalAlloue = parSecteur.reduce((s, x) => s + x.alloue, 0)
  const totalDepense = parSecteur.reduce((s, x) => s + x.depense, 0)
  const secteursDepasses = parSecteur.filter((x) => x.statut.key === 'depasse').length

  const recentes = useMemo(() => {
    const prefixe = `${annee}-${String(mois).padStart(2, '0')}`
    return depenses.filter((d) => (d.date || '').startsWith(prefixe))
      .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8)
  }, [depenses, annee, mois])

  const alertes = useMemo(() => secteursEnAlerte(budgets, depenses, annee, mois), [budgets, depenses, annee, mois])
  const enAttenteCount = useMemo(() => depensesEnCircuit(depenses).length, [depenses])

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
      <div className="relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_24px_-12px_rgba(0,0,0,0.45),0_28px_56px_-18px_rgba(79,70,229,0.35),0_8px_20px_-8px_rgba(79,70,229,0.2),inset_0_1px_0_0_rgba(255,255,255,0.35)] backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.85) 0%, rgba(55,48,163,0.8) 100%)' }}>
        <div style={{ position: 'relative', flexShrink: 0, width: 64, height: 64 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#4F46E5', boxShadow: '0 0 0 3px #ffffff, 0 0 12px 4px #ffffff55'
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
          className="w-full rounded-2xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 text-left text-sm shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-indigo-50/80">
          <p className="flex items-center gap-2 font-bold text-indigo-800">
            <Stamp size={16} /> {enAttenteCount} demande(s) de décaissement à traiter
          </p>
          <p className="mt-0.5 text-xs text-indigo-600">Cliquez pour ouvrir l'autorisation de décaissement</p>
        </button>
      )}

      {/* ── Alerte secteurs en attention / dépassement ── */}
      {alertes.length > 0 && (
        <div className="rounded-2xl border-2 border-red-300/70 bg-red-50/60 px-4 py-3 text-sm shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150">
          <p className="flex items-center gap-2 font-bold text-red-800">
            <AlertTriangle size={16} /> {alertes.length} secteur(s) à surveiller — {MOIS_LABELS[mois - 1]} {annee}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alertes.map((s) => (
              <span key={s.id} className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                s.statut.key === 'depasse' ? 'border-red-300 bg-red-100 text-red-800' : 'border-amber-300 bg-amber-100 text-amber-800'
              }`}>
                {s.statut.key === 'depasse' ? '🔴' : '🟠'} {s.label} — {s.pct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Dépenses récurrentes à reconduire ── */}
      {depensesAReconduire.length > 0 && (
        <button onClick={reconduireDepenses} disabled={reconduisant}
          className="w-full rounded-2xl border border-indigo-200/60 bg-indigo-50/60 px-4 py-3 text-left text-sm shadow-[0_16px_36px_-16px_rgba(26,26,26,0.14)] backdrop-blur-xl backdrop-saturate-150 transition-colors hover:bg-indigo-50/80 disabled:opacity-60">
          <p className="flex items-center gap-2 font-bold text-indigo-800">
            <Repeat size={16} /> {depensesAReconduire.length} dépense(s) récurrente(s) à reconduire ce mois-ci
          </p>
          <p className="mt-0.5 text-xs text-indigo-600">
            {reconduisant ? 'Reconduction en cours…' : 'Cliquez pour les ajouter automatiquement au mois en cours'}
          </p>
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Budget alloué" value={`${totalAlloue.toLocaleString('fr-FR')} FCFA`} icon={Receipt} accent="#4F46E5"
          onClick={() => navigate('/depense/budgets')} />
        <StatCard title="Total dépensé" value={`${totalDepense.toLocaleString('fr-FR')} FCFA`} icon={TrendingDown} accent="#dc2626"
          onClick={() => navigate('/depense/liste')} />
        <StatCard title="Reste global" value={`${(totalAlloue - totalDepense).toLocaleString('fr-FR')} FCFA`} icon={Wallet}
          accent={(totalAlloue - totalDepense) < 0 ? '#dc2626' : '#16a34a'} />
        <StatCard title="Secteurs en dépassement" value={secteursDepasses} icon={AlertTriangle}
          accent={secteursDepasses > 0 ? '#dc2626' : '#16a34a'}
          valueColor={secteursDepasses > 0 ? '#dc2626' : undefined}
          sub={secteursDepasses > 0 ? 'à surveiller' : 'tout va bien'} />
      </div>

      <Card title="Répartition par secteur">
        <div className="space-y-3">
          {parSecteur.map((s) => (
            <div key={s.id} className="rounded-2xl border border-gray-200/60 bg-white/50 p-3 shadow-[0_10px_24px_-14px_rgba(26,26,26,0.10)] backdrop-blur-md backdrop-saturate-150">
              <div className="flex flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="font-semibold text-gray-800">{s.label}</span>
                <Badge tone={s.statut.tone}>{s.statut.label}</Badge>
                <div className="ml-auto text-sm text-gray-500">
                  <strong className="text-gray-800">{s.depense.toLocaleString('fr-FR')}</strong> / {s.alloue.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${s.statut.key === 'depasse' ? 'bg-red-500' : s.statut.key === 'attention' ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(s.pct, 100)}%` }}
                />
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
